import { useEffect, useSyncExternalStore } from 'react';

import { createExternalStore } from '@/lib/externalStore';
import { ImageApiError } from '@/services/api/httpClient';
import {
  deleteProject,
  fetchProject,
  fetchProjects,
  saveProject,
  saveProjectNodes,
  saveProjectTurn,
  type RemoteProject,
  type RemoteProjectDetail,
} from '@/services/api/projectsApi';
import { isRecord } from '@/utils/narrowing';
import {
  mergeRemoteSession,
  mergeRemoteTurns,
  ownsSession,
  projectPayload,
  sessionFromRemote,
} from '@/utils/projectSync';

import {
  getAgentConversations,
  onAgentConversationsWritten,
  parseAgentTurn,
  replaceAgentConversation,
} from './useAgentConversation';
import { useAuth } from './useAuth';
import { getCanvasLayout, onCanvasLayoutWritten, replaceCanvasLayout } from './useCanvasLayout';
import {
  getGenerationSessions,
  onGenerationSessionsWritten,
  replaceGenerationSessions,
  type GenerationSession,
} from './useGenerationSessions';
import { useImageHistory } from './useImageHistory';

export const PROJECT_SYNC_STORAGE_KEY = 'nebulens.project-sync.v1';
/** How long changes are gathered before they are sent, so a drag is one request. */
export const PROJECT_SAVE_DELAY_MS = 800;
/** Waits between attempts while the server cannot be reached. */
const RETRY_DELAYS_MS = [5_000, 15_000, 60_000] as const;
/** Waits before asking again for a project that could not be read. */
const LOAD_RETRY_DELAYS_MS = [2_000, 5_000, 15_000] as const;

/**
 * Projects are sessions kept on the server: their pictures, the conversation with the
 * Agent and the board. This browser keeps a copy and works on it; what changes here is
 * sent to the server, and what the server holds is read when the account signs in and
 * when a project is opened.
 */
export interface ProjectSyncState {
  ownerUserId: string | null;
  /** The server's list has been applied, or could not be read and the page works without it. */
  listed: boolean;
  /** The account's projects on the server. */
  projectIds: ReadonlySet<string>;
  /** Those of them that hold a conversation with the Agent. */
  agentProjectIds: ReadonlySet<string>;
  /** Projects whose conversation and board are as the server holds them. */
  loadedIds: ReadonlySet<string>;
  /** The server could not be reached; what changed is kept here and sent again later. */
  failing: boolean;
  /** Sessions with something the server would not take; that much stays in this browser. */
  localOnlyIds: ReadonlySet<string>;
}

interface UnsavedProject {
  /** Its title, batches or failed generations changed. */
  meta: boolean;
  /** Requests of its conversation that changed. */
  turns: string[];
  /** Its board changed. */
  nodes: boolean;
}

/** What this browser remembers about one account's projects between visits. */
interface SyncMemory {
  /** Projects the server is known to hold. */
  synced: string[];
  unsaved: Record<string, UnsavedProject>;
  /** Projects deleted here that the server has yet to be told about. */
  deleted: string[];
  /**
   * Sessions the server will not take: their id is another account's project, or it
   * refused them as they are. They stay in this browser.
   */
  foreign: string[];
  /** Projects on the server that lack a request or a board it refused, with what it refused. */
  refused: Record<string, string[]>;
}

type Flag = 'meta' | 'nodes' | `turn:${string}`;
type Outcome = 'done' | 'retry' | 'stop';

const NO_IDS: ReadonlySet<string> = new Set();
const IDLE: ProjectSyncState = {
  ownerUserId: null,
  listed: false,
  projectIds: NO_IDS,
  agentProjectIds: NO_IDS,
  loadedIds: NO_IDS,
  failing: false,
  localOnlyIds: NO_IDS,
};

const store = createExternalStore<ProjectSyncState>(IDLE);

function emptyMemory(): SyncMemory {
  return { synced: [], unsaved: {}, deleted: [], foreign: [], refused: {} };
}

