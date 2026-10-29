import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ fetchTeamRecommendations: vi.fn() }));
vi.mock('@/services/api/historyApi', () => api);

import { useTeamRecommendations } from '@/hooks/useTeamRecommendations';

const item = (id: string) => ({
  record: {
    id,
    createdAt: '2026-10-28T00:00:00.000Z',
    prompt: id,
    model: 'gpt-image-2',
    width: 1024,
    height: 1024,
    isPublic: false,
  },
  ownerName: 'alice',
  reason: '同为海报',
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  api.fetchTeamRecommendations.mockReset();
});
afterEach(() => vi.useRealTimers());

it('waits for typing to pause before asking for recommendations', async () => {
  api.fetchTeamRecommendations.mockResolvedValue([item('a.png')]);
  const { result, rerender } = renderHook(({ query }) => useTeamRecommendations(query, true), {
    initialProps: { query: '奶茶' },
  });
  rerender({ query: '奶茶新品' });
  rerender({ query: '奶茶新品海报' });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });

  await waitFor(() => expect(result.current.items).toHaveLength(1));
  expect(api.fetchTeamRecommendations).toHaveBeenCalledTimes(1);
  expect(api.fetchTeamRecommendations).toHaveBeenCalledWith(
    '奶茶新品海报',
    expect.any(AbortSignal),
  );
});

it('stays empty for short queries, signed-out users and failed requests', async () => {
  const { result, rerender } = renderHook(
    ({ query, enabled }) => useTeamRecommendations(query, enabled),
    { initialProps: { query: '海报', enabled: true } },
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
  expect(api.fetchTeamRecommendations).not.toHaveBeenCalled();

  rerender({ query: '奶茶新品海报', enabled: false });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
  expect(api.fetchTeamRecommendations).not.toHaveBeenCalled();

  api.fetchTeamRecommendations.mockRejectedValue(new Error('offline'));
  rerender({ query: '奶茶新品海报', enabled: true });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
  await waitFor(() => expect(api.fetchTeamRecommendations).toHaveBeenCalledTimes(1));
  expect(result.current.items).toEqual([]);
});
