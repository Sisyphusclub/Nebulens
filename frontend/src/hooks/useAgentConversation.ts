import { useMemo, useSyncExternalStore } from 'react';

import { createExternalStore } from '@/lib/externalStore';
import { isRecord } from '@/utils/narrowing';
import { readSkillRun, type SkillRunRequest } from '@/utils/skillRun';

export const AGENT_CONVERSATIONS_STORAGE_KEY = 'nebulens.agent-conversations.v1';

/**
 * Where a request to the Agent stands. Planning and running live in the page, so a turn
 * found in either state after a reload was cut off and reads as interrupted.
 */
export type AgentTurnStatus =
  | 'planning'
  | 'awaiting'
  | 'running'
  | 'done'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

const STATUSES: readonly AgentTurnStatus[] = [
  'planning',
  'awaiting',
  'running',
  'done',
  'failed',
  'cancelled',
  'interrupted',
];

/** A picture from the board sent with a request as a reference. */
export interface AgentReference {
  id: string;
  imageUrl: string;
}

/** One request to the Agent and what came of it. */
export interface AgentTurn {
  id: string;
  createdAt: string;
  /** What was typed, the skill's "/name" included when there was one. */
  brief: string;
  references: AgentReference[];
  status: AgentTurnStatus;
  /** A skill typed with the request; the Agent then only plans it. */
  requestedSkill?: string;
  /** How long it took to read the request and pick a way to make it. */
  thinkingMs?: number;
  /** The skill it picked; null when none fitted and it planned the pictures itself. */
  chosenSkill?: string | null;
  /** The text model could not be asked, so no skill was weighed before planning freely. */
  selectionFailed?: boolean;
  planningMs?: number;
  planTitle?: string;
  plan?: SkillRunRequest;
  /** How many pictures the plan had when it came back, before any were dropped from it. */
  plannedCount?: number;
  /** How many of the plan's pictures have been started, and how many of them failed. */
  started: number;
  failed: number;
  /** The batches the plan made, in order. */
  batchIds: string[];
  /** What happened along the way, such as a picture redrawn for wrong text. */
  notes: string[];
  error?: string;
}

type Conversations = Readonly<Record<string, readonly AgentTurn[]>>;

const isString = (value: unknown): value is string => typeof value === 'string';
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;
const isDuration = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

function parseTurn(value: unknown): AgentTurn | null {
  if (!isRecord(value)) return null;
  const status = STATUSES.find((candidate) => candidate === value.status);
  const references = Array.isArray(value.references)
    ? value.references.filter(
        (reference): reference is AgentReference =>
          isRecord(reference) && isString(reference.id) && isString(reference.imageUrl),
      )
    : [];
  if (
    !isString(value.id) ||
    !isString(value.createdAt) ||
    !isString(value.brief) ||
    status === undefined ||
    !Array.isArray(value.batchIds) ||
    !value.batchIds.every(isString)
  ) {
    return null;
  }
  const plan = value.plan === undefined ? null : readSkillRun({ skillRun: value.plan });
  return {
    id: value.id,
    createdAt: value.createdAt,
    brief: value.brief,
    references: references.map(({ id, imageUrl }) => ({ id, imageUrl })),
    status: status === 'planning' || status === 'running' ? 'interrupted' : status,
    ...(isString(value.requestedSkill) ? { requestedSkill: value.requestedSkill } : {}),
    ...(isDuration(value.thinkingMs) ? { thinkingMs: value.thinkingMs } : {}),
    ...(isString(value.chosenSkill) || value.chosenSkill === null
      ? { chosenSkill: value.chosenSkill }
      : {}),
    ...(value.selectionFailed === true ? { selectionFailed: true } : {}),
    ...(isDuration(value.planningMs) ? { planningMs: value.planningMs } : {}),
    ...(isString(value.planTitle) ? { planTitle: value.planTitle } : {}),
    ...(plan === null ? {} : { plan }),
    ...(isCount(value.plannedCount) ? { plannedCount: value.plannedCount } : {}),
    started: isCount(value.started) ? value.started : 0,
    failed: isCount(value.failed) ? value.failed : 0,
    batchIds: [...value.batchIds],
    notes: Array.isArray(value.notes) ? value.notes.filter(isString) : [],
    ...(isString(value.error) ? { error: value.error } : {}),
  };
}

function readConversations(): Conversations {
  if (typeof window === 'undefined') return {};
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(AGENT_CONVERSATIONS_STORAGE_KEY) ?? '{}',
    );
    if (!isRecord(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([sessionId, turns]) => {
        if (!Array.isArray(turns)) return [];
        const valid = turns.map(parseTurn).filter((turn): turn is AgentTurn => turn !== null);
        return valid.length > 0 ? [[sessionId, valid]] : [];
      }),
    );
  } catch {
    return {};
  }
}

const store = createExternalStore<Conversations>(readConversations());

function save(next: Conversations): void {
  store.set(next);
  try {
    window.localStorage.setItem(AGENT_CONVERSATIONS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The conversation still works for this tab without storage.
  }
}

export function addAgentTurn(sessionId: string, turn: AgentTurn): void {
  const current = store.getSnapshot();
  save({ ...current, [sessionId]: [...(current[sessionId] ?? []), turn] });
}

/** Changes one turn; a function receives the turn as it is now, so counts never go stale. */
export function updateAgentTurn(
  sessionId: string,
  turnId: string,
  patch: Partial<AgentTurn> | ((turn: AgentTurn) => Partial<AgentTurn>),
): void {
  const current = store.getSnapshot();
  const turns = current[sessionId];
  if (turns === undefined || !turns.some((turn) => turn.id === turnId)) return;
  save({
    ...current,
    [sessionId]: turns.map((turn) =>
      turn.id === turnId
        ? { ...turn, ...(typeof patch === 'function' ? patch(turn) : patch) }
        : turn,
    ),
  });
}

const NO_TURNS: readonly AgentTurn[] = [];

/** The conversation with the Agent in one session, oldest request first. */
export function useAgentConversation(sessionId: string | null): readonly AgentTurn[] {
  const conversations = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return sessionId === null ? NO_TURNS : (conversations[sessionId] ?? NO_TURNS);
}

/** The sessions that hold a conversation with the Agent, which open on the canvas. */
export function useAgentSessionIds(): ReadonlySet<string> {
  const conversations = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return useMemo(() => new Set(Object.keys(conversations)), [conversations]);
}

export function resetAgentConversationsForTests(): void {
  save({});
  window.localStorage.removeItem(AGENT_CONVERSATIONS_STORAGE_KEY);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === AGENT_CONVERSATIONS_STORAGE_KEY) store.set(readConversations());
  });
}