let memory = emptyMemory();
/** The signed-in account's batches, once its history is read; they tell whose a session is. */
let ownBatchIds: ReadonlySet<string> | null = null;
/** True once the server's list was really read, which sending a session it lacks waits for. */
let listRead = false;
/** Counts sign-ins and sign-outs; an answer that arrives for an earlier one is dropped. */
let run = 0;
let syncingRun: number | null = null;
let syncAgain = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryStep = 0;
/** Counts the changes to each thing to save, so one that changed mid-request is sent again. */
const serials = new Map<string, number>();
const loading = new Set<string>();
const loadAttempts = new Map<string, number>();
const loadTimers = new Set<ReturnType<typeof setTimeout>>();

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

function parseMemory(value: unknown): SyncMemory {
  if (!isRecord(value)) return emptyMemory();
  const unsaved: Record<string, UnsavedProject> = {};
  if (isRecord(value.unsaved)) {
    for (const [projectId, entry] of Object.entries(value.unsaved)) {
      if (!isRecord(entry)) continue;
      unsaved[projectId] = {
        meta: entry.meta === true,
        turns: isStrings(entry.turns) ? [...entry.turns] : [],
        nodes: entry.nodes === true,
      };
    }
  }
  return {
    synced: isStrings(value.synced) ? [...value.synced] : [],
    unsaved,
    deleted: isStrings(value.deleted) ? [...value.deleted] : [],
    foreign: isStrings(value.foreign) ? [...value.foreign] : [],
    refused: isRecord(value.refused)
      ? Object.fromEntries(
          Object.entries(value.refused).flatMap(([projectId, flags]) =>
            isStrings(flags) && flags.length > 0 ? [[projectId, [...flags]]] : [],
          ),
        )
      : {},
  };
}

function readMemories(): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(PROJECT_SYNC_STORAGE_KEY) ?? '{}',
    );
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function persistMemory(): void {
  const userId = store.getSnapshot().ownerUserId;
  if (userId === null) return;
  try {
    window.localStorage.setItem(
      PROJECT_SYNC_STORAGE_KEY,
      JSON.stringify({ ...readMemories(), [userId]: memory }),
    );
  } catch {
    // What is unsaved is still sent while the page stays open.
  }
}

function serialKey(projectId: string, flag: Flag): string {
  return `${projectId}\n${flag}`;
}

function serialOf(projectId: string, flag: Flag): number {
  return serials.get(serialKey(projectId, flag)) ?? 0;
}

function bump(projectId: string, flag: Flag): void {
  serials.set(serialKey(projectId, flag), serialOf(projectId, flag) + 1);
}

/** The account has, or is about to have, this session on the server. */
function isTracked(projectId: string): boolean {
  return memory.synced.includes(projectId) || memory.unsaved[projectId] !== undefined;
}

function setFailing(failing: boolean): void {
  if (store.getSnapshot().failing !== failing) store.set((state) => ({ ...state, failing }));
}

function localOnlyIds(): ReadonlySet<string> {
  return new Set([...memory.foreign, ...Object.keys(memory.refused)]);
}

/** Records that the server refused a part of a project, or took it after all. */
function setRefused(projectId: string, flag: Flag, refused: boolean): void {
  const flags = memory.refused[projectId] ?? [];
  if (flags.includes(flag) === refused) return;
  const next = refused ? [...flags, flag] : flags.filter((candidate) => candidate !== flag);
  if (next.length === 0) delete memory.refused[projectId];
  else memory.refused[projectId] = next;
  persistMemory();
  store.set((state) => ({ ...state, localOnlyIds: localOnlyIds() }));
}

function withId(ids: ReadonlySet<string>, id: string): ReadonlySet<string> {
  return ids.has(id) ? ids : new Set([...ids, id]);
}

function withoutId(ids: ReadonlySet<string>, id: string): ReadonlySet<string> {
  return ids.has(id) ? new Set([...ids].filter((candidate) => candidate !== id)) : ids;
}

