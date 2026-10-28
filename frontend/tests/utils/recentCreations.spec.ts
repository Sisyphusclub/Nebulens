import { describe, expect, it } from 'vitest';

import type { GroupedBatch } from '@/hooks/useImageHistory';
import type { GenerationSession } from '@/hooks/useGenerationSessions';
import { recentCreations } from '@/utils/recentCreations';

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

function session(id: string, title: string, batchIds: string[]): GenerationSession {
  return {
    id,
    title,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    batchIds,
    transientTasks: [],
  };
}

describe('recentCreations', () => {
  it('keeps one card per session, newest first, using its latest image and title', () => {
    const batches = [
      batch('b3', '2026-10-28T03:00:00.000Z'),
      batch('b2', '2026-10-28T02:00:00.000Z'),
      batch('b1', '2026-10-28T01:00:00.000Z'),
    ];
    const sessions = [session('s1', '奶茶海报', ['b1', 'b3']), session('s2', '产品图', ['b2'])];

    expect(recentCreations(batches, sessions)).toEqual([
      {
        key: 's1',
        sessionId: 's1',
        batch: batches[0],
        title: '奶茶海报',
        imageUrl: '/api/outputs/b3.png',
      },
      {
        key: 's2',
        sessionId: 's2',
        batch: batches[1],
        title: '产品图',
        imageUrl: '/api/outputs/b2.png',
      },
    ]);
  });

  it('falls back to the batch prompt for batches no session owns and stops at the limit', () => {
    const batches = [
      batch('b4', '2026-10-28T04:00:00.000Z', '雨夜城市'),
      batch('b3', '2026-10-28T03:00:00.000Z'),
      batch('b2', '2026-10-28T02:00:00.000Z'),
      batch('b1', '2026-10-28T01:00:00.000Z'),
    ];

    const cards = recentCreations(batches, [], 3);

    expect(cards.map((card) => card.key)).toEqual(['batch:b4', 'batch:b3', 'batch:b2']);
    expect(cards[0]).toMatchObject({ sessionId: null, title: '雨夜城市' });
  });

  it('skips batches without an image', () => {
    const empty = { ...batch('b2', '2026-10-28T02:00:00.000Z'), entries: [] };
    expect(recentCreations([empty, batch('b1', '2026-10-28T01:00:00.000Z')], [])).toHaveLength(1);
  });
});
