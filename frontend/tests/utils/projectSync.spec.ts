import { describe, expect, it } from 'vitest';

import type { AgentTurn } from '@/hooks/useAgentConversation';
import type { GenerationSession, PersistedGenerationTask } from '@/hooks/useGenerationSessions';
import {
  mergeRemoteSession,
  mergeRemoteTurns,
  ownsSession,
  projectPayload,
  sessionFromRemote,
} from '@/utils/projectSync';

const SETTINGS = {
  prompt: '山川茶事新品海报',
  model: 'gpt-image-2',
  count: 1,
  aspectRatio: '3:4' as const,
  resolution: 'standard' as const,
  isPublic: false,
  referenceIds: [],
};

function task(id: string, error?: string): PersistedGenerationTask {
  return {
    id,
    createdAt: '2026-11-17T08:04:00.000Z',
    settings: SETTINGS,
    ...(error === undefined ? {} : { error }),
  };
}

function session(overrides: Partial<GenerationSession> = {}): GenerationSession {
  return {
    id: 'project-1',
    title: '山川茶事新品海报',
    createdAt: '2026-11-17T08:00:00.000Z',
    updatedAt: '2026-11-17T08:05:00.000Z',
    batchIds: [],
    transientTasks: [],
    ...overrides,
  };
}

function turn(id: string, overrides: Partial<AgentTurn> = {}): AgentTurn {
  return {
    id,
    createdAt: '2026-11-17T08:01:00.000Z',
    brief: '做一套新品上市海报',
    references: [],
    status: 'done',
    started: 0,
    failed: 0,
    batchIds: [],
    notes: [],
    ...overrides,
  };
}

describe('what a project tells the server', () => {
  it('sends its batches and failed generations, not the ones still running here', () => {
    const local = session({
      batchIds: ['batch-1', 'pending-failed', 'pending-running', 'batch-2'],
      transientTasks: [task('pending-failed', '上游超时'), task('pending-running')],
    });

    expect(projectPayload(local)).toEqual({
      title: '山川茶事新品海报',
      createdAt: '2026-11-17T08:00:00.000Z',
      updatedAt: '2026-11-17T08:05:00.000Z',
      batchIds: ['batch-1', 'pending-failed', 'batch-2'],
      tasks: [task('pending-failed', '上游超时')],
    });
  });
});

describe('a project read from the server', () => {
  it('becomes a session', () => {
    expect(
      sessionFromRemote({
        id: 'project-1',
        title: '山川茶事新品海报',
        createdAt: '2026-11-17T08:00:00.000Z',
        updatedAt: '2026-11-17T08:05:00.000Z',
        batchIds: ['batch-1', 'pending-failed'],
        tasks: [task('pending-failed', '上游超时'), { id: 'broken' }],
        turnCount: 2,
      }),
    ).toEqual(
      session({
        batchIds: ['batch-1', 'pending-failed'],
        transientTasks: [task('pending-failed', '上游超时')],
      }),
    );
  });

  it('keeps the generations this page still has running', () => {
    const remote = session({ title: '服务器上的名字', batchIds: ['batch-1'] });
    const local = session({
      batchIds: ['batch-1', 'pending-running', 'pending-failed'],
      transientTasks: [task('pending-running'), task('pending-failed', '上游超时')],
    });

    expect(mergeRemoteSession(remote, local)).toEqual(
      session({
        title: '服务器上的名字',
        batchIds: ['batch-1', 'pending-running'],
        transientTasks: [task('pending-running')],
      }),
    );
    expect(mergeRemoteSession(remote, undefined)).toBe(remote);
    expect(mergeRemoteSession(remote, session({ batchIds: ['batch-0'] }))).toBe(remote);
  });
});

describe('a conversation read from the server', () => {
  it("replaces this page's copy, oldest request first", () => {
    const remote = [
      turn('turn-2', { createdAt: '2026-11-17T08:03:00.000Z', planTitle: '服务器上的第二条' }),
      turn('turn-1', { planTitle: '服务器上的第一条' }),
    ];
    const local = [turn('turn-1', { planTitle: '本地旧的第一条' })];

    expect(mergeRemoteTurns(remote, local, () => false).map((item) => item.planTitle)).toEqual([
      '服务器上的第一条',
      '服务器上的第二条',
    ]);
  });

  it('keeps the requests this page changed or is running, and those only it has', () => {
    const remote = [turn('turn-1', { status: 'interrupted' }), turn('turn-2', { status: 'done' })];
    const local = [
      turn('turn-1', { status: 'running' }),
      turn('turn-2', { status: 'cancelled' }),
      turn('turn-3', { createdAt: '2026-11-17T08:09:00.000Z', status: 'awaiting' }),
    ];

    const merged = mergeRemoteTurns(remote, local, (item) => item.status === 'running');

    expect(merged.map((item) => [item.id, item.status])).toEqual([
      ['turn-1', 'running'],
      ['turn-2', 'done'],
      ['turn-3', 'awaiting'],
    ]);
    expect(merged[0]).toBe(local[0]);
  });
});

describe('whose session this is', () => {
  it('belongs to the account that sent a request in it or made one of its pictures', () => {
    const mine = new Set(['batch-1']);

    expect(ownsSession(session({ batchIds: ['batch-1'] }), [], 'user-1', mine)).toBe(true);
    expect(ownsSession(session(), [turn('turn-1', { userId: 'user-1' })], 'user-1', mine)).toBe(
      true,
    );
    expect(ownsSession(session({ batchIds: ['batch-9'] }), [turn('turn-1')], 'user-1', mine)).toBe(
      false,
    );
    expect(ownsSession(session(), [turn('turn-1', { userId: 'user-2' })], 'user-1', mine)).toBe(
      false,
    );
  });
});
