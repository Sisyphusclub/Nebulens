import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AGENT_CONVERSATIONS_STORAGE_KEY,
  addAgentTurn,
  resetAgentConversationsForTests,
  updateAgentTurn,
  useAgentConversation,
  useAgentSessionIds,
  type AgentTurn,
} from '@/hooks/useAgentConversation';

function turn(id: string, overrides: Partial<AgentTurn> = {}): AgentTurn {
  return {
    id,
    createdAt: '2026-11-16T08:00:00.000Z',
    brief: '雨夜的未来城市',
    references: [],
    status: 'planning',
    started: 0,
    failed: 0,
    batchIds: [],
    notes: [],
    ...overrides,
  };
}

beforeEach(() => {
  resetAgentConversationsForTests();
});

describe('the conversation with the Agent', () => {
  it('keeps each session’s requests apart, in order, and saves them in this browser', () => {
    const one = renderHook(() => useAgentConversation('session-1'));
    const ids = renderHook(() => useAgentSessionIds());

    act(() => {
      addAgentTurn('session-1', turn('first'));
      addAgentTurn('session-2', turn('other'));
      addAgentTurn('session-1', turn('second'));
    });

    expect(one.result.current.map((item) => item.id)).toEqual(['first', 'second']);
    expect([...ids.result.current].sort()).toEqual(['session-1', 'session-2']);
    const saved = JSON.parse(
      localStorage.getItem(AGENT_CONVERSATIONS_STORAGE_KEY) ?? '{}',
    ) as Record<string, AgentTurn[]>;
    expect(saved['session-1']?.map((item) => item.id)).toEqual(['first', 'second']);
    expect(renderHook(() => useAgentConversation(null)).result.current).toEqual([]);
  });

  it('changes a turn from what it is now, so counts never go stale', () => {
    const { result } = renderHook(() => useAgentConversation('session-1'));
    act(() => addAgentTurn('session-1', turn('first', { status: 'running' })));

    act(() => {
      updateAgentTurn('session-1', 'first', (current) => ({ started: current.started + 1 }));
      updateAgentTurn('session-1', 'first', (current) => ({ started: current.started + 1 }));
      updateAgentTurn('session-1', 'first', { batchIds: ['batch-1'] });
      // A turn or session that is not there is left alone.
      updateAgentTurn('session-1', 'missing', { status: 'done' });
      updateAgentTurn('missing', 'first', { status: 'done' });
    });

    expect(result.current[0]).toMatchObject({
      started: 2,
      batchIds: ['batch-1'],
      status: 'running',
    });
  });

  it('reads a request cut off by a reload as interrupted, and keeps a plan still waiting', () => {
    localStorage.setItem(
      AGENT_CONVERSATIONS_STORAGE_KEY,
      JSON.stringify({
        'session-1': [
          turn('planning'),
          turn('running', { status: 'running', started: 1 }),
          turn('waiting', {
            status: 'awaiting',
            plan: {
              skillLabel: '雨夜',
              steps: [
                {
                  label: '主视觉',
                  settings: {
                    prompt: '雨夜',
                    model: 'gpt-image-2',
                    count: 1,
                    aspectRatio: '3:4',
                    resolution: 'standard',
                    isPublic: false,
                    referenceIds: [],
                  },
                },
              ],
            },
          }),
          { id: 'broken' },
        ],
      }),
    );
    window.dispatchEvent(new StorageEvent('storage', { key: AGENT_CONVERSATIONS_STORAGE_KEY }));
    const { result } = renderHook(() => useAgentConversation('session-1'));

    expect(result.current.map((item) => [item.id, item.status])).toEqual([
      ['planning', 'interrupted'],
      ['running', 'interrupted'],
      ['waiting', 'awaiting'],
    ]);
    expect(result.current[2]?.plan?.steps[0]?.settings.prompt).toBe('雨夜');
  });

  it('remembers after a reload that the text model could not pick a skill', () => {
    const tried = { status: 'failed', thinkingMs: 900, chosenSkill: null } as const;
    localStorage.setItem(
      AGENT_CONVERSATIONS_STORAGE_KEY,
      JSON.stringify({
        'session-1': [
          turn('down', { ...tried, selectionFailed: true }),
          { ...turn('odd', tried), selectionFailed: 'yes' },
        ],
      }),
    );
    window.dispatchEvent(new StorageEvent('storage', { key: AGENT_CONVERSATIONS_STORAGE_KEY }));
    const { result } = renderHook(() => useAgentConversation('session-1'));

    expect(result.current.map((item) => item.selectionFailed)).toEqual([true, undefined]);
  });
});
