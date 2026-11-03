import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  attachGenerationBatch,
  rememberGenerationSession,
  removeGenerationBatch,
  removeGenerationTask,
  replaceGenerationBatch,
  upsertGenerationTask,
  type GenerationSession,
} from '@/hooks/useGenerationSessions';
import { readCount, readResolution } from '@/hooks/useGenerationSettings';
import type { GenerateImageOptions } from '@/hooks/useImageGeneration';
import type { GroupedBatch } from '@/hooks/useImageHistory';
import {
  DEFAULT_ASPECT_RATIO,
  DEFAULT_IMAGE_MODEL,
  isAspectRatio,
  type GeneratedBatchResult,
  type GenerationSettingsSnapshot,
} from '@/types/image';
import {
  buildSessionFeed,
  persistedTaskFromFeedItem,
  sameFeed,
  splitGenerationError,
  type FeedItem,
} from '@/utils/generationFeed';

const GENERATION_STOPPED_MESSAGE = '生成已停止。';
const NO_BATCH_IDS: ReadonlySet<string> = new Set();

interface UseGenerationFeedOptions {
  activeSessionId: string | null;
  searchParams: URLSearchParams;
  currentUserId: string | null;
  sessions: readonly GenerationSession[];
  createSession: () => GenerationSession;
  /** Must be referentially stable between renders (useImageHistory memoises it). */
  historyBatches: readonly GroupedBatch[];
  removeHistoryBatch: (batchId: string) => Promise<void>;
  generation: {
    isLoading: boolean;
    generate: (options: GenerateImageOptions) => Promise<GeneratedBatchResult>;
  };
  refreshQuota: () => Promise<unknown>;
  notify: (message: string, tone?: 'success' | 'error') => void;
  /** A session was created on the fly for a generation started without one. */
  onSessionCreated: (sessionId: string) => void;
  /** A feed item is being regenerated in place; its entries are about to disappear. */
  onItemReplaced: (item: FeedItem) => void;
  /** A composer-initiated generation succeeded with this (trimmed) prompt. */
  onComposerSubmitted: (prompt: string) => void;
}

/**
 * Owns the result feed of the active generation session: merging history with
 * in-flight tasks, and running generations with optimistic pending items,
 * in-place replacement and rollback on failure.
 */
