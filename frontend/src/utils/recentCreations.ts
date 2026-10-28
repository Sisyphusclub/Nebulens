import type { GenerationSession } from '@/hooks/useGenerationSessions';
import type { GroupedBatch } from '@/hooks/useImageHistory';

export interface RecentCreation {
  key: string;
  /** The local session that owns the batch, or null when no session does. */
  sessionId: string | null;
  batch: GroupedBatch;
  title: string;
  imageUrl: string;
}

/**
 * The latest creations to resume, one per session. `batches` must be newest first and
 * already limited to the signed-in user, so other accounts' sessions never surface.
 */
export function recentCreations(
  batches: readonly GroupedBatch[],
  sessions: readonly GenerationSession[],
  limit = 3,
): RecentCreation[] {
  const cards: RecentCreation[] = [];
  const seen = new Set<string>();
  for (const batch of batches) {
    if (cards.length >= limit) break;
    const imageUrl = batch.entries[0]?.imageUrl;
    if (imageUrl === undefined) continue;
    const owner = sessions.find((session) => session.batchIds.includes(batch.batchId));
    const key = owner?.id ?? `batch:${batch.batchId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({
      key,
      sessionId: owner?.id ?? null,
      batch,
      title: owner?.title ?? batch.prompt,
      imageUrl,
    });
  }
  return cards;
}
