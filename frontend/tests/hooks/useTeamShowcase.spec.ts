import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { useTeamShowcase } from '@/hooks/useTeamShowcase';
import type { TeamImageRecord } from '@/types/image';

const { fetchTeamHistory } = vi.hoisted(() => ({ fetchTeamHistory: vi.fn() }));
vi.mock('@/services/api/historyApi', () => ({ fetchTeamHistory }));

function record(index: number): TeamImageRecord {
  return {
    id: `team-${index}.png`,
    createdAt: '2026-10-29T00:00:00.000Z',
    prompt: `作品 ${index}`,
    model: 'gpt-image-2',
    width: 1024,
    height: 1024,
    isPublic: false,
    ownerName: 'alice',
  };
}

beforeEach(() => {
  fetchTeamHistory.mockReset();
});

it('shows the newest shared work, at most eighteen pieces', async () => {
  fetchTeamHistory.mockResolvedValue({ records: Array.from({ length: 24 }, (_, i) => record(i)) });
  const { result } = renderHook(() => useTeamShowcase(true));

  await waitFor(() => expect(result.current).toHaveLength(18));
  expect(result.current[0]?.id).toBe('team-0.png');
});

it('keeps only the newest piece of a prompt shared more than once', async () => {
  fetchTeamHistory.mockResolvedValue({
    records: [record(1), { ...record(2), prompt: '作品 1' }, record(3)],
  });
  const { result } = renderHook(() => useTeamShowcase(true));

  await waitFor(() => expect(result.current).toHaveLength(2));
  expect(result.current.map((item) => item.id)).toEqual(['team-1.png', 'team-3.png']);
});

it('stays empty for signed-out visitors and when loading fails', async () => {
  const signedOut = renderHook(() => useTeamShowcase(false));
  expect(signedOut.result.current).toEqual([]);
  expect(fetchTeamHistory).not.toHaveBeenCalled();

  fetchTeamHistory.mockRejectedValue(new Error('offline'));
  const failed = renderHook(() => useTeamShowcase(true));
  await waitFor(() => expect(fetchTeamHistory).toHaveBeenCalledTimes(1));
  expect(failed.result.current).toEqual([]);
});

it('leaves out text-fix edits, which only make sense on their source image', async () => {
  fetchTeamHistory.mockResolvedValue({
    records: [
      {
        ...record(1),
        prompt: '请只修改图中的文字，画面、构图、配色和字体风格保持不变：把“A”改为“B”。',
      },
      record(2),
    ],
  });
  const { result } = renderHook(() => useTeamShowcase(true));

  await waitFor(() => expect(result.current).toHaveLength(1));
  expect(result.current[0]?.id).toBe('team-2.png');
});