function scheduleSave(delay = PROJECT_SAVE_DELAY_MS): void {
  // While the server cannot be reached, the next attempt sends everything.
  if (store.getSnapshot().ownerUserId === null || retryTimer !== null) return;
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void sync();
  }, delay);
}

function scheduleRetry(): void {
  if (retryTimer !== null) return;
  const delay = RETRY_DELAYS_MS[Math.min(retryStep, RETRY_DELAYS_MS.length - 1)];
  retryStep += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void sync();
  }, delay);
}

function markUnsaved(
  projectId: string,
  change: { meta?: boolean; turns?: readonly string[]; nodes?: boolean },
): void {
  const entry = memory.unsaved[projectId] ?? { meta: false, turns: [], nodes: false };
  memory.unsaved[projectId] = {
    meta: entry.meta || change.meta === true,
    turns: [...new Set([...entry.turns, ...(change.turns ?? [])])],
    nodes: entry.nodes || change.nodes === true,
  };
  if (change.meta === true) bump(projectId, 'meta');
  change.turns?.forEach((turnId) => bump(projectId, `turn:${turnId}`));
  if (change.nodes === true) bump(projectId, 'nodes');
  persistMemory();
  scheduleSave();
}

function markAllUnsaved(projectId: string): void {
  markUnsaved(projectId, {
    meta: true,
    turns: (getAgentConversations()[projectId] ?? []).map((turn) => turn.id),
    nodes: Object.keys(getCanvasLayout(projectId)).length > 0,
  });
}

/** Marks one thing as saved, unless it changed again while the request was on its way. */
function settle(projectId: string, flag: Flag, serial: number): void {
  const entry = memory.unsaved[projectId];
  if (entry === undefined || serialOf(projectId, flag) !== serial) return;
  const next: UnsavedProject =
    flag === 'meta'
      ? { ...entry, meta: false }
      : flag === 'nodes'
        ? { ...entry, nodes: false }
        : { ...entry, turns: entry.turns.filter((turnId) => `turn:${turnId}` !== flag) };
  if (!next.meta && !next.nodes && next.turns.length === 0) delete memory.unsaved[projectId];
  else memory.unsaved[projectId] = next;
  persistMemory();
}

/**
 * Takes up the sessions in this browser that belong to the account and the server lacks:
 * work from before projects were kept there, or begun while the server was out of reach.
 */
function adoptOwnSessions(): void {
  const userId = store.getSnapshot().ownerUserId;
  if (userId === null || !listRead) return;
  const conversations = getAgentConversations();
  for (const session of getGenerationSessions()) {
    if (
      isTracked(session.id) ||
      memory.foreign.includes(session.id) ||
      memory.deleted.includes(session.id)
    ) {
      continue;
    }
    const turns = conversations[session.id] ?? [];
    if (ownsSession(session, turns, userId, ownBatchIds ?? NO_IDS)) markAllUnsaved(session.id);
  }
}

/** A session removed here: its project goes from the server, its conversation and board too. */
function forget(projectId: string): void {
  const wasSynced = memory.synced.includes(projectId);
  memory.synced = memory.synced.filter((id) => id !== projectId);
  memory.foreign = memory.foreign.filter((id) => id !== projectId);
  delete memory.refused[projectId];
  delete memory.unsaved[projectId];
  if (wasSynced && !memory.deleted.includes(projectId)) memory.deleted.push(projectId);
  persistMemory();
  replaceAgentConversation(projectId, null);
  replaceCanvasLayout(projectId, null);
  store.set((state) => ({
    ...state,
    projectIds: withoutId(state.projectIds, projectId),
    agentProjectIds: withoutId(state.agentProjectIds, projectId),
    localOnlyIds: withoutId(state.localOnlyIds, projectId),
  }));
  if (wasSynced) scheduleSave(0);
}

type Failure = 'retry' | 'signedOut' | 'gone' | 'foreign' | 'refused';

