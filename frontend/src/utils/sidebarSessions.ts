import type { GenerationSession } from '@/hooks/useGenerationSessions';
import type { GroupedBatch } from '@/hooks/useImageHistory';
import { isTextFixPrompt } from '@/utils/textCheck';

export interface SidebarSession {
  id: string;
  title: string;
  /** The session's newest image, as its cover; absent until it has made one. */
  thumbnail?: string;
}

/** The first image of the session's newest batch that made any. */
function coverImage(
  session: GenerationSession,
  batchById: ReadonlyMap<string, GroupedBatch>,
): string | undefined {
  return session.batchIds
    .map((batchId) => batchById.get(batchId))
    .filter((batch): batch is GroupedBatch => batch !== undefined && batch.entries.length > 0)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.entries[0]?.imageUrl;
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
      const thumbnail = coverImage(session, batchById);
      const cover = thumbnail === undefined ? {} : { thumbnail };
      if (!isTextFixPrompt(session.title))
        return { id: session.id, title: session.title, ...cover };
      // A session named after a text fix shows the creation's own prompt instead.
      const ownPrompt = session.batchIds
        .map((batchId) => batchById.get(batchId)?.prompt)
        .find((prompt) => prompt !== undefined && !isTextFixPrompt(prompt));
      return { id: session.id, title: ownPrompt ?? session.title, ...cover };
    });
}
