import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  deleteProject,
  fetchProject,
  fetchProjects,
  saveProject,
  saveProjectNodes,
  saveProjectTurn,
} from '@/services/api/projectsApi';

const PROJECT = {
  id: 'project-1',
  title: '山川茶事新品海报',
  createdAt: '2026-11-17T08:00:00.000Z',
  updatedAt: '2026-11-17T08:05:00.000Z',
  batchIds: ['batch-1'],
  tasks: [],
  turnCount: 1,
};

function answer(status: number, body?: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('projects kept on the server', () => {
  it('lists the projects, leaving out any it cannot read', async () => {
    answer(200, { projects: [PROJECT, { id: 'broken' }, { ...PROJECT, id: 'project-2' }] });

    await expect(fetchProjects()).resolves.toEqual([PROJECT, { ...PROJECT, id: 'project-2' }]);
  });

  it('refuses a list that is not one', async () => {
    answer(200, { projects: 'none' });

    await expect(fetchProjects()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('reads one project with its conversation and board, keeping only real places', async () => {
    const fetchMock = answer(200, {
      project: PROJECT,
      turns: [{ id: 'turn-1' }, 'not a turn'],
      positions: { 'record-1': { x: 12, y: -4 }, broken: { x: 'left', y: 0 }, lost: null },
    });

    await expect(fetchProject('project-1')).resolves.toEqual({
      project: PROJECT,
      turns: [{ id: 'turn-1' }, 'not a turn'],
      positions: { 'record-1': { x: 12, y: -4 } },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/projects/project-1');
  });

  it('answers null for a project the server does not have', async () => {
    answer(404, { error: { code: 'NOT_FOUND', message: 'Project not found', requestId: 'r' } });

    await expect(fetchProject('gone')).resolves.toBeNull();
  });

  it('saves a project, one request and the board as JSON', async () => {
    const fetchMock = answer(200, { ok: true });
    const body = {
      title: '山川茶事新品海报',
      createdAt: PROJECT.createdAt,
      updatedAt: PROJECT.updatedAt,
      batchIds: ['batch-1'],
      tasks: [],
    };

    await saveProject('project-1', body);
    await saveProjectTurn('project-1', { id: 'turn 1', status: 'done' });
    await saveProjectNodes('project-1', { 'record-1': { x: 0, y: 0 } });

    const sent = (fetchMock.mock.calls as Array<[string, RequestInit]>).map(
      ([url, init]): [string, string | undefined, unknown] => [
        url,
        init.method,
        JSON.parse(init.body as string),
      ],
    );
    expect(sent).toEqual([
      ['/api/projects/project-1', 'PUT', body],
      ['/api/projects/project-1/turns/turn%201', 'PUT', { turn: { id: 'turn 1', status: 'done' } }],
      ['/api/projects/project-1/nodes', 'PUT', { positions: { 'record-1': { x: 0, y: 0 } } }],
    ]);
  });

  it('reports why a save was refused', async () => {
    answer(403, {
      error: { code: 'FORBIDDEN', message: 'Project belongs to another account', requestId: 'r' },
    });

    await expect(
      saveProject('project-1', {
        title: 't',
        createdAt: PROJECT.createdAt,
        updatedAt: PROJECT.updatedAt,
        batchIds: [],
        tasks: [],
      }),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('treats a project already gone as deleted', async () => {
    answer(404, { error: { code: 'NOT_FOUND', message: 'Project not found', requestId: 'r' } });
    await expect(deleteProject('gone')).resolves.toBeUndefined();

    answer(204);
    await expect(deleteProject('project-1')).resolves.toBeUndefined();

    answer(500, { error: { code: 'INTERNAL', message: 'Internal server error', requestId: 'r' } });
    await expect(deleteProject('project-1')).rejects.toMatchObject({ status: 500 });
  });
});