function failureOf(error: unknown): Failure {
  if (!(error instanceof ImageApiError)) return 'retry';
  if (error.status === 401) return 'signedOut';
  if (error.status === 403) return 'foreign';
  if (error.status === 404) return 'gone';
  if (error.status === 400 || error.status === 413 || error.status === 422) return 'refused';
  return 'retry';
}

/** Sends everything one project has unsaved: itself first, then its requests and board. */
async function saveProjectChanges(
  projectId: string,
  started: number,
  mayRecreate: boolean,
): Promise<Outcome> {
  const session = getGenerationSessions().find((candidate) => candidate.id === projectId);
  if (session === undefined) {
    delete memory.unsaved[projectId];
    persistMemory();
    return 'done';
  }

  /** Stops sending the session: the server will not take it. */
  const disown = (): void => {
    memory.synced = memory.synced.filter((id) => id !== projectId);
    memory.foreign = [...new Set([...memory.foreign, projectId])];
    delete memory.unsaved[projectId];
    delete memory.refused[projectId];
    persistMemory();
    store.set((state) => ({ ...state, localOnlyIds: localOnlyIds() }));
  };

  const send = async (
    flag: Flag,
    request: () => Promise<void>,
  ): Promise<'saved' | 'refused' | 'gone' | 'disowned' | 'retry' | 'stop'> => {
    const serial = serialOf(projectId, flag);
    try {
      await request();
    } catch (error) {
      if (started !== run) return 'stop';
      const failure = failureOf(error);
      if (failure === 'retry') return 'retry';
      if (failure === 'signedOut') return 'stop';
      if (failure === 'gone') return 'gone';
      if (failure === 'foreign') {
        disown();
        return 'disowned';
      }
      // Sent again as it is it would be refused again, so it stays in this browser only
      // until it changes.
      settle(projectId, flag, serial);
      if (flag !== 'meta') setRefused(projectId, flag, true);
      return 'refused';
    }
    if (started !== run) return 'stop';
    settle(projectId, flag, serial);
    setRefused(projectId, flag, false);
    return 'saved';
  };

  /** The server lost the project while this page still works on it: send all of it again. */
  const recreate = (): Promise<Outcome> => {
    if (!mayRecreate) return Promise.resolve('retry');
    memory.synced = memory.synced.filter((id) => id !== projectId);
    markAllUnsaved(projectId);
    return saveProjectChanges(projectId, started, false);
  };

  if (memory.unsaved[projectId]?.meta === true || !memory.synced.includes(projectId)) {
    const result = await send('meta', () => saveProject(projectId, projectPayload(session)));
    if (result === 'retry' || result === 'stop') return result;
    if (result === 'gone') return 'retry';
    if (result === 'refused') disown();
    if (result === 'disowned' || result === 'refused') return 'done';
    if (!getGenerationSessions().some((candidate) => candidate.id === projectId)) {
      // Removed here while its save was on its way: the server must drop it again.
      if (!memory.deleted.includes(projectId)) memory.deleted.push(projectId);
      delete memory.unsaved[projectId];
      persistMemory();
      scheduleSave(0);
      return 'done';
    }
    if (!memory.synced.includes(projectId)) memory.synced.push(projectId);
    persistMemory();
    store.set((state) => ({ ...state, projectIds: withId(state.projectIds, projectId) }));
  }

  for (const turnId of [...(memory.unsaved[projectId]?.turns ?? [])]) {
    const flag: Flag = `turn:${turnId}`;
    const turn = getAgentConversations()[projectId]?.find((candidate) => candidate.id === turnId);
    if (turn === undefined) {
      settle(projectId, flag, serialOf(projectId, flag));
      continue;
    }
    const result = await send(flag, () => saveProjectTurn(projectId, turn));
    if (result === 'gone') return recreate();
    if (result === 'retry' || result === 'stop') return result;
    if (result === 'disowned') return 'done';
    if (result === 'refused') continue;
    store.set((state) => ({
      ...state,
      agentProjectIds: withId(state.agentProjectIds, projectId),
    }));
  }

  if (memory.unsaved[projectId]?.nodes === true) {
    const result = await send('nodes', () =>
      saveProjectNodes(projectId, getCanvasLayout(projectId)),
    );
    if (result === 'gone') return recreate();
    if (result === 'retry' || result === 'stop') return result;
  }
  return 'done';
}

