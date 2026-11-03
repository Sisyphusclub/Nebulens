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

describe('removing an image with undo', () => {
  it('hides the image at once but deletes it only when the undo window closes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.fetchHistory.mockResolvedValueOnce([record('keep.png'), record('gone.png')]);
    api.deleteHistoryRecord.mockReset().mockResolvedValue(undefined);
    const committed = vi.fn();
    const { result } = renderHook(() => useImageHistory());
    await waitFor(() => expect(result.current.records).toHaveLength(2));

    act(() => {
      result.current.removeWithUndo('gone.png', { onCommitted: committed });
    });
    expect(result.current.records.map((item) => item.id)).toEqual(['keep.png']);
    expect(result.current.pendingRemovalIds).toEqual(['gone.png']);
    expect(api.deleteHistoryRecord).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(api.deleteHistoryRecord).toHaveBeenCalledWith('gone.png');
    await waitFor(() => expect(committed).toHaveBeenCalledOnce());
    expect(result.current.pendingRemovalIds).toEqual([]);
    vi.useRealTimers();
  });

  it('brings the image back untouched when undone in time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.fetchHistory.mockResolvedValueOnce([record('oops.png')]);
    api.deleteHistoryRecord.mockReset().mockResolvedValue(undefined);
    const { result } = renderHook(() => useImageHistory());
    await waitFor(() => expect(result.current.records).toHaveLength(1));

    let undo!: () => boolean;
    act(() => {
      undo = result.current.removeWithUndo('oops.png');
    });
    act(() => {
      expect(undo()).toBe(true);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(result.current.records.map((item) => item.id)).toEqual(['oops.png']);
    expect(api.deleteHistoryRecord).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('restores the image and reports the failure when the delete does not go through', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.fetchHistory.mockResolvedValueOnce([record('stuck.png')]);
    api.deleteHistoryRecord.mockReset().mockRejectedValue(new Error('删除失败'));
    const failed = vi.fn();
    const { result } = renderHook(() => useImageHistory());
    await waitFor(() => expect(result.current.records).toHaveLength(1));

    act(() => {
      result.current.removeWithUndo('stuck.png', { onFailed: failed });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    await waitFor(() => expect(failed).toHaveBeenCalledOnce());
    expect(result.current.records.map((item) => item.id)).toEqual(['stuck.png']);
    vi.useRealTimers();
  });

  it('sends a pending delete before the page goes away, so leaving does not undo it', async () => {
    api.fetchHistory.mockResolvedValueOnce([record('leaving.png')]);
    api.deleteHistoryRecord.mockReset().mockResolvedValue(undefined);
    const { result } = renderHook(() => useImageHistory());
    await waitFor(() => expect(result.current.records).toHaveLength(1));

    act(() => {
      result.current.removeWithUndo('leaving.png');
    });
    window.dispatchEvent(new Event('pagehide'));

    expect(api.deleteHistoryRecord).toHaveBeenCalledWith('leaving.png', { keepalive: true });
  });
});
