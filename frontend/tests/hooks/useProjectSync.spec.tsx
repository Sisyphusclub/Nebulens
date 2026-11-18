import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addAgentTurn,
  getAgentConversations,
  resetAgentConversationsForTests,
  updateAgentTurn,
  type AgentTurn,
} from '@/hooks/useAgentConversation';
import { getCanvasLayout, replaceCanvasLayout, useCanvasLayout } from '@/hooks/useCanvasLayout';
import {
  attachGenerationBatch,
  createGenerationSession,
  getGenerationSessions,
  removeGenerationSession,
  renameGenerationSession,
  replaceGenerationSessions,
  resetGenerationSessionsForTests,
  upsertGenerationTask,
} from '@/hooks/useGenerationSessions';
import {
  PROJECT_SAVE_DELAY_MS,
  PROJECT_SYNC_STORAGE_KEY,
  resetProjectSyncForTests,
  useProjectReady,
  useProjectSync,
} from '@/hooks/useProjectSync';
import { ImageApiError } from '@/services/api/httpClient';
import type { RemoteProject, RemoteProjectDetail } from '@/services/api/projectsApi';

const api = vi.hoisted(() => ({
  fetchProjects: vi.fn(),
  fetchProject: vi.fn(),
  saveProject: vi.fn(),
  saveProjectTurn: vi.fn(),
  saveProjectNodes: vi.fn(),
  deleteProject: vi.fn(),
}));
vi.mock('@/services/api/projectsApi', () => api);

