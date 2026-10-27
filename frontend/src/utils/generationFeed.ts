import type { GenerationSession, PersistedGenerationTask } from '@/hooks/useGenerationSessions';
import type { GroupedBatch } from '@/hooks/useImageHistory';
import type { GenerationSettingsSnapshot, HistoryEntry } from '@/types/image';

export interface FeedItem {
  id: string;
  createdAt: string;
  entries: HistoryEntry[];
  settings: GenerationSettingsSnapshot;
  error?: string;
}

export function feedItemFromBatch(batch: GroupedBatch): FeedItem {
  return {
    id: batch.batchId,
    createdAt: batch.createdAt,
    entries: [...batch.entries],
    settings: batch.settings,
  };
}

export function feedItemFromPersistedTask(task: PersistedGenerationTask): FeedItem {
  return {
    id: task.id,
    createdAt: task.createdAt,
    entries: [],
    settings: task.settings,
    ...(task.error === undefined ? {} : { error: task.error }),
  };
}

export function persistedTaskFromFeedItem(item: FeedItem): PersistedGenerationTask {
  return {
    id: item.id,
    createdAt: item.createdAt,
    settings: item.settings,
    ...(item.error === undefined ? {} : { error: item.error }),
  };
}

export function sameFeed(left: readonly FeedItem[], right: readonly FeedItem[]): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => {
      const candidate = right[index];
      return (
        candidate?.id === item.id &&
        candidate.error === item.error &&
        candidate.entries.length === item.entries.length &&
        candidate.entries.every(
          (entry, entryIndex) => entry.record === item.entries[entryIndex]?.record,
        )
      );
    })
  );
}

export interface GenerationErrorCopy {
  message: string;
  requestId: string | null;
}

/** Splits a trailing "（请求编号：…）" suffix off a generation error message. */
export function splitGenerationError(message: string): GenerationErrorCopy {
  const requestSuffix = message.match(/[（(]\s*请求编号[:：]\s*([^）)]+)\s*[）)]\s*$/);
  if (!requestSuffix) return { message, requestId: null };
  return {
    message: message.slice(0, requestSuffix.index).trim(),
    requestId: requestSuffix[1]?.trim() || null,
  };
}

export const LEGACY_PENDING_TASK_ERROR = '上一条生成任务未能完成，请重试。';

interface BuildSessionFeedInput {
  session: GenerationSession;
  historyBatches: readonly GroupedBatch[];
  /** Feed items still held in memory for this session (cached feed, then the live feed). */
  inMemoryItems: readonly FeedItem[];
  /** Batches currently being regenerated; their pending replacement stands in for them. */
  hiddenBatchIds?: ReadonlySet<string>;
  /** Settings used to describe `pending-*` batch ids left behind without a persisted task. */
  legacySettings: (session: GenerationSession) => GenerationSettingsSnapshot;
}

interface BuildSessionFeedResult {
  feed: FeedItem[];
  /** Tasks synthesised for orphaned `pending-*` batch ids; callers should persist them. */
  legacyPendingTasks: PersistedGenerationTask[];
}

/**
 * Merges server history, persisted transient tasks and in-memory items into the
 * chronological feed shown for one generation session.
 */
export function buildSessionFeed({
  session,
  historyBatches,
  inMemoryItems,
  hiddenBatchIds,
  legacySettings,
}: BuildSessionFeedInput): BuildSessionFeedResult {
  const persisted = new Map(
    historyBatches.map((batch) => [batch.batchId, feedItemFromBatch(batch)]),
  );
  const persistedTransient = new Map(
    session.transientTasks.map((task) => [task.id, feedItemFromPersistedTask(task)]),
  );
  const legacyPendingTasks = session.batchIds
    .filter(
      (batchId) =>
        batchId.startsWith('pending-') &&
        !persisted.has(batchId) &&
        !persistedTransient.has(batchId),
    )
    .map<PersistedGenerationTask>((batchId) => ({
      id: batchId,
      createdAt: session.updatedAt,
      settings: legacySettings(session),
      error: LEGACY_PENDING_TASK_ERROR,
    }));
  legacyPendingTasks.forEach((task) => {
    persistedTransient.set(task.id, feedItemFromPersistedTask(task));
  });
  const transient = new Map(
    [...persistedTransient.values(), ...inMemoryItems]
      .filter((item) => session.batchIds.includes(item.id) && !persisted.has(item.id))
      .map((item) => [item.id, item]),
  );
  const orderedBatchIds = [
    ...historyBatches.map((batch) => batch.batchId),
    ...session.batchIds.filter((batchId) => !persisted.has(batchId)),
  ];
  const orderIndex = new Map(orderedBatchIds.map((batchId, index) => [batchId, index]));
  const feed = orderedBatchIds
    .map((batchId) => transient.get(batchId) ?? persisted.get(batchId))
    .filter((item): item is FeedItem => item !== undefined && !hiddenBatchIds?.has(item.id))
    .sort((left, right) => {
      const byCreatedAt = left.createdAt.localeCompare(right.createdAt);
      if (byCreatedAt !== 0) return byCreatedAt;
      return (orderIndex.get(left.id) ?? 0) - (orderIndex.get(right.id) ?? 0);
    });
  return { feed, legacyPendingTasks };
}
