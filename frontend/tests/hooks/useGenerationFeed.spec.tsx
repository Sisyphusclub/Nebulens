import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/usePublicGallery', () => ({ addPublicRecord: vi.fn() }));

import { useGenerationFeed } from '@/hooks/useGenerationFeed';
import {
  attachGenerationBatch,
  createGenerationSession,
  resetGenerationSessionsForTests,
  useGenerationSessions,
  type GenerationSession,
} from '@/hooks/useGenerationSessions';
import type { GroupedBatch } from '@/hooks/useImageHistory';
import type { GeneratedBatchResult, GenerationSettingsSnapshot } from '@/types/image';
import type { FeedItem } from '@/utils/generationFeed';

const settings: GenerationSettingsSnapshot = {
  prompt: '雨夜建筑',
  model: 'gpt-image-2',
  count: 1,
  aspectRatio: '16:9',
  resolution: 'standard',
  isPublic: false,
  referenceIds: [],
};

function result(batchId: string): GeneratedBatchResult {
  return {
    batchId,
    aspectRatio: '16:9',
    generationMode: 'text-to-image',
    entries: [
      {
        record: {
          id: `${batchId}.png`,
          batchId,
          createdAt: '2026-07-30T08:00:00.000Z',
          prompt: settings.prompt,
          model: settings.model,
          aspectRatio: '16:9',
          width: 1792,
          height: 1024,
          count: 1,
          resolution: 'standard',
          isPublic: false,
          isFavorite: false,
        },
        imageUrl: `/${batchId}.png`,
      },
    ],
  };
}

// Stable reference, as useImageHistory memoises its batches.
const NO_HISTORY: GroupedBatch[] = [];

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

function setup(session: GenerationSession, userId: string | null = 'user-a') {
  const generate = vi.fn<(options: unknown) => Promise<GeneratedBatchResult>>();
  const notify = vi.fn();
  const removeHistoryBatch = vi.fn<(batchId: string) => Promise<void>>().mockResolvedValue();
  const onItemReplaced = vi.fn();
  const onComposerSubmitted = vi.fn();
  const params = new URLSearchParams({ session: session.id });
  const feedSnapshots: string[][] = [];
  const hook = renderHook(
    ({
      currentUserId,
      historyBatches,
    }: {
      currentUserId: string | null;
      historyBatches: readonly GroupedBatch[];
    }) => {
      const { sessions, create } = useGenerationSessions();
      const feed = useGenerationFeed({
        activeSessionId: session.id,
        searchParams: params,
        currentUserId,
        sessions,
        createSession: () => create(),
        historyBatches,
        removeHistoryBatch,
        generation: { isLoading: false, generate },
        refreshQuota: vi.fn().mockResolvedValue(undefined),
        notify,
        onSessionCreated: vi.fn(),
        onItemReplaced,
        onComposerSubmitted,
      });
      feedSnapshots.push(feed.feed.map((item) => item.id));
      return feed;
    },
    { wrapper, initialProps: { currentUserId: userId, historyBatches: NO_HISTORY } },
  );
  return {
    ...hook,
    generate,
    notify,
    removeHistoryBatch,
    onItemReplaced,
    onComposerSubmitted,
    feedSnapshots,
  };
}

beforeEach(() => {
  resetGenerationSessionsForTests();
});