interface AuthValue {
  user: { id: string } | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
const auth = vi.hoisted((): { value: AuthValue } => ({
  value: { user: { id: 'user-1' }, isAuthenticated: true, isLoading: false },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth.value }));

const history = vi.hoisted(() => ({
  value: { batches: [] as Array<{ batchId: string }>, isHydrated: true },
}));
vi.mock('@/hooks/useImageHistory', () => ({ useImageHistory: () => history.value }));

const SETTINGS = {
  prompt: '山川茶事新品海报',
  model: 'gpt-image-2',
  count: 1,
  aspectRatio: '3:4' as const,
  resolution: 'standard' as const,
  isPublic: false,
  referenceIds: [],
};

function remoteProject(id: string, overrides: Partial<RemoteProject> = {}): RemoteProject {
  return {
    id,
    title: `项目 ${id}`,
    createdAt: '2026-11-17T08:00:00.000Z',
    updatedAt: '2026-11-17T08:05:00.000Z',
    batchIds: [],
    tasks: [],
    turnCount: 0,
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
    userId: 'user-1',
    ...overrides,
  };
}

function signIn(userId: string | null): void {
  auth.value = {
    user: userId === null ? null : { id: userId },
    isAuthenticated: userId !== null,
    isLoading: false,
  };
}

function ownBatches(...batchIds: string[]): void {
  history.value = { batches: batchIds.map((batchId) => ({ batchId })), isHydrated: true };
}

/** Lets pending requests answer and the timers due within `ms` fire. */
async function settle(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const networkError = (): ImageApiError => new ImageApiError(0, 'NETWORK_ERROR', '无法连接到服务器');

beforeEach(() => {
  vi.useFakeTimers();
  signIn('user-1');
  ownBatches();
  api.fetchProjects.mockResolvedValue([]);
  api.fetchProject.mockResolvedValue(null);
  api.saveProject.mockResolvedValue(undefined);
  api.saveProjectTurn.mockResolvedValue(undefined);
  api.saveProjectNodes.mockResolvedValue(undefined);
  api.deleteProject.mockResolvedValue(undefined);
});

afterEach(() => {
  // Unmounted first, so resetting the stores does not update a hook that is going away.
  cleanup();
  resetProjectSyncForTests();
  resetGenerationSessionsForTests();
  resetAgentConversationsForTests();
  Object.values(api).forEach((mock) => mock.mockReset());
  vi.useRealTimers();
});

describe('projects kept in step with the server', () => {
  it("reads the account's projects into this browser", async () => {
    api.fetchProjects.mockResolvedValue([
      remoteProject('remote-1', { batchIds: ['batch-1'], turnCount: 2 }),
      remoteProject('remote-2', { updatedAt: '2026-11-17T09:00:00.000Z' }),
    ]);

    const { result } = renderHook(() => useProjectSync());
    expect(result.current.listed).toBe(false);
    await settle();

    expect(result.current.listed).toBe(true);
    expect([...result.current.projectIds].sort()).toEqual(['remote-1', 'remote-2']);
    expect([...result.current.agentProjectIds]).toEqual(['remote-1']);
    expect(getGenerationSessions().map((session) => [session.id, session.batchIds])).toEqual([
      ['remote-2', []],
      ['remote-1', ['batch-1']],
    ]);
    expect(api.saveProject).not.toHaveBeenCalled();
  });

  it('sends the sessions this browser holds for the account, and leaves the others alone', async () => {
    signIn(null);
    const pictures = createGenerationSession('有图的会话');
    attachGenerationBatch(pictures.id, 'batch-1');
    const conversation = createGenerationSession('只有对话的会话');
    addAgentTurn(conversation.id, turn('turn-1'));
    replaceCanvasLayout(conversation.id, { 'record-1': { x: 10, y: 20 } });
    const stranger = createGenerationSession('别人的会话');
    attachGenerationBatch(stranger.id, 'batch-9');
    addAgentTurn(stranger.id, turn('turn-9', { userId: 'user-2' }));
    signIn('user-1');
    ownBatches('batch-1');

    const { result } = renderHook(() => useProjectSync());
    await settle(PROJECT_SAVE_DELAY_MS);

    expect(api.saveProject.mock.calls.map(([id]) => id as string).sort()).toEqual(
      [pictures.id, conversation.id].sort(),
    );
    expect(api.saveProject).toHaveBeenCalledWith(
      pictures.id,
      expect.objectContaining({ title: '有图的会话', batchIds: ['batch-1'], tasks: [] }),
    );
    expect(api.saveProjectTurn.mock.calls).toEqual([[conversation.id, turn('turn-1')]]);
    expect(api.saveProjectNodes.mock.calls).toEqual([
      [conversation.id, { 'record-1': { x: 10, y: 20 } }],
    ]);
    expect([...result.current.projectIds].sort()).toEqual([pictures.id, conversation.id].sort());
    expect([...result.current.agentProjectIds]).toEqual([conversation.id]);
  });

  it("waits for the account's pictures before deciding whose a session is", async () => {
    signIn(null);
    const session = createGenerationSession('有图的会话');
    attachGenerationBatch(session.id, 'batch-1');
    signIn('user-1');
    history.value = { batches: [], isHydrated: false };

    const { rerender } = renderHook(() => useProjectSync());
    await settle(PROJECT_SAVE_DELAY_MS);
    expect(api.saveProject).not.toHaveBeenCalled();

    ownBatches('batch-1');
    rerender();
    await settle(PROJECT_SAVE_DELAY_MS);
    expect(api.saveProject).toHaveBeenCalledTimes(1);
  });

  it('saves what changes here, gathering quick changes into one request', async () => {
    api.fetchProjects.mockResolvedValue([remoteProject('remote-1', { turnCount: 1 })]);
    renderHook(() => useProjectSync());
    const board = renderHook(() =>
      useCanvasLayout({ sessionId: 'remote-1', feed: [], run: null, enabled: true }),
    );
    await settle();

    act(() => {
      renameGenerationSession('remote-1', '第一次改名');
      renameGenerationSession('remote-1', '第二次改名');
      addAgentTurn('remote-1', turn('turn-1', { status: 'running' }));
      updateAgentTurn('remote-1', 'turn-1', { status: 'done' });
      board.result.current.move({ 'record-1': { x: 5, y: 6 } });
    });
    await settle(PROJECT_SAVE_DELAY_MS - 1);
    expect(api.saveProject).not.toHaveBeenCalled();
    await settle(1);

    expect(api.saveProject.mock.calls).toEqual([
      ['remote-1', expect.objectContaining({ title: '第二次改名' })],
    ]);
    expect(api.saveProjectTurn.mock.calls).toEqual([
      ['remote-1', turn('turn-1', { status: 'done' })],
    ]);
    expect(api.saveProjectNodes.mock.calls).toEqual([['remote-1', { 'record-1': { x: 5, y: 6 } }]]);

    await settle(60_000);
    expect(api.saveProject).toHaveBeenCalledTimes(1);
  });

  it('leaves a generation still running here out of what it sends', async () => {
    api.fetchProjects.mockResolvedValue([remoteProject('remote-1', { batchIds: ['batch-1'] })]);
    renderHook(() => useProjectSync());
    await settle();

    act(() => {
      attachGenerationBatch('remote-1', 'pending-1');
      upsertGenerationTask('remote-1', {
        id: 'pending-1',
        createdAt: '2026-11-17T08:06:00.000Z',
        settings: SETTINGS,
      });
    });
    await settle(PROJECT_SAVE_DELAY_MS);

    expect(api.saveProject).toHaveBeenLastCalledWith(
      'remote-1',
      expect.objectContaining({ batchIds: ['batch-1'], tasks: [] }),
    );
  });

  it('sends a change again when it changed once more while being saved', async () => {
    api.fetchProjects.mockResolvedValue([remoteProject('remote-1')]);
    renderHook(() => useProjectSync());
    await settle();
    let finishFirst: () => void = () => undefined;
    api.saveProject.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        }),
    );

    act(() => renameGenerationSession('remote-1', '第一次改名'));
    await settle(PROJECT_SAVE_DELAY_MS);
    act(() => renameGenerationSession('remote-1', '保存途中又改名'));
    finishFirst();
    await settle(PROJECT_SAVE_DELAY_MS);

    expect(api.saveProject.mock.calls.map(([, body]) => (body as { title: string }).title)).toEqual(
      ['第一次改名', '保存途中又改名'],
    );
  });

