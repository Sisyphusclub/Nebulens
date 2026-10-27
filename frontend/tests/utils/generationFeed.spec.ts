import { describe, expect, it } from 'vitest';

import type { GenerationSession, PersistedGenerationTask } from '@/hooks/useGenerationSessions';
import type { GroupedBatch } from '@/hooks/useImageHistory';
import type { GenerationSettingsSnapshot } from '@/types/image';
import {
  buildSessionFeed,
  LEGACY_PENDING_TASK_ERROR,
  sameFeed,
  type FeedItem,
} from '@/utils/generationFeed';

function settings(prompt: string): GenerationSettingsSnapshot {
  return {
    prompt,
    model: 'gpt-image-2',
    count: 1,
    aspectRatio: '1:1',
    resolution: 'standard',
    isPublic: false,
    referenceIds: [],
  };
}

function historyBatch(batchId: string, createdAt: string): GroupedBatch {
  return {
    batchId,
    createdAt,
    prompt: batchId,
    model: 'gpt-image-2',
    entries: [],
    settings: settings(batchId),
  };
}

function session(overrides: Partial<GenerationSession>): GenerationSession {
  return {
    id: 'session-1',
    title: '会话标题',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-05T00:00:00.000Z',
    batchIds: [],
    transientTasks: [],
    ...overrides,
  };
}

const legacySettings = (pending: GenerationSession) => settings(pending.title);

describe('buildSessionFeed', () => {
  it('orders history and transient items chronologically', () => {
    const task: PersistedGenerationTask = {
      id: 'pending-a',
      createdAt: '2026-07-02T00:00:00.000Z',
      settings: settings('pending'),
      error: 'failed',
    };
    const { feed, legacyPendingTasks } = buildSessionFeed({
      session: session({
        batchIds: ['batch-old', 'pending-a', 'batch-new'],
        transientTasks: [task],
      }),
      historyBatches: [
        historyBatch('batch-new', '2026-07-03T00:00:00.000Z'),
        historyBatch('batch-old', '2026-07-01T00:00:00.000Z'),
      ],
      inMemoryItems: [],
      legacySettings,
    });

    expect(feed.map((item) => item.id)).toEqual(['batch-old', 'pending-a', 'batch-new']);
    expect(feed[1]?.error).toBe('failed');
    expect(legacyPendingTasks).toEqual([]);
  });

  it('ignores history batches that are not part of the session', () => {
    const { feed } = buildSessionFeed({
      session: session({ batchIds: ['pending-x'] }),
      historyBatches: [],
      inMemoryItems: [
        {
          id: 'pending-x',
          createdAt: '2026-07-02T00:00:00.000Z',
          entries: [],
          settings: settings('x'),
        },
        {
          id: 'other',
          createdAt: '2026-07-02T00:00:00.000Z',
          entries: [],
          settings: settings('o'),
        },
      ],
      legacySettings,
    });

    expect(feed.map((item) => item.id)).toEqual(['pending-x']);
  });

  it('prefers in-memory items over persisted transient tasks with the same id', () => {
    const inMemory: FeedItem = {
      id: 'pending-a',
      createdAt: '2026-07-02T00:00:00.000Z',
      entries: [],
      settings: settings('live'),
    };
    const { feed } = buildSessionFeed({
      session: session({
        batchIds: ['pending-a'],
        transientTasks: [
          {
            id: 'pending-a',
            createdAt: '2026-07-02T00:00:00.000Z',
            settings: settings('stale'),
            error: 'stale',
          },
        ],
      }),
      historyBatches: [],
      inMemoryItems: [inMemory],
      legacySettings,
    });

    expect(feed).toEqual([inMemory]);
  });

  it('lets a persisted history batch win over an in-memory item with the same id', () => {
    const { feed } = buildSessionFeed({
      session: session({ batchIds: ['batch-1'] }),
      historyBatches: [historyBatch('batch-1', '2026-07-02T00:00:00.000Z')],
      inMemoryItems: [
        {
          id: 'batch-1',
          createdAt: '2026-07-02T00:00:00.000Z',
          entries: [],
          settings: settings('x'),
          error: 'old',
        },
      ],
      legacySettings,
    });

    expect(feed).toHaveLength(1);
    expect(feed[0]?.error).toBeUndefined();
  });

  it('synthesises failed tasks for orphaned pending batch ids', () => {
    const { feed, legacyPendingTasks } = buildSessionFeed({
      session: session({ batchIds: ['pending-orphan'] }),
      historyBatches: [],
      inMemoryItems: [],
      legacySettings,
    });

    expect(legacyPendingTasks).toEqual([
      {
        id: 'pending-orphan',
        createdAt: '2026-07-05T00:00:00.000Z',
        settings: settings('会话标题'),
        error: LEGACY_PENDING_TASK_ERROR,
      },
    ]);
    expect(feed.map((item) => [item.id, item.error])).toEqual([
      ['pending-orphan', LEGACY_PENDING_TASK_ERROR],
    ]);
  });

  it('leaves out batches that are hidden while being replaced', () => {
    const { feed } = buildSessionFeed({
      session: session({ batchIds: ['pending-new', 'pending-failed'] }),
      historyBatches: [historyBatch('batch-old', '2026-07-01T00:00:00.000Z')],
      inMemoryItems: [
        {
          id: 'pending-new',
          createdAt: '2026-07-03T00:00:00.000Z',
          entries: [],
          settings: settings('n'),
        },
        {
          id: 'pending-failed',
          createdAt: '2026-07-02T00:00:00.000Z',
          entries: [],
          settings: settings('f'),
          error: 'x',
        },
      ],
      hiddenBatchIds: new Set(['batch-old', 'pending-failed']),
      legacySettings,
    });

    expect(feed.map((item) => item.id)).toEqual(['pending-new']);
  });

  it('keeps session order for items created at the same time', () => {
    const createdAt = '2026-07-02T00:00:00.000Z';
    const { feed } = buildSessionFeed({
      session: session({ batchIds: ['batch-b', 'pending-c'] }),
      historyBatches: [historyBatch('batch-b', createdAt)],
      inMemoryItems: [{ id: 'pending-c', createdAt, entries: [], settings: settings('c') }],
      legacySettings,
    });

    expect(feed.map((item) => item.id)).toEqual(['batch-b', 'pending-c']);
  });
});

describe('sameFeed', () => {
  it('compares ids, errors and entry identity', () => {
    const base: FeedItem = { id: 'a', createdAt: 'now', entries: [], settings: settings('a') };
    expect(sameFeed([base], [{ ...base }])).toBe(true);
    expect(sameFeed([base], [{ ...base, error: 'x' }])).toBe(false);
    expect(sameFeed([base], [])).toBe(false);
  });
});
