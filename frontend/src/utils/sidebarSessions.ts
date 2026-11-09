import type { GenerationSession } from '@/hooks/useGenerationSessions';
import type { GroupedBatch } from '@/hooks/useImageHistory';
import { isTextFixPrompt } from '@/utils/textCheck';

export interface SidebarSession {
  id: string;
  title: string;
}

/**
 * Sessions to list in the sidebar's creation history, newest first. Sessions live in
 * device storage shared by every account, so only those owning one of the signed-in
 * user's batches are shown, plus the session currently open.
 */
export function sidebarSessions(
  sessions: readonly GenerationSession[],
  batches: readonly GroupedBatch[],
  activeSessionId: string | null,
  limit = 30,
): SidebarSession[] {
  const batchById = new Map(batches.map((batch) => [batch.batchId, batch]));
  return sessions
    .filter(
      (session) =>
        session.id === activeSessionId ||
        session.batchIds.some((batchId) => batchById.has(batchId)),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
    .map((session) => {
      if (!isTextFixPrompt(session.title)) return { id: session.id, title: session.title };
      // A session named after a text fix shows the creation's own prompt instead.
      const ownPrompt = session.batchIds
        .map((batchId) => batchById.get(batchId)?.prompt)
        .find((prompt) => prompt !== undefined && !isTextFixPrompt(prompt));
      return { id: session.id, title: ownPrompt ?? session.title };
    });
}
