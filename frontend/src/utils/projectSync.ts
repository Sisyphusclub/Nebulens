import type { AgentTurn } from '@/hooks/useAgentConversation';
import {
  parseGenerationSession,
  type GenerationSession,
  type PersistedGenerationTask,
} from '@/hooks/useGenerationSessions';
import type { ProjectPayload, RemoteProject } from '@/services/api/projectsApi';

/** A generation with no error yet is still running on the page that started it. */
function isRunning(task: PersistedGenerationTask): boolean {
  return task.error === undefined;
}

/**
 * What a project tells the server about itself. A generation still running stays out: it
 * lives in this page, and another device shown it would wait for a picture that page makes.
 */
export function projectPayload(session: GenerationSession): ProjectPayload {
  const running = new Set(session.transientTasks.filter(isRunning).map((task) => task.id));
  return {
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    batchIds: session.batchIds.filter((batchId) => !running.has(batchId)),
    tasks: session.transientTasks.filter((task) => !isRunning(task)),
  };
}

/** A project the server lists, as the session it is in this browser; null when unreadable. */
export function sessionFromRemote(project: RemoteProject): GenerationSession | null {
  return parseGenerationSession({
    id: project.id,
    title: project.title,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    batchIds: project.batchIds,
    transientTasks: project.tasks,
  });
}

/**
 * The session as the server holds it, plus the generations this page still has running, so
 * their pictures find their place when they arrive.
 */
export function mergeRemoteSession(
  remote: GenerationSession,
  local: GenerationSession | undefined,
): GenerationSession {
  const running = (local?.transientTasks ?? []).filter(
    (task) =>
      isRunning(task) && local?.batchIds.includes(task.id) && !remote.batchIds.includes(task.id),
  );
  if (running.length === 0) return remote;
  return {
    ...remote,
    batchIds: [...remote.batchIds, ...running.map((task) => task.id)],
    transientTasks: [...remote.transientTasks, ...running],
  };
}

/**
 * The conversation as the server holds it, oldest request first. A request this page still
 * has to save, or is working on, stays as it is here; so does one the server never got.
 */
export function mergeRemoteTurns(
  remote: readonly AgentTurn[],
  local: readonly AgentTurn[],
  keepLocal: (turn: AgentTurn) => boolean,
): AgentTurn[] {
  const merged = new Map(remote.map((turn) => [turn.id, turn]));
  for (const turn of local) {
    if (!merged.has(turn.id) || keepLocal(turn)) merged.set(turn.id, turn);
  }
  return [...merged.values()]
    .map((turn, index) => ({ turn, index }))
    .sort(
      (left, right) =>
        left.turn.createdAt.localeCompare(right.turn.createdAt) || left.index - right.index,
    )
    .map(({ turn }) => turn);
}

/**
 * Sessions sit in storage every account on the device shares. One belongs to the account
 * that sent a request in it, or that made one of its pictures.
 */
export function ownsSession(
  session: GenerationSession,
  turns: readonly AgentTurn[],
  userId: string,
  ownBatchIds: ReadonlySet<string>,
): boolean {
  return (
    turns.some((turn) => turn.userId === userId) ||
    session.batchIds.some((batchId) => ownBatchIds.has(batchId))
  );
}