  it('deletes a session removed here from the server, with its conversation and board', async () => {
    api.fetchProjects.mockResolvedValue([remoteProject('remote-1', { turnCount: 1 })]);
    const { result } = renderHook(() => useProjectSync());
    await settle();
    act(() => {
      addAgentTurn('remote-1', turn('turn-1'));
      replaceCanvasLayout('remote-1', { 'record-1': { x: 1, y: 2 } });
    });
    await settle(PROJECT_SAVE_DELAY_MS);

    act(() => removeGenerationSession('remote-1'));
    await settle();

    expect(api.deleteProject.mock.calls).toEqual([['remote-1']]);
    expect(getAgentConversations()['remote-1']).toBeUndefined();
    expect(getCanvasLayout('remote-1')).toEqual({});
    expect(result.current.projectIds.has('remote-1')).toBe(false);
  });

  it('keeps a delete the server has not heard of for the next visit', async () => {
    api.fetchProjects.mockResolvedValue([remoteProject('remote-1')]);
    const first = renderHook(() => useProjectSync());
    await settle();
    api.deleteProject.mockRejectedValue(networkError());
    act(() => removeGenerationSession('remote-1'));
    await settle();
    expect(first.result.current.failing).toBe(true);
    first.unmount();
    resetProjectSyncForTests();

    api.deleteProject.mockResolvedValue(undefined);
    api.fetchProjects.mockResolvedValue([]);
    renderHook(() => useProjectSync());
    await settle();

    expect(api.deleteProject).toHaveBeenCalledTimes(2);
    expect(getGenerationSessions()).toEqual([]);
  });

  it('drops a project that was deleted from another device', async () => {
    api.fetchProjects.mockResolvedValue([remoteProject('remote-1'), remoteProject('remote-2')]);
    const first = renderHook(() => useProjectSync());
    await settle();
    act(() => addAgentTurn('remote-2', turn('turn-1')));
    await settle(PROJECT_SAVE_DELAY_MS);
    first.unmount();
    resetProjectSyncForTests();

    api.fetchProjects.mockResolvedValue([remoteProject('remote-1')]);
    renderHook(() => useProjectSync());
    await settle();

    expect(getGenerationSessions().map((session) => session.id)).toEqual(['remote-1']);
    expect(getAgentConversations()['remote-2']).toBeUndefined();
    expect(api.deleteProject).not.toHaveBeenCalled();
  });

  it('keeps what is unsaved here when the list arrives, and sends it first', async () => {
    api.fetchProjects.mockResolvedValue([remoteProject('remote-1', { title: '服务器上的名字' })]);
    const first = renderHook(() => useProjectSync());
    await settle();
    api.saveProject.mockRejectedValue(networkError());
    act(() => renameGenerationSession('remote-1', '离线时改的名字'));
    await settle(PROJECT_SAVE_DELAY_MS);
    first.unmount();
    resetProjectSyncForTests();

    const order: string[] = [];
    api.saveProject.mockImplementation(() => {
      order.push('save');
      return Promise.resolve();
    });
    api.fetchProjects.mockImplementation(() => {
      order.push('list');
      return Promise.resolve([remoteProject('remote-1', { title: '服务器上的名字' })]);
    });
    renderHook(() => useProjectSync());
    await settle();

    expect(order).toEqual(['save', 'list']);
    expect(api.saveProject).toHaveBeenLastCalledWith(
      'remote-1',
      expect.objectContaining({ title: '离线时改的名字' }),
    );
  });

