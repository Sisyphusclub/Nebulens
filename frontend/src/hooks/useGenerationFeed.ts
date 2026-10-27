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
import { addPublicRecord } from '@/hooks/usePublicGallery';
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
  // The history snapshot `feed` was last rebuilt from. Until it matches the current
  // history, `feed` may still hold only locally persisted tasks.
  const [syncedHistory, setSyncedHistory] = useState<readonly GroupedBatch[] | null>(null);
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
      legacySettings: (pendingSession) => ({
        prompt: searchParams.get('prompt')?.trim() || pendingSession.title,
        model: DEFAULT_IMAGE_MODEL,
        count: readCount(searchParams),
        aspectRatio: isAspectRatio(queryAspect) ? queryAspect : DEFAULT_ASPECT_RATIO,
        resolution: readResolution(searchParams),
        isPublic: searchParams.get('isPublic') === 'true',
        referenceIds: [],
      }),
    });
    legacyPendingTasks.forEach((task) => upsertGenerationTask(session.id, task));
    feedSessionId.current = activeSessionId;
    feedBySession.current.set(activeSessionId, next);
    setFeed((current) => (sameFeed(current, next) ? current : next));
    setSyncedHistory(historyBatches);
  }, [activeSessionId, historyBatches, searchParams, sessions]);

  useEffect(() => {
    if (!feedSessionId.current) return;
    feedBySession.current.set(feedSessionId.current, feed);
  }, [feed]);

  const performGeneration = async (
    settings: GenerationSettingsSnapshot,
    referenceFiles: readonly File[] = [],
    fromComposer = false,
    replaceItem?: FeedItem,
  ): Promise<void> => {
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
        isPublic: String(settings.isPublic),
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
      removeGenerationTask(generationSessionId, replaceItem.id);
      if (generationSessionBatchIds.includes(replaceItem.id)) {
        replaceGenerationBatch(generationSessionId, replaceItem.id, pendingId);
      } else {
        attachGenerationBatch(generationSessionId, pendingId, settings.prompt);
      }
      setFeed((current) =>
        current.map((item) => (item.id === replaceItem.id ? pendingItem : item)),
      );
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
      removeGenerationTask(generationSessionId, pendingId);
      replaceGenerationBatch(generationSessionId, pendingId, replaceItem.id);
      if (replaceItem.error) {
        upsertGenerationTask(generationSessionId, persistedTaskFromFeedItem(replaceItem));
      }
      setFeed((current) => current.map((item) => (item.id === pendingId ? replaceItem : item)));
      setActiveHistoryBatchId(replaceItem.id);
    };

    try {
      const result = await generation.generate({
        prompt: settings.prompt,
        model: settings.model,
        count: settings.count,
        aspectRatio: settings.aspectRatio,
        resolution: settings.resolution,
        ...(settings.quality === undefined ? {} : { quality: settings.quality }),
        isPublic: settings.isPublic,
        referenceIds: [...settings.referenceIds],
        ...(referenceFiles.length ? { referenceFiles: [...referenceFiles] } : {}),
      });
      if (generationUserId === null || currentUserIdRef.current !== generationUserId) {
        throw new Error(GENERATION_STOPPED_MESSAGE);
      }
      result.entries.forEach((entry) => {
        if (entry.record.isPublic) addPublicRecord(entry.record);
      });
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
      if (replaceItem) {
        try {
          await removeHistoryBatch(replaceItem.id);
        } catch {
          replacementCleanupFailed = true;
        }
      }
      if (fromComposer) onComposerSubmitted(settings.prompt);
      await refreshQuota();
      if (replacementCleanupFailed) {
        notify('新结果已生成，但旧记录暂未清理，请稍后删除。', 'error');
      } else {
        notify(replaceItem ? '已重新生成并替换原结果。' : '图片生成完成。');
      }
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
        const failedItem = { ...pendingItem, error: message };
        upsertGenerationTask(generationSessionId, persistedTaskFromFeedItem(failedItem));
        setFeed((current) => current.map((item) => (item.id === pendingId ? failedItem : item)));
      }
      notify(splitGenerationError(message).message, 'error');
    }
  };

  return {
    feed,
    /** True once `feed` reflects the current history rather than an earlier snapshot. */
    isFeedSynced: syncedHistory === historyBatches,
    setFeed,
    activeHistoryBatchId,
    setActiveHistoryBatchId,
    pendingScrollId,
    performGeneration,
  };
}
