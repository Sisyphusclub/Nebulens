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

    await act(() => hook.current.performGeneration(settings, [], true));

    expect(hook.current.feed.map((item) => item.id)).toEqual(['batch-1']);
    expect(hook.current.activeHistoryBatchId).toBe('batch-1');
    expect(onComposerSubmitted).toHaveBeenCalledWith('雨夜建筑');
    expect(notify).toHaveBeenLastCalledWith('图片生成完成。');
  });

  it('keeps a failed item with its error and reports the message without the request id', async () => {
    const session = createGenerationSession('会话');
    const { result: hook, generate, notify, onComposerSubmitted } = setup(session);
    generate.mockRejectedValue(new Error('上游失败（请求编号：req-1）'));

    await act(() => hook.current.performGeneration(settings, [], true));

    expect(hook.current.feed).toHaveLength(1);
    expect(hook.current.feed[0]?.error).toBe('上游失败（请求编号：req-1）');
    expect(onComposerSubmitted).not.toHaveBeenCalled();
    expect(notify).toHaveBeenLastCalledWith('上游失败', 'error');
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

  it('drops the result when the signed-in user changes mid-generation', async () => {
    const session = createGenerationSession('会话');
    const { result: hook, generate, notify, rerender } = setup(session);
    let resolve!: (value: GeneratedBatchResult) => void;
    generate.mockReturnValue(new Promise((done) => (resolve = done)));

    let pending!: Promise<void>;
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