  it('works with what this browser has while the server is out of reach, and tries again', async () => {
    api.fetchProjects.mockRejectedValueOnce(networkError());
    const { result } = renderHook(() => useProjectSync());
    await settle();

    expect(result.current.listed).toBe(true);
    expect(result.current.failing).toBe(true);

    api.fetchProjects.mockResolvedValue([remoteProject('remote-1')]);
    await settle(5_000);

    expect(result.current.failing).toBe(false);
    expect(getGenerationSessions().map((session) => session.id)).toEqual(['remote-1']);
  });

  it('never sends again a session whose id belongs to another account', async () => {
    signIn(null);
    const session = createGenerationSession('会话');
    addAgentTurn(session.id, turn('turn-1'));
    signIn('user-1');
    api.saveProject.mockRejectedValue(new ImageApiError(403, 'FORBIDDEN', 'another account'));

    const { result } = renderHook(() => useProjectSync());
    await settle(PROJECT_SAVE_DELAY_MS);
    act(() => renameGenerationSession(session.id, '改名'));
    await settle(60_000);

    expect(api.saveProject).toHaveBeenCalledTimes(1);
    expect(api.saveProjectTurn).not.toHaveBeenCalled();
    expect(result.current.failing).toBe(false);
    expect([...result.current.localOnlyIds]).toEqual([session.id]);
  });

  it('keeps what the server refuses in this browser, and says which project lacks it', async () => {
    api.fetchProjects.mockResolvedValue([remoteProject('remote-1', { turnCount: 1 })]);
    const { result } = renderHook(() => useProjectSync());
    await settle();
    api.saveProjectTurn.mockRejectedValue(new ImageApiError(413, 'PAYLOAD_TOO_LARGE', 'too large'));

    act(() => {
      addAgentTurn('remote-1', turn('turn-1'));
      renameGenerationSession('remote-1', '改名照常保存');
    });
    await settle(60_000);

    expect(api.saveProjectTurn).toHaveBeenCalledTimes(1);
    expect(api.saveProject).toHaveBeenCalledTimes(1);
    expect(result.current.failing).toBe(false);
    expect([...result.current.localOnlyIds]).toEqual(['remote-1']);

    // Changed, it is sent again; once the server takes it, nothing is missing there.
    api.saveProjectTurn.mockResolvedValue(undefined);
    act(() => updateAgentTurn('remote-1', 'turn-1', { notes: [] }));
    await settle(PROJECT_SAVE_DELAY_MS);

    expect(api.saveProjectTurn).toHaveBeenCalledTimes(2);
    expect(result.current.localOnlyIds.size).toBe(0);
  });

  it('takes up what another tab of the account left unsaved', async () => {
    api.fetchProjects.mockResolvedValue([remoteProject('remote-1')]);
    const { result } = renderHook(() => useProjectSync());
    await settle();

    // The other tab renamed the project, noted that, and was closed before it could save.
    replaceGenerationSessions((sessions) =>
      sessions.map((session) => ({ ...session, title: '另一个标签页改的名字' })),
    );
    window.localStorage.setItem(
      PROJECT_SYNC_STORAGE_KEY,
      JSON.stringify({
        'user-1': {
          synced: ['remote-1', 'remote-2'],
          unsaved: { 'remote-1': { meta: true, turns: [], nodes: false } },
          deleted: [],
          foreign: [],
          refused: {},
        },
      }),
    );
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: PROJECT_SYNC_STORAGE_KEY }));
    });
    await settle(PROJECT_SAVE_DELAY_MS);

    expect(api.saveProject.mock.calls).toEqual([
      ['remote-1', expect.objectContaining({ title: '另一个标签页改的名字' })],
    ]);
    expect([...result.current.projectIds].sort()).toEqual(['remote-1', 'remote-2']);
  });

  it('sends nothing while signed out, and nothing of one account to the next', async () => {
    api.fetchProjects.mockResolvedValue([remoteProject('remote-1')]);
    const { result, rerender } = renderHook(() => useProjectSync());
    await settle();

    signIn(null);
    rerender();
    act(() => renameGenerationSession('remote-1', '退出后改名'));
    await settle(60_000);
    expect(api.saveProject).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ ownerUserId: null, listed: false });

    api.fetchProjects.mockResolvedValue([]);
    signIn('user-2');
    ownBatches();
    rerender();
    await settle(60_000);
    expect(api.saveProject).not.toHaveBeenCalled();
    expect(result.current.projectIds.size).toBe(0);
  });
});

