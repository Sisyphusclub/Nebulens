import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ fetchOwnImageMatches: vi.fn() }));
vi.mock('@/services/api/historyApi', () => api);

import { useOwnImageSearch } from '@/hooks/useOwnImageSearch';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  api.fetchOwnImageMatches.mockReset();
});
afterEach(() => vi.useRealTimers());

it('asks the API once typing pauses and keeps the ranked matches', async () => {
  api.fetchOwnImageMatches.mockResolvedValue([{ id: 'a.png', reason: '同为海报' }]);
  const { result } = renderHook(() => useOwnImageSearch('奶茶新品海报', true));

  expect(result.current.loading).toBe(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });

  await waitFor(() => expect(result.current.items).toEqual([{ id: 'a.png', reason: '同为海报' }]));
  expect(api.fetchOwnImageMatches).toHaveBeenCalledWith(
    '奶茶新品海报',
    expect.any(AbortSignal),
    12,
  );
});

it('stays idle while disabled', async () => {
  const { result } = renderHook(() => useOwnImageSearch('奶茶新品海报', false));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
  expect(result.current.active).toBe(false);
  expect(api.fetchOwnImageMatches).not.toHaveBeenCalled();
});
