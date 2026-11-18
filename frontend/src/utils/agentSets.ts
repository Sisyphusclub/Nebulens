import type { AgentTurn } from '@/hooks/useAgentConversation';
import { ANALYSIS_POLL_WINDOW_MS } from '@/hooks/useImageHistory';
import type { HistoryEntry } from '@/types/image';
import { boardSlots, slotKey } from '@/utils/canvasLayout';
import type { FeedItem } from '@/utils/generationFeed';
import { describeTextIssues, promptQuotesText } from '@/utils/textCheck';

/**
 * Where a picture's text check stands: still running, passed, wrong, wrong and redrawn,
 * not done because the check failed, or nothing to check (no quoted text, or no checker).
 */
export type PieceCheck = 'checking' | 'passed' | 'issues' | 'redrawn' | 'unchecked' | 'none';

export const PIECE_CHECK_LABELS: Readonly<Record<Exclude<PieceCheck, 'none'>, string>> = {
  checking: '核对文字中',
  passed: '文字无误',
  issues: '文字有误',
  redrawn: '文字有误，已重画',
  unchecked: '未能核对文字',
};

/** One picture of a set, as the board and the conversation name it. */
export interface SetPiece {
  /** The picture's key on the board, its record id. */
  key: string;
  /** Its name in the plan, such as "主海报". */
  label: string;
  /** The shape it was asked for, such as "3:4". */
  aspect: string;
  check: PieceCheck;
  /** The wrong or deformed text the check found, one line each. */
  issues: string[];
  /** Set on a redraw: the picture whose text it fixes. */
  redrawOf?: string;
  entry: HistoryEntry;
}

/** The pictures one request made, kept together on the board and in the conversation. */
export interface AgentSet {
  turnId: string;
  title: string;
  /** How many pictures the plan asked for. */
  planned: number;
  /** Its pictures are still being made. */
  running: boolean;
  /** Every board key the set covers: its pictures, their redraws, and pictures being made. */
  keys: string[];
  pieces: SetPiece[];
  /** One picture per planned piece, in the plan's order: the redraw when there is one. */
  finals: SetPiece[];
}

export function pieceCheck(entry: HistoryEntry, redrawn: boolean, now: number): PieceCheck {
  const { record } = entry;
  if (redrawn) return 'redrawn';
  if (record.textCheck !== undefined) {
    return record.textCheck.status === 'passed' ? 'passed' : 'issues';
  }
  if (!promptQuotesText(record.prompt)) return 'none';
  if (
    record.analysisStatus === 'pending' &&
    now - Date.parse(record.createdAt) < ANALYSIS_POLL_WINDOW_MS
  ) {
    return 'checking';
  }
  return record.analysisStatus === 'failed' ? 'unchecked' : 'none';
}

/**
 * The plan's name for a batch. Requests kept from before batches were named fall back to the
 * step with the same prompt, then, when nothing failed, to the plan's order.
 */
function labelOf(turn: AgentTurn, item: FeedItem, index: number): string | undefined {
  const named = turn.batchLabels?.[item.id];
  if (named !== undefined) return named;
  const steps = turn.plan?.steps ?? [];
  const samePrompt = steps.find((step) => step.settings.prompt === item.settings.prompt);
  if (samePrompt !== undefined) return samePrompt.label;
  return turn.failed === 0 && turn.batchIds.length === steps.length
    ? steps[index]?.label
    : undefined;
}

function piece(
  entry: HistoryEntry,
  label: string,
  aspect: string,
  check: PieceCheck,
  redrawOf?: string,
): SetPiece {
  const textCheck = entry.record.textCheck;
  return {
    key: entry.record.id,
    label,
    aspect,
    check,
    issues: textCheck === undefined ? [] : describeTextIssues(textCheck),
    ...(redrawOf === undefined ? {} : { redrawOf }),
    entry,
  };
}

/**
 * The request each failure card belongs to. A piece that could not be made leaves a card on
 * the board but no batch with its request, so the card is matched by its prompt to the plan
 * that asked for it: of the requests with such a piece, the latest one sent before it.
 */
function failureOwners(
  turns: readonly AgentTurn[],
  feed: readonly FeedItem[],
): Map<string, string[]> {
  const claimed = new Set(
    turns.flatMap((turn) => [...turn.batchIds, ...Object.keys(turn.redraws ?? {})]),
  );
  const owners = new Map<string, string[]>();
  for (const item of feed) {
    if (item.error === undefined || claimed.has(item.id)) continue;
    const planned = turns.filter((turn) =>
      turn.plan?.steps.some((step) => step.settings.prompt === item.settings.prompt),
    );
    const sentBefore = planned.filter((turn) => turn.createdAt.localeCompare(item.createdAt) <= 0);
    const owner = sentBefore.at(-1) ?? planned[0];
    if (owner === undefined) continue;
    owners.set(owner.id, [...(owners.get(owner.id) ?? []), slotKey(item.id, 0)]);
  }
  return owners;
}

/**
 * Groups the board's pictures by the request that made them. A request still running also
 * covers the pictures being made, since on the Agent's board only its run is generating.
 * A set that made something also covers the cards of its pieces that failed.
 */
export function agentSets(
  turns: readonly AgentTurn[],
  feed: readonly FeedItem[],
  now = Date.now(),
): AgentSet[] {
  const byId = new Map(feed.map((item) => [item.id, item]));
  const failures = failureOwners(turns, feed);
  const last = turns.at(-1);
  return turns.flatMap((turn): AgentSet[] => {
    if (turn.plan === undefined) return [];
    const title = turn.planTitle ?? turn.plan.skillLabel;
    const redraws = Object.entries(turn.redraws ?? {});
    const redrawn = new Set(redraws.map(([, original]) => original));
    const pieces: SetPiece[] = [];
    turn.batchIds.forEach((batchId, index) => {
      const item = byId.get(batchId);
      if (item === undefined) return;
      const label = labelOf(turn, item, index) ?? title;
      for (const entry of item.entries) {
        const check = pieceCheck(entry, redrawn.has(entry.record.id), now);
        pieces.push(piece(entry, label, item.settings.aspectRatio, check));
      }
    });
    for (const [batchId, original] of redraws) {
      const item = byId.get(batchId);
      const source = pieces.find((candidate) => candidate.key === original);
      if (item === undefined || source === undefined) continue;
      for (const entry of item.entries) {
        pieces.push(
          piece(entry, source.label, source.aspect, pieceCheck(entry, false, now), original),
        );
      }
    }
    const keys = pieces.map((candidate) => candidate.key);
    const running = turn === last && turn.status === 'running';
    if (running) {
      for (const slot of boardSlots(feed)) if (slot.kind === 'pending') keys.push(slot.key);
    }
    if (keys.length === 0) return [];
    keys.push(...(failures.get(turn.id) ?? []));
    const finals = pieces
      .filter((candidate) => candidate.redrawOf === undefined)
      .map((original) => pieces.find((other) => other.redrawOf === original.key) ?? original);
    return [
      { turnId: turn.id, title, planned: turn.plan.steps.length, running, keys, pieces, finals },
    ];
  });
}

/** A name a file can carry: no path separators or characters a file system refuses. */
function fileSafe(text: string): string {
  return text
    .replace(/[\\/:*?"<>|\s]+/g, ' ')
    .trim()
    .replace(/ /g, '-');
}

/** Names a set's pictures in order, as "<set>-<n>-<piece>.png". */
export function setFileName(set: Pick<AgentSet, 'title'>, index: number, label: string): string {
  return `${fileSafe(set.title)}-${index + 1}-${fileSafe(label)}.png`;
}
