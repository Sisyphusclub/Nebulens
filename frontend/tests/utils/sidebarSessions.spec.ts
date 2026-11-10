import { describe, expect, it } from 'vitest';

import type { GroupedBatch } from '@/hooks/useImageHistory';
import type { GenerationSession } from '@/hooks/useGenerationSessions';
import { sidebarSessions } from '@/utils/sidebarSessions';

function batch(batchId: string, createdAt: string, prompt = batchId): GroupedBatch {
  return {
    batchId,
    createdAt,
    prompt,
    model: 'gpt-image-2',
    entries: [
      {
        record: {
          id: `${batchId}.png`,
          batchId,
          createdAt,
          prompt,
          model: 'gpt-image-2',
          width: 1024,
          height: 1024,
          isPublic: false,
        },
        imageUrl: `/api/outputs/${batchId}.png`,
      },
    ],
    settings: {
      prompt,
      model: 'gpt-image-2',
      count: 1,
      aspectRatio: '1:1',
      resolution: 'standard',
      isPublic: false,
      referenceIds: [],
    },
  };
}

function session(
  id: string,
  title: string,
  batchIds: string[],
  updatedAt = '2026-10-01T00:00:00.000Z',
): GenerationSession {
  return {
    id,
    title,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt,
    batchIds,
    transientTasks: [],
  };
}

describe('sidebarSessions', () => {
  it("lists only sessions owning the user's batches, plus the open one, newest first", () => {
    const batches = [
      batch('b1', '2026-10-28T01:00:00.000Z'),
      batch('b2', '2026-10-28T02:00:00.000Z'),
    ];
    const sessions = [
      session('older', '奶茶海报', ['b1'], '2026-10-28T01:00:00.000Z'),
      session('newer', '产品图', ['b2'], '2026-10-28T02:00:00.000Z'),
      session('other-account', '别人的会话', ['someone-else'], '2026-10-29T00:00:00.000Z'),
      session('open', '刚打开的会话', [], '2026-10-27T00:00:00.000Z'),
    ];

    expect(sidebarSessions(sessions, batches, 'open')).toEqual([
      { id: 'newer', title: '产品图', thumbnail: '/api/outputs/b2.png' },
      { id: 'older', title: '奶茶海报', thumbnail: '/api/outputs/b1.png' },
      { id: 'open', title: '刚打开的会话' },
    ]);
  });

  it('names a session titled after a text fix by its own prompt', () => {
    const batches = [
      batch('fix', '2026-10-28T02:00:00.000Z', '请只修改图中的文字：把“咖啡”改成“珈琲”'),
      batch('own', '2026-10-28T01:00:00.000Z', '清晨窗边的咖啡'),
    ];
    const sessions = [session('s1', '请只修改图中的文字：把“咖啡”改成“珈琲”', ['own', 'fix'])];

    expect(sidebarSessions(sessions, batches, null)).toEqual([
      { id: 's1', title: '清晨窗边的咖啡', thumbnail: '/api/outputs/fix.png' },
    ]);
  });

  it('covers each session with its newest image, skipping batches that made none', () => {
    const failed = { ...batch('failed', '2026-10-28T03:00:00.000Z'), entries: [] };
    const batches = [
      batch('first', '2026-10-28T01:00:00.000Z'),
      batch('latest', '2026-10-28T02:00:00.000Z'),
      failed,
    ];
    const sessions = [
      session('s1', '海边日落', ['first', 'latest', 'failed']),
      session('open', '刚打开的会话', []),
    ];

    const items = sidebarSessions(sessions, batches, 'open');

    expect(items.find((item) => item.id === 's1')?.thumbnail).toBe('/api/outputs/latest.png');
    expect(items.find((item) => item.id === 'open')?.thumbnail).toBeUndefined();
  });

  it('caps the list', () => {
    const batches = [batch('b1', '2026-10-28T01:00:00.000Z')];
    const sessions = Array.from({ length: 5 }, (_, index) =>
      session(`s${index}`, `会话${index}`, ['b1']),
    );

    expect(sidebarSessions(sessions, batches, null, 3)).toHaveLength(3);
  });
});