async function saveEverything(started: number): Promise<Outcome> {
  for (const projectId of [...memory.deleted]) {
    try {
      await deleteProject(projectId);
    } catch (error) {
      if (started !== run) return 'stop';
      const failure = failureOf(error);
      if (failure === 'retry') return 'retry';
      if (failure === 'signedOut') return 'stop';
    }
    if (started !== run) return 'stop';
    memory.deleted = memory.deleted.filter((id) => id !== projectId);
    persistMemory();
  }
  for (const projectId of Object.keys(memory.unsaved)) {
    const outcome = await saveProjectChanges(projectId, started, true);
    if (outcome !== 'done') return outcome;
  }
  return 'done';
}

/** Makes this browser's sessions match the server's list, keeping what is unsaved here. */
function applyList(remote: readonly RemoteProject[], knownBefore: ReadonlySet<string>): void {
  const deleted = new Set(memory.deleted);
  const remoteIds = new Set(remote.map((project) => project.id));
  const incoming = new Map<string, GenerationSession>();
  const agentIds = new Set<string>();
  for (const project of remote) {
    if (deleted.has(project.id)) continue;
    const session = sessionFromRemote(project);
    if (session !== null) incoming.set(project.id, session);
    if (project.turnCount > 0) agentIds.add(project.id);
  }
  // Known to be on the server when the list was asked for, and no longer in it: the
  // project was deleted from another device.
  const gone: string[] = [];
  replaceGenerationSessions((current) => {
    const next: GenerationSession[] = [];
    const seen = new Set<string>();
    for (const local of current) {
      seen.add(local.id);
      const session = incoming.get(local.id);
      if (session !== undefined) {
        next.push(
          memory.unsaved[local.id]?.meta === true ? local : mergeRemoteSession(session, local),
        );
      } else if (knownBefore.has(local.id) && !remoteIds.has(local.id)) gone.push(local.id);
      else next.push(local);
    }
    for (const [id, session] of incoming) if (!seen.has(id)) next.push(session);
    // The list is kept with the session worked on most recently first.
    return next.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  });
  for (const projectId of gone) {
    replaceAgentConversation(projectId, null);
    replaceCanvasLayout(projectId, null);
    delete memory.unsaved[projectId];
  }
  memory.synced = [
    ...new Set([...memory.synced.filter((id) => !gone.includes(id)), ...remoteIds]),
  ].filter((id) => !deleted.has(id));
  persistMemory();
  listRead = true;
  store.set((state) => ({
    ...state,
    listed: true,
    projectIds: new Set(memory.synced),
    agentProjectIds: agentIds,
  }));
  adoptOwnSessions();
}

async function readList(started: number): Promise<Outcome> {
  const knownBefore = new Set(memory.synced);
  let remote: RemoteProject[];
  try {
    remote = await fetchProjects();
  } catch (error) {
    if (started !== run) return 'stop';
    // The page goes on with what this browser has; the list is asked for again later.
    store.set((state) => (state.listed ? state : { ...state, listed: true }));
    return failureOf(error) === 'signedOut' ? 'stop' : 'retry';
  }
  if (started !== run) return 'stop';
  applyList(remote, knownBefore);
  return 'done';
}

/** Sends what is unsaved, then reads the server's list if it has not been read yet. */
async function sync(): Promise<void> {
  const started = run;
  if (store.getSnapshot().ownerUserId === null) return;
  if (syncingRun === started) {
    syncAgain = true;
    return;
  }
  syncingRun = started;
  syncAgain = false;
  let outcome: Outcome;
  try {
    outcome = await saveEverything(started);
    if (started === run && !listRead && outcome !== 'stop') {
      const listOutcome = await readList(started);
      if (outcome === 'done' || listOutcome === 'stop') outcome = listOutcome;
    }
  } finally {
    if (syncingRun === started) syncingRun = null;
  }
  if (started !== run || outcome === 'stop') return;
  if (outcome === 'retry') {
    setFailing(true);
    scheduleRetry();
    return;
  }
  retryStep = 0;
  setFailing(false);
  if (syncAgain) scheduleSave(0);
}