describe('opening a project', () => {
  function detail(overrides: Partial<RemoteProjectDetail> = {}): RemoteProjectDetail {
    return {
      project: remoteProject('remote-1', { turnCount: 2 }),
      turns: [
        turn('turn-1', { planTitle: '服务器上的第一条' }),
        turn('turn-2', { createdAt: '2026-11-17T08:03:00.000Z', status: 'running' }),
      ],
      positions: { 'record-1': { x: 100, y: 200 } },
      ...overrides,
    };
  }

  it('is ready once its conversation and board are read from the server', async () => {
    api.fetchProjects.mockResolvedValue([remoteProject('remote-1', { turnCount: 2 })]);
    api.fetchProject.mockResolvedValue(detail());
    replaceCanvasLayout('remote-1', { 'record-1': { x: 0, y: 0 }, 'record-2': { x: 344, y: 0 } });

    const { result } = renderHook(() => useProjectReady('remote-1'));
    expect(result.current).toBe(false);
    await settle();

    expect(result.current).toBe(true);
    expect(api.fetchProject.mock.calls).toEqual([['remote-1']]);
    expect(
      getAgentConversations()['remote-1']?.map((item) => [item.id, item.status, item.planTitle]),
    ).toEqual([
      ['turn-1', 'done', '服务器上的第一条'],
      // Whichever page was running it is gone, so it reads as cut off.
      ['turn-2', 'interrupted', undefined],
    ]);
    expect(getCanvasLayout('remote-1')).toEqual({
      'record-1': { x: 100, y: 200 },
      'record-2': { x: 344, y: 0 },
    });
    expect(api.saveProjectTurn).not.toHaveBeenCalled();
    expect(api.saveProjectNodes).not.toHaveBeenCalled();
  });

  it('keeps the request this page is working on and the board it has yet to save', async () => {
    api.fetchProjects.mockResolvedValue([remoteProject('remote-1', { turnCount: 2 })]);
    let answer: (value: RemoteProjectDetail) => void = () => undefined;
    api.fetchProject.mockReturnValue(
      new Promise<RemoteProjectDetail>((resolve) => {
        answer = resolve;
      }),
    );
    const ready = renderHook(() => useProjectReady('remote-1'));
    const board = renderHook(() =>
      useCanvasLayout({ sessionId: 'remote-1', feed: [], run: null, enabled: true }),
    );
    await settle();

    act(() => {
      addAgentTurn(
        'remote-1',
        turn('turn-3', { createdAt: '2026-11-17T08:09:00.000Z', status: 'planning' }),
      );
      board.result.current.move({ 'record-1': { x: 7, y: 8 } });
    });
    answer(detail());
    await settle();

    expect(ready.result.current).toBe(true);
    expect(getAgentConversations()['remote-1']?.map((item) => [item.id, item.status])).toEqual([
      ['turn-1', 'done'],
      ['turn-2', 'interrupted'],
      ['turn-3', 'planning'],
    ]);
    expect(board.result.current.positions).toEqual({ 'record-1': { x: 7, y: 8 } });
  });

  it('is ready at once for a project only this browser has, and for a visitor', async () => {
    const local = renderHook(() => useProjectReady('local-only'));
    await settle();
    expect(local.result.current).toBe(true);
    expect(api.fetchProject).not.toHaveBeenCalled();
    local.unmount();

    signIn(null);
    expect(renderHook(() => useProjectReady('anything')).result.current).toBe(true);
    expect(renderHook(() => useProjectReady(null)).result.current).toBe(true);
  });

  it('asks again for a project it could not read, then works with what is here', async () => {
    api.fetchProjects.mockResolvedValue([remoteProject('remote-1')]);
    api.fetchProject.mockRejectedValue(networkError());
    const { result } = renderHook(() => useProjectReady('remote-1'));
    await settle();
    expect(result.current).toBe(false);

    await settle(2_000);
    expect(api.fetchProject).toHaveBeenCalledTimes(2);
    expect(result.current).toBe(false);

    api.fetchProject.mockResolvedValue(detail({ turns: [], positions: {} }));
    await settle(5_000);
    expect(result.current).toBe(true);
  });
});
