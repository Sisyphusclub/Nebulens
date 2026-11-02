import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted((): { userId: string | null } => ({ userId: 'user-a' }));
const api = vi.hoisted(() => ({
  fetchHistory: vi.fn(),
  deleteHistoryBatch: vi.fn(),
  deleteHistoryRecord: vi.fn(),
  deleteHistoryRecords: vi.fn(),
  updateHistoryRecord: vi.fn(),
  updateHistoryRecords: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: auth.userId === null ? null : { id: auth.userId },
    isAuthenticated: auth.userId !== null,
    isLoading: false,
  }),
}));
vi.mock('@/services/api/historyApi', () => api);

import { resetImageHistoryForTests, useImageHistory } from '@/hooks/useImageHistory';

const record = (id: string) => ({
  id,
  createdAt: '2026-08-28T00:00:00.000Z',
  prompt: id,
  model: 'gpt-image-2',
  width: 1024,
  height: 1024,
  isPublic: false,
});

beforeEach(() => {
  auth.userId = 'user-a';
  resetImageHistoryForTests();
  api.fetchHistory.mockReset();
});

describe('useImageHistory', () => {
  it('hydrates the same account again after logout and login', async () => {
    api.fetchHistory
      .mockResolvedValueOnce([record('before-logout.png')])
      .mockResolvedValueOnce([record('after-relogin.png')]);
    const { result, rerender } = renderHook(() => useImageHistory());

    await waitFor(() => expect(result.current.records[0]?.id).toBe('before-logout.png'));

    auth.userId = null;
    rerender();
    expect(result.current.records).toEqual([]);
    expect(result.current.isHydrated).toBe(false);

    auth.userId = 'user-a';
    rerender();

    await waitFor(() => expect(api.fetchHistory).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.records[0]?.id).toBe('after-relogin.png'));
    expect(result.current.isHydrated).toBe(true);
  });

  it('discards a previous account response that arrives after the next account', async () => {
    let resolveA!: (value: ReturnType<typeof record>[]) => void;
    let resolveB!: (value: ReturnType<typeof record>[]) => void;
    api.fetchHistory
      .mockImplementationOnce(
        () => new Promise<ReturnType<typeof record>[]>((resolve) => (resolveA = resolve)),
      )
      .mockImplementationOnce(
        () => new Promise<ReturnType<typeof record>[]>((resolve) => (resolveB = resolve)),
      );
    const { result, rerender } = renderHook(() => useImageHistory());
    await waitFor(() => expect(api.fetchHistory).toHaveBeenCalledTimes(1));
    expect(result.current.isHydrated).toBe(false);

    auth.userId = 'user-b';
    rerender();
    await waitFor(() => expect(api.fetchHistory).toHaveBeenCalledTimes(2));
    act(() => resolveB([record('b.png')]));
    await waitFor(() => expect(result.current.records[0]?.id).toBe('b.png'));
    expect(result.current.isHydrated).toBe(true);

    act(() => resolveA([record('a.png')]));
    expect(result.current.records.map((item) => item.id)).toEqual(['b.png']);

    auth.userId = null;
    rerender();
    expect(result.current.records).toEqual([]);
    expect(result.current.isHydrated).toBe(false);
  });
});

describe('analysis polling', () => {
  it('re-fetches quietly while a recent image waits for analysis, then stops', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const now = new Date().toISOString();
      const pending = { ...record('pending.png'), createdAt: now, analysisStatus: 'pending' };
      const done = {
        ...pending,
        analysisStatus: 'done',
        textCheck: { status: 'passed', segments: [] },
      };
      api.fetchHistory.mockResolvedValueOnce([pending]).mockResolvedValue([done]);
      const { result } = renderHook(() => useImageHistory());
      await waitFor(() => expect(result.current.records[0]?.analysisStatus).toBe('pending'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      await waitFor(() => expect(result.current.records[0]?.analysisStatus).toBe('done'));
      expect(result.current.isHydrating).toBe(false);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });
      expect(api.fetchHistory).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('checks back after a new image is added so its analysis can be picked up', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.fetchHistory.mockResolvedValue([]);
      const { result } = renderHook(() => useImageHistory());
      await waitFor(() => expect(api.fetchHistory).toHaveBeenCalledTimes(1));

      act(() => {
        result.current.add({ ...record('fresh.png'), createdAt: new Date().toISOString() });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      expect(api.fetchHistory).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