function resetRun(): void {
  run += 1;
  if (saveTimer !== null) clearTimeout(saveTimer);
  if (retryTimer !== null) clearTimeout(retryTimer);
  loadTimers.forEach((timer) => clearTimeout(timer));
  loadTimers.clear();
  saveTimer = null;
  retryTimer = null;
  retryStep = 0;
  syncAgain = false;
  listRead = false;
  ownBatchIds = null;
  serials.clear();
  loading.clear();
  loadAttempts.clear();
}

function start(userId: string): void {
  if (store.getSnapshot().ownerUserId === userId) return;
  resetRun();
  memory = parseMemory(readMemories()[userId]);
  store.set({
    ...IDLE,
    ownerUserId: userId,
    projectIds: new Set(memory.synced),
    localOnlyIds: localOnlyIds(),
  });
  void sync();
}

function stop(): void {
  if (store.getSnapshot().ownerUserId === null) return;
  resetRun();
  memory = emptyMemory();
  store.set(IDLE);
}

function setOwnBatchIds(userId: string, batchIds: ReadonlySet<string>): void {
  if (store.getSnapshot().ownerUserId !== userId) return;
  ownBatchIds = batchIds;
  adoptOwnSessions();
}

/** Applies a project's conversation and board as the server holds them. */
function applyDetail(projectId: string, detail: RemoteProjectDetail): void {
  const unsaved = memory.unsaved[projectId];
  const unsavedTurns = new Set(unsaved?.turns ?? []);
  const remoteTurns = detail.turns.flatMap((value) => {
    const turn = parseAgentTurn(value);
    return turn === null ? [] : [turn];
  });
  const remoteIds = new Set(remoteTurns.map((turn) => turn.id));
  const local = getAgentConversations()[projectId] ?? [];
  replaceAgentConversation(
    projectId,
    mergeRemoteTurns(
      remoteTurns,
      local,
      // In memory only the page working on a request holds it as planning or running.
      (turn) =>
        unsavedTurns.has(turn.id) || turn.status === 'planning' || turn.status === 'running',
    ),
  );
  const unsent = local
    .filter((turn) => !remoteIds.has(turn.id) && !unsavedTurns.has(turn.id))
    .map((turn) => turn.id);
  if (unsent.length > 0) markUnsaved(projectId, { turns: unsent });
  if (unsaved?.nodes !== true && Object.keys(detail.positions).length > 0) {
    replaceCanvasLayout(projectId, { ...getCanvasLayout(projectId), ...detail.positions });
  }
  if (remoteTurns.length > 0) {
    store.set((state) => ({
      ...state,
      agentProjectIds: withId(state.agentProjectIds, projectId),
    }));
  }
}

function markLoaded(projectId: string): void {
  store.set((state) => ({ ...state, loadedIds: withId(state.loadedIds, projectId) }));
}

/**
 * Reads a project's conversation and board from the server, once per visit. A project the
 * server does not have is ready at once: everything about it is already here.
 */
export function loadProject(projectId: string): void {
  const state = store.getSnapshot();
  if (state.ownerUserId === null || !state.listed) return;
  if (state.loadedIds.has(projectId) || loading.has(projectId)) return;
  if (!state.projectIds.has(projectId)) {
    markLoaded(projectId);
    return;
  }
  loading.add(projectId);
  const started = run;
  fetchProject(projectId)
    .then(
      (detail) => {
        if (started !== run) return;
        if (detail !== null) applyDetail(projectId, detail);
        markLoaded(projectId);
      },
      () => {
        if (started !== run) return;
        const attempt = loadAttempts.get(projectId) ?? 0;
        const delay = LOAD_RETRY_DELAYS_MS[attempt];
        // After the last attempt the page works with what this browser has.
        if (delay === undefined) {
          markLoaded(projectId);
          return;
        }
        loadAttempts.set(projectId, attempt + 1);
        const timer = setTimeout(() => {
          loadTimers.delete(timer);
          loadProject(projectId);
        }, delay);
        loadTimers.add(timer);
      },
    )
    .finally(() => loading.delete(projectId));
}