describe('useGenerationFeed', () => {
  it('appends a pending item and swaps in the generated batch', async () => {
    const session = createGenerationSession('会话');
    const { result: hook, generate, notify, onComposerSubmitted } = setup(session);
    generate.mockResolvedValue(result('batch-1'));

    let batchId: string | undefined;
    await act(async () => {
      batchId = await hook.current.performGeneration(settings, [], true);
    });

    expect(batchId).toBe('batch-1');
    expect(hook.current.feed.map((item) => item.id)).toEqual(['batch-1']);
    expect(hook.current.activeHistoryBatchId).toBe('batch-1');
    expect(onComposerSubmitted).toHaveBeenCalledWith('雨夜建筑');
    expect(hook.current.completedBatchId).toBe('batch-1');
    expect(notify).not.toHaveBeenCalled();
  });

  it('keeps a failed item with its error on the card instead of a toast', async () => {
    const session = createGenerationSession('会话');
    const { result: hook, generate, notify, onComposerSubmitted } = setup(session);
    generate.mockRejectedValue(new Error('上游失败（请求编号：req-1）'));

    let batchId: string | undefined = 'unset';
    await act(async () => {
      batchId = await hook.current.performGeneration(settings, [], true);
    });

    expect(batchId).toBeUndefined();

    expect(hook.current.feed).toHaveLength(1);
    expect(hook.current.feed[0]?.error).toBe('上游失败（请求编号：req-1）');
    expect(onComposerSubmitted).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('restores the replaced item when regeneration fails', async () => {
    const session = createGenerationSession('会话');
    const original: FeedItem = {
      id: 'pending-old',
      createdAt: '2026-07-29T08:00:00.000Z',
      entries: [],
      settings,
      error: '旧错误',
    };
    attachGenerationBatch(session.id, original.id, settings.prompt);
    const { result: hook, generate, onItemReplaced } = setup(session);
    act(() => hook.current.setFeed([original]));
    generate.mockRejectedValue(new Error('再次失败'));

    await act(() => hook.current.performGeneration(settings, [], false, original));

    expect(onItemReplaced).toHaveBeenCalledWith(original);
    expect(hook.current.feed).toEqual([original]);
    expect(hook.current.activeHistoryBatchId).toBe(original.id);
  });

  describe('regenerating a saved batch', () => {
    const oldBatch: GroupedBatch = {
      batchId: 'batch-old',
      createdAt: '2026-07-29T08:00:00.000Z',
      prompt: settings.prompt,
      model: settings.model,
      entries: result('batch-old').entries,
      settings,
    };
    const oldItem: FeedItem = {
      id: oldBatch.batchId,
      createdAt: oldBatch.createdAt,
      entries: [...oldBatch.entries],
      settings,
    };
    const OLD_HISTORY = [oldBatch];

    async function regenerate(outcome: 'success' | 'failure') {
      const session = createGenerationSession('会话');
      attachGenerationBatch(session.id, oldBatch.batchId, settings.prompt);
      const harness = setup(session);
      harness.rerender({ currentUserId: 'user-a', historyBatches: OLD_HISTORY });
      await waitFor(() =>
        expect(harness.result.current.feed.map((item) => item.id)).toEqual(['batch-old']),
      );
      let settle!: () => void;
      harness.generate.mockReturnValue(
        new Promise<GeneratedBatchResult>((resolve, reject) => {
          settle = () =>
            outcome === 'failure' ? reject(new Error('再次失败')) : resolve(result('batch-new'));
        }),
      );
      harness.removeHistoryBatch.mockImplementation(() => {
        harness.rerender({ currentUserId: 'user-a', historyBatches: NO_HISTORY });
        return Promise.resolve();
      });

      const snapshotsBefore = harness.feedSnapshots.length;
      let pending!: Promise<string | undefined>;
      act(() => {
        pending = harness.result.current.performGeneration(settings, [], false, oldItem);
      });
      // Let the session-store update rebuild the feed while the request is in flight.
      await waitFor(() =>
        expect(harness.feedSnapshots.length).toBeGreaterThan(snapshotsBefore + 1),
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      const inFlight = harness.feedSnapshots.slice(snapshotsBefore);
      await act(async () => {
        settle();
        await pending;
      });
      return { ...harness, inFlight };
    }

    it('hides the old batch while the replacement is pending', async () => {
      const { result: hook, inFlight, removeHistoryBatch } = await regenerate('success');

      expect(inFlight.filter((ids) => ids.includes('batch-old'))).toEqual([]);
      expect(inFlight.at(-1)).toEqual([expect.stringMatching(/^pending-/)]);
      expect(removeHistoryBatch).toHaveBeenCalledWith('batch-old');
      expect(hook.current.feed.map((item) => item.id)).toEqual(['batch-new']);
    });

    it('brings the old batch back when the replacement fails', async () => {
      const { result: hook, inFlight, removeHistoryBatch } = await regenerate('failure');

      expect(inFlight.filter((ids) => ids.includes('batch-old'))).toEqual([]);
      expect(removeHistoryBatch).not.toHaveBeenCalled();
      await waitFor(() => expect(hook.current.feed.map((item) => item.id)).toEqual(['batch-old']));
    });
  });

  it('replaces a failed item without deleting a server batch that never existed', async () => {
    const session = createGenerationSession('会话');
    const failed: FeedItem = {
      id: 'pending-failed',
      createdAt: '2026-07-29T08:00:00.000Z',
      entries: [],
      settings,
      error: '上游失败',
    };
    attachGenerationBatch(session.id, failed.id, settings.prompt);
    const { result: hook, generate, notify, removeHistoryBatch } = setup(session);
    act(() => hook.current.setFeed([failed]));
    generate.mockResolvedValue(result('batch-ok'));

    await act(() => hook.current.performGeneration(settings, [], false, failed));

    expect(removeHistoryBatch).not.toHaveBeenCalled();
    expect(hook.current.feed.map((item) => [item.id, item.error])).toEqual([
      ['batch-ok', undefined],
    ]);
    expect(hook.current.completedBatchId).toBe('batch-ok');
    expect(notify).not.toHaveBeenCalled();
  });

  it('drops the result when the signed-in user changes mid-generation', async () => {
    const session = createGenerationSession('会话');
    const { result: hook, generate, notify, rerender } = setup(session);
    let resolve!: (value: GeneratedBatchResult) => void;
    generate.mockReturnValue(new Promise((done) => (resolve = done)));

    let pending!: Promise<string | undefined>;
    act(() => {
      pending = hook.current.performGeneration(settings);
    });
    await waitFor(() => expect(hook.current.feed).toHaveLength(1));
    rerender({ currentUserId: 'user-b', historyBatches: NO_HISTORY });
    await act(async () => {
      resolve(result('batch-2'));
      await pending;
    });

    expect(hook.current.feed).toEqual([]);
    expect(notify).toHaveBeenLastCalledWith('生成已停止。');
  });

  it('never renders the generated batch twice when history learns about it first', async () => {
    const session = createGenerationSession('会话');
    const { result: hook, generate, rerender, feedSnapshots } = setup(session);
    const generated = result('batch-1');
    // useImageGeneration records the new images in the history store before it resolves.
    generate.mockImplementation(async () => {
      const historyBatch: GroupedBatch = {
        batchId: generated.batchId,
        createdAt: '2026-07-30T08:00:00.000Z',
        prompt: settings.prompt,
        model: settings.model,
        entries: generated.entries,
        settings,
      };
      rerender({ currentUserId: 'user-a', historyBatches: [historyBatch] });
      await Promise.resolve();
      return generated;
    });

    await act(() => hook.current.performGeneration(settings, [], true));

    const duplicated = feedSnapshots.filter((ids) => new Set(ids).size !== ids.length);
    expect(duplicated).toEqual([]);
    expect(hook.current.feed.map((item) => item.id)).toEqual(['batch-1']);
  });

  it('rejects an empty prompt without touching the feed', async () => {
    const session = createGenerationSession('会话');
    const { result: hook, generate, notify } = setup(session);

    await act(() => hook.current.performGeneration({ ...settings, prompt: '' }));

    expect(generate).not.toHaveBeenCalled();
    expect(hook.current.feed).toEqual([]);
    expect(notify).toHaveBeenCalledWith('请先描述你想生成的图片。', 'error');
  });
});
