import type { GenerationSession } from '@/hooks/useGenerationSessions';
import type { GroupedBatch } from '@/hooks/useImageHistory';
import { isTextFixPrompt } from '@/utils/textCheck';

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
 * Text-fix edits and repeats of a title already shown are left out, since they would
 * only show the same work again under an unhelpful name.
 */
export function recentCreations(
  batches: readonly GroupedBatch[],
  sessions: readonly GenerationSession[],
  limit = 3,
): RecentCreation[] {
  const cards: RecentCreation[] = [];
  const seen = new Set<string>();
  const seenTitles = new Set<string>();
  for (const batch of batches) {
    if (cards.length >= limit) break;
    const imageUrl = batch.entries[0]?.imageUrl;
    if (imageUrl === undefined) continue;
    // A text fix only redraws an earlier image, so it never stands for a creation.
    if (isTextFixPrompt(batch.prompt)) continue;
    const owner = sessions.find((session) => session.batchIds.includes(batch.batchId));
    const key = owner?.id ?? `batch:${batch.batchId}`;
    // A session named after a text fix shows the creation's own prompt instead.
    const title = owner === undefined || isTextFixPrompt(owner.title) ? batch.prompt : owner.title;
    if (seen.has(key) || seenTitles.has(title)) continue;
    seen.add(key);
    seenTitles.add(title);
    cards.push({ key, sessionId: owner?.id ?? null, batch, title, imageUrl });
  }
  return cards;
}