onGenerationSessionsWritten((next, previous) => {
  if (store.getSnapshot().ownerUserId === null) return;
  const before = new Map(previous.map((session) => [session.id, session]));
  const after = new Set(next.map((session) => session.id));
  for (const session of next) {
    if (before.get(session.id) !== session && isTracked(session.id)) {
      markUnsaved(session.id, { meta: true });
    }
  }
  for (const session of previous) if (!after.has(session.id)) forget(session.id);
  adoptOwnSessions();
});

onAgentConversationsWritten((next, previous) => {
  if (store.getSnapshot().ownerUserId === null) return;
  for (const [projectId, turns] of Object.entries(next)) {
    const old = previous[projectId];
    if (old === turns || !isTracked(projectId)) continue;
    const before = new Map((old ?? []).map((turn) => [turn.id, turn]));
    const changed = turns.filter((turn) => before.get(turn.id) !== turn).map((turn) => turn.id);
    if (changed.length > 0) markUnsaved(projectId, { turns: changed });
  }
  adoptOwnSessions();
});

onCanvasLayoutWritten((projectId) => {
  if (store.getSnapshot().ownerUserId === null || !isTracked(projectId)) return;
  markUnsaved(projectId, { nodes: true });
});

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (retryTimer === null) return;
    clearTimeout(retryTimer);
    retryTimer = null;
    void sync();
  });
  // Another tab of the same account wrote down what it knows and has yet to save. Taking
  // it up keeps the two from overwriting each other's notes, and lets this tab send what
  // that one leaves unsaved when it is closed.
  window.addEventListener('storage', (event) => {
    const userId = store.getSnapshot().ownerUserId;
    if (event.key !== PROJECT_SYNC_STORAGE_KEY || userId === null) return;
    memory = parseMemory(readMemories()[userId]);
    store.set((state) => ({
      ...state,
      projectIds: new Set(memory.synced),
      localOnlyIds: localOnlyIds(),
    }));
    if (Object.keys(memory.unsaved).length > 0 || memory.deleted.length > 0) scheduleSave();
  });
}

/**
 * The state of the account's projects against the server. Whichever component reads it
 * also keeps the sync running for the signed-in account.
 */
export function useProjectSync(): ProjectSyncState {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const { user, isAuthenticated, isLoading } = useAuth();
  const history = useImageHistory();
  const userId = isAuthenticated ? (user?.id ?? null) : null;

  useEffect(() => {
    if (isLoading) return;
    if (userId === null) stop();
    else start(userId);
  }, [isLoading, userId]);

  useEffect(() => {
    if (userId === null || !history.isHydrated) return;
    setOwnBatchIds(userId, new Set(history.batches.map((batch) => batch.batchId)));
  }, [history.batches, history.isHydrated, userId]);

  return state.ownerUserId === userId ? state : IDLE;
}

/**
 * Whether a project's conversation and board are ready to work on: read from the server,
 * or known to exist only here. Until then nothing should be placed on its board, or places
 * made up here would replace the ones the server holds.
 */
export function useProjectReady(projectId: string | null): boolean {
  const state = useProjectSync();
  const { isAuthenticated, isLoading } = useAuth();
  const { listed, projectIds } = state;

  useEffect(() => {
    if (projectId !== null && listed) loadProject(projectId);
  }, [listed, projectId, projectIds]);

  if (projectId === null) return true;
  if (isLoading) return false;
  if (!isAuthenticated) return true;
  return state.listed && state.loadedIds.has(projectId);
}

export function resetProjectSyncForTests(): void {
  resetRun();
  syncingRun = null;
  memory = emptyMemory();
  store.set(IDLE);
}