export function useGenerationFeed({
  activeSessionId,
  searchParams,
  currentUserId,
  sessions,
  createSession,
  historyBatches,
  removeHistoryBatch,
  generation,
  refreshQuota,
  notify,
  onSessionCreated,
  onItemReplaced,
  onComposerSubmitted,
}: UseGenerationFeedOptions) {
  const navigate = useNavigate();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [activeHistoryBatchId, setActiveHistoryBatchId] = useState<string | null>(null);
  // The session and history snapshot `feed` was last rebuilt from. Until both match,
  // `feed` may still hold another session's items or only locally persisted tasks.
  const [syncedSource, setSyncedSource] = useState<{
    sessionId: string;
    historyBatches: readonly GroupedBatch[];
  } | null>(null);
  const [replacingBatchIds, setReplacingBatchIds] = useState<ReadonlySet<string>>(NO_BATCH_IDS);
  const feedBySession = useRef(new Map<string, FeedItem[]>());
  const feedSessionId = useRef<string | null>(null);
  const latestFeed = useRef(feed);
  latestFeed.current = feed;
  /** Batch id to scroll into view after the next feed render. */
  const pendingScrollId = useRef<string | null>(null);
  const currentUserIdRef = useRef(currentUserId);
  useLayoutEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    if (!activeSessionId) {
      if (feedSessionId.current) {
        feedBySession.current.set(feedSessionId.current, latestFeed.current);
        feedSessionId.current = null;
        setFeed([]);
      }
      return;
    }
    const session = sessions.find((candidate) => candidate.id === activeSessionId);
    if (!session) {
      feedSessionId.current = null;
      setFeed([]);
      return;
    }
    const previousFeedSessionId = feedSessionId.current;
    if (previousFeedSessionId && previousFeedSessionId !== activeSessionId) {
      feedBySession.current.set(previousFeedSessionId, latestFeed.current);
    }
    const queryAspect = searchParams.get('aspect');
    const { feed: next, legacyPendingTasks } = buildSessionFeed({
      session,
      historyBatches,
      inMemoryItems: [...(feedBySession.current.get(activeSessionId) ?? []), ...latestFeed.current],
      hiddenBatchIds: replacingBatchIds,
      legacySettings: (pendingSession) => ({
        prompt: searchParams.get('prompt')?.trim() || pendingSession.title,
        model: DEFAULT_IMAGE_MODEL,
        count: readCount(searchParams),
        aspectRatio: isAspectRatio(queryAspect) ? queryAspect : DEFAULT_ASPECT_RATIO,
        resolution: readResolution(searchParams),
        isPublic: false,
        referenceIds: [],
      }),
    });
    legacyPendingTasks.forEach((task) => upsertGenerationTask(session.id, task));
    feedSessionId.current = activeSessionId;
    feedBySession.current.set(activeSessionId, next);
    setFeed((current) => (sameFeed(current, next) ? current : next));
    setSyncedSource({ sessionId: activeSessionId, historyBatches });
  }, [activeSessionId, historyBatches, replacingBatchIds, searchParams, sessions]);

  useEffect(() => {
    if (!feedSessionId.current) return;
    feedBySession.current.set(feedSessionId.current, feed);
  }, [feed]);

  const setReplacing = (batchId: string, replacing: boolean): void => {
    setReplacingBatchIds((current) => {
      if (current.has(batchId) === replacing) return current;
      const next = new Set(current);
      if (replacing) next.add(batchId);
      else next.delete(batchId);
      return next;
    });
  };

  /** Resolves to the new batch id once it is saved; failures resolve to undefined. */
  const performGeneration = async (
    settings: GenerationSettingsSnapshot,
    referenceFiles: readonly File[] = [],
    fromComposer = false,
    replaceItem?: FeedItem,
  ): Promise<string | undefined> => {
    const generationUserId = currentUserIdRef.current;
    if (generation.isLoading) return;
    if (!settings.prompt) {
      notify('请先描述你想生成的图片。', 'error');
      return;
    }
    let generationSession = sessions.find((session) => session.id === activeSessionId);
    let generationSessionId = generationSession?.id;
    if (!generationSessionId) {
      const session = createSession();
      generationSession = session;
      generationSessionId = session.id;
      onSessionCreated(session.id);
      const nextSearch = new URLSearchParams({
        session: session.id,
        model: settings.model,
        aspect: settings.aspectRatio,
        count: String(settings.count),
        resolution: settings.resolution,
      });
      if (settings.quality !== undefined) {
        nextSearch.set('quality', settings.quality);
      }
      void navigate(`/generate?${nextSearch.toString()}`, { replace: true });
    }
    if (generationUserId !== null) {
      rememberGenerationSession(generationUserId, generationSessionId);
    }
    const generationSessionBatchIds = generationSession?.batchIds ?? [];
    const pendingId = `pending-${crypto.randomUUID()}`;
    const pendingItem: FeedItem = {
      id: pendingId,
      createdAt: new Date().toISOString(),
      entries: [],
      settings,
    };
    if (replaceItem) {
      // Results stay in time order: the replacement is queued as the newest item and the
      // old batch is hidden (not deleted) until the new one is saved.
      setReplacing(replaceItem.id, true);
      removeGenerationTask(generationSessionId, replaceItem.id);
      if (generationSessionBatchIds.includes(replaceItem.id)) {
        replaceGenerationBatch(generationSessionId, replaceItem.id, pendingId);
      } else {
        attachGenerationBatch(generationSessionId, pendingId, settings.prompt);
      }
      pendingScrollId.current = pendingId;
      setFeed((current) => [...current.filter((item) => item.id !== replaceItem.id), pendingItem]);
      onItemReplaced(replaceItem);
      if (activeHistoryBatchId === replaceItem.id) setActiveHistoryBatchId(null);
    } else {
      attachGenerationBatch(generationSessionId, pendingId, settings.prompt);
      pendingScrollId.current = pendingId;
      setFeed((current) => [...current, pendingItem]);
    }
    upsertGenerationTask(generationSessionId, persistedTaskFromFeedItem(pendingItem));

    const restoreReplacedItem = (): void => {
      if (!replaceItem) return;
      setReplacing(replaceItem.id, false);
      removeGenerationTask(generationSessionId, pendingId);
      replaceGenerationBatch(generationSessionId, pendingId, replaceItem.id);
      if (replaceItem.error) {
        upsertGenerationTask(generationSessionId, persistedTaskFromFeedItem(replaceItem));
      }
      setFeed((current) => current.map((item) => (item.id === pendingId ? replaceItem : item)));
      setActiveHistoryBatchId(replaceItem.id);
    };

    // Ids of references uploaded for this run, so a failed card retries with them.
    let uploadedReferenceIds: string[] = [];
    try {
      const result = await generation.generate({
        prompt: settings.prompt,
        model: settings.model,
        count: settings.count,
        aspectRatio: settings.aspectRatio,
        resolution: settings.resolution,
        ...(settings.quality === undefined ? {} : { quality: settings.quality }),
        referenceIds: [...settings.referenceIds],
        ...(referenceFiles.length ? { referenceFiles: [...referenceFiles] } : {}),
        onReferencesUploaded: (ids) => {
          uploadedReferenceIds = ids;
        },
      });
      if (generationUserId === null || currentUserIdRef.current !== generationUserId) {
        throw new Error(GENERATION_STOPPED_MESSAGE);
      }
      const persistedReferenceIds = [
        ...new Set(
          result.entries.flatMap(
            (entry) =>
              entry.record.referenceIds ??
              (entry.record.referenceId ? [entry.record.referenceId] : []),
          ),
        ),
      ];
      const completedSettings: GenerationSettingsSnapshot = {
        ...settings,
        aspectRatio: result.aspectRatio,
        referenceIds: persistedReferenceIds.length ? persistedReferenceIds : settings.referenceIds,
      };
      // The history store may already have surfaced this batch in the feed while the
      // request was resolving; the pending item takes its place instead of duplicating it.
      setFeed((current) =>
        current.flatMap((item) => {
          if (item.id === pendingId) {
            return [
              { ...item, id: result.batchId, entries: result.entries, settings: completedSettings },
            ];
          }
          return item.id === result.batchId ? [] : [item];
        }),
      );
      removeGenerationTask(generationSessionId, pendingId);
      replaceGenerationBatch(generationSessionId, pendingId, result.batchId);
      setActiveHistoryBatchId(result.batchId);
      let replacementCleanupFailed = false;
      // Failed items only ever lived in the local session; there is no server batch to delete.
      if (replaceItem && replaceItem.entries.length > 0) {
        try {
          await removeHistoryBatch(replaceItem.id);
        } catch {
          replacementCleanupFailed = true;
        }
      }
      // Once deleted the old batch is gone from history; if deletion failed it reappears
      // so the user can remove it, as the notice below asks.
      if (replaceItem) setReplacing(replaceItem.id, false);
      if (fromComposer) onComposerSubmitted(settings.prompt);
      await refreshQuota();
      if (replacementCleanupFailed) {
        notify('新结果已生成，但旧记录暂未清理，请稍后删除。', 'error');
      } else {
        notify(replaceItem ? '已重新生成并替换原结果。' : '图片生成完成。');
      }
      return result.batchId;
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成失败，请稍后重试。';
      if (message === GENERATION_STOPPED_MESSAGE) {
        if (replaceItem) restoreReplacedItem();
        else {
          removeGenerationBatch(generationSessionId, pendingId);
          setFeed((current) => current.filter((item) => item.id !== pendingId));
        }
        notify(message);
        return;
      }
      if (replaceItem) restoreReplacedItem();
      else {
        const failedItem: FeedItem = {
          ...pendingItem,
          error: message,
          ...(uploadedReferenceIds.length
            ? { settings: { ...pendingItem.settings, referenceIds: uploadedReferenceIds } }
            : {}),
        };
        upsertGenerationTask(generationSessionId, persistedTaskFromFeedItem(failedItem));
        setFeed((current) => current.map((item) => (item.id === pendingId ? failedItem : item)));
      }
      notify(splitGenerationError(message).message, 'error');
    }
  };

  return {
    feed,
    /** True once `feed` reflects the current history rather than an earlier snapshot. */
    isFeedSynced:
      syncedSource?.sessionId === activeSessionId && syncedSource.historyBatches === historyBatches,
    setFeed,
    activeHistoryBatchId,
    setActiveHistoryBatchId,
    pendingScrollId,
    performGeneration,
  };
}
