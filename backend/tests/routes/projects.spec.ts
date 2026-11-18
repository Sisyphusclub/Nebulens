import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import type { Express, RequestHandler } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import { db } from '../../src/db/drizzle.js';
import { canvasNodes, projects, projectTurns, user } from '../../src/db/schema.js';
import type { ImageGenerationProvider } from '../../src/services/providers/ImageGenerationProvider.js';

const createdUserIds: string[] = [];

function createUser(): string {
  const id = `projects-${randomUUID()}`;
  const now = new Date();
  db.insert(user)
    .values({
      id,
      name: id,
      email: `${id}@test.local`,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  createdUserIds.push(id);
  return id;
}

function authFor(userId: string): RequestHandler {
  return (req, _res, next) => {
    req.user = { id: userId, email: `${userId}@test.local` };
    next();
  };
}

const provider: ImageGenerationProvider = {
  generate: vi.fn(async () => ({ images: [], aspectRatio: '1:1' as const })),
};

function appFor(userId: string): Express {
  return createApp({ provider, authMiddleware: authFor(userId) });
}

const SETTINGS = {
  prompt: '山川茶事新品海报',
  model: 'gpt-image-2',
  count: 1,
  aspectRatio: '3:4',
  resolution: 'standard',
  isPublic: false,
  referenceIds: [],
};

function projectBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: '山川茶事新品海报',
    createdAt: '2026-11-17T08:00:00.000Z',
    updatedAt: '2026-11-17T08:05:00.000Z',
    batchIds: ['batch-1', 'pending-2'],
    tasks: [
      {
        id: 'pending-2',
        createdAt: '2026-11-17T08:04:00.000Z',
        settings: SETTINGS,
        error: '上游超时',
      },
    ],
    ...overrides,
  };
}

function turn(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    createdAt: '2026-11-17T08:01:00.000Z',
    brief: '做一套新品上市海报',
    references: [],
    status: 'done',
    started: 2,
    failed: 0,
    batchIds: ['batch-1'],
    notes: [],
    planTitle: '新品上市海报',
    ...overrides,
  };
}

afterEach(() => {
  for (const id of createdUserIds.splice(0)) {
    db.delete(user).where(eq(user.id, id)).run();
  }
});

describe('/api/projects', () => {
  it('requires a signed-in user', async () => {
    const app = createApp({
      provider,
      authMiddleware: (_req, res) => {
        res.status(401).json({ error: { code: 'UNAUTHORIZED' } });
      },
    });

    expect((await request(app).get('/api/projects')).status).toBe(401);
  });

  it('saves a project and lists it with what it holds', async () => {
    const app = appFor(createUser());
    const id = randomUUID();

    expect((await request(app).get('/api/projects')).body).toEqual({ projects: [] });

    const saved = await request(app).put(`/api/projects/${id}`).send(projectBody());
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({
      project: { id, ...projectBody(), turnCount: 0 },
    });

    expect((await request(app).get('/api/projects')).body).toEqual({
      projects: [{ id, ...projectBody(), turnCount: 0 }],
    });
    expect((await request(app).get(`/api/projects/${id}`)).body).toEqual({
      project: { id, ...projectBody(), turnCount: 0 },
      turns: [],
      positions: {},
    });
  });

  it('replaces a project saved again and lists the most recently worked on first', async () => {
    const app = appFor(createUser());
    const older = randomUUID();
    const newer = randomUUID();
    await request(app).put(`/api/projects/${older}`).send(projectBody());
    await request(app)
      .put(`/api/projects/${newer}`)
      .send(projectBody({ title: '第二个项目', updatedAt: '2026-11-17T09:00:00.000Z' }));

    const renamed = await request(app)
      .put(`/api/projects/${older}`)
      .send(projectBody({ title: '改过的名字', batchIds: ['batch-1', 'batch-3'], tasks: [] }));
    expect(renamed.status).toBe(200);

    const listed = await request(app).get('/api/projects');
    expect(listed.body.projects.map((project: { id: string }) => project.id)).toEqual([
      newer,
      older,
    ]);
    expect(listed.body.projects[1]).toMatchObject({
      title: '改过的名字',
      batchIds: ['batch-1', 'batch-3'],
      tasks: [],
    });
  });

  it('keeps the conversation: a request saved again replaces itself, oldest first', async () => {
    const app = appFor(createUser());
    const id = randomUUID();
    await request(app).put(`/api/projects/${id}`).send(projectBody());

    const second = turn('turn-2', { createdAt: '2026-11-17T08:03:00.000Z', status: 'running' });
    expect(
      (await request(app).put(`/api/projects/${id}/turns/turn-2`).send({ turn: second })).status,
    ).toBe(200);
    await request(app)
      .put(`/api/projects/${id}/turns/turn-1`)
      .send({ turn: turn('turn-1') });
    const finished = { ...second, status: 'done', notes: ['主海报文字有误，已重画'] };
    await request(app).put(`/api/projects/${id}/turns/turn-2`).send({ turn: finished });

    const detail = await request(app).get(`/api/projects/${id}`);
    expect(detail.body.turns).toEqual([turn('turn-1'), finished]);
    expect(detail.body.project.turnCount).toBe(2);
    expect((await request(app).get('/api/projects')).body.projects[0].turnCount).toBe(2);
  });

  it('keeps where the pictures sit, replacing the whole board each time', async () => {
    const app = appFor(createUser());
    const id = randomUUID();
    await request(app).put(`/api/projects/${id}`).send(projectBody());

    const first = { 'record-1': { x: 0, y: 0 }, 'pending-2#0': { x: 344, y: 0 } };
    expect(
      (await request(app).put(`/api/projects/${id}/nodes`).send({ positions: first })).status,
    ).toBe(200);
    expect((await request(app).get(`/api/projects/${id}`)).body.positions).toEqual(first);

    const moved = { 'record-1': { x: 12.5, y: -40 }, 'record-3': { x: 688, y: 0 } };
    await request(app).put(`/api/projects/${id}/nodes`).send({ positions: moved });
    expect((await request(app).get(`/api/projects/${id}`)).body.positions).toEqual(moved);
  });

  it("never shows or changes another account's project", async () => {
    const owner = appFor(createUser());
    const stranger = appFor(createUser());
    const id = randomUUID();
    await request(owner).put(`/api/projects/${id}`).send(projectBody());
    await request(owner)
      .put(`/api/projects/${id}/turns/turn-1`)
      .send({ turn: turn('turn-1') });

    expect((await request(stranger).get('/api/projects')).body).toEqual({ projects: [] });
    expect((await request(stranger).get(`/api/projects/${id}`)).status).toBe(404);
    const taken = await request(stranger)
      .put(`/api/projects/${id}`)
      .send(projectBody({ title: '抢占' }));
    expect(taken.status).toBe(403);
    expect(taken.body.error.code).toBe('FORBIDDEN');
    expect(
      (
        await request(stranger)
          .put(`/api/projects/${id}/turns/turn-1`)
          .send({ turn: turn('turn-1', { brief: '篡改' }) })
      ).status,
    ).toBe(404);
    expect(
      (await request(stranger).put(`/api/projects/${id}/nodes`).send({ positions: {} })).status,
    ).toBe(404);
    expect((await request(stranger).delete(`/api/projects/${id}`)).status).toBe(404);

    const detail = await request(owner).get(`/api/projects/${id}`);
    expect(detail.body.project.title).toBe('山川茶事新品海报');
    expect(detail.body.turns).toEqual([turn('turn-1')]);
  });

  it('keeps the same request id apart in two projects', async () => {
    const app = appFor(createUser());
    const first = randomUUID();
    const second = randomUUID();
    await request(app).put(`/api/projects/${first}`).send(projectBody());
    await request(app).put(`/api/projects/${second}`).send(projectBody());
    await request(app)
      .put(`/api/projects/${first}/turns/turn-1`)
      .send({ turn: turn('turn-1', { brief: '第一个项目的请求' }) });
    await request(app)
      .put(`/api/projects/${second}/turns/turn-1`)
      .send({ turn: turn('turn-1', { brief: '第二个项目的请求' }) });

    expect((await request(app).get(`/api/projects/${first}`)).body.turns[0].brief).toBe(
      '第一个项目的请求',
    );
    expect((await request(app).get(`/api/projects/${second}`)).body.turns[0].brief).toBe(
      '第二个项目的请求',
    );
  });

  it('deletes a project with its conversation and board', async () => {
    const app = appFor(createUser());
    const id = randomUUID();
    await request(app).put(`/api/projects/${id}`).send(projectBody());
    await request(app)
      .put(`/api/projects/${id}/turns/turn-1`)
      .send({ turn: turn('turn-1') });
    await request(app)
      .put(`/api/projects/${id}/nodes`)
      .send({ positions: { 'record-1': { x: 0, y: 0 } } });

    expect((await request(app).delete(`/api/projects/${id}`)).status).toBe(204);

    expect((await request(app).get(`/api/projects/${id}`)).status).toBe(404);
    expect((await request(app).delete(`/api/projects/${id}`)).status).toBe(404);
    expect(db.select().from(projects).where(eq(projects.id, id)).all()).toEqual([]);
    expect(db.select().from(projectTurns).where(eq(projectTurns.projectId, id)).all()).toEqual([]);
    expect(db.select().from(canvasNodes).where(eq(canvasNodes.projectId, id)).all()).toEqual([]);
  });

  it('rejects what it cannot keep', async () => {
    const app = appFor(createUser());
    const id = randomUUID();
    await request(app).put(`/api/projects/${id}`).send(projectBody());

    const cases: Array<[string, () => Promise<{ status: number }>]> = [
      ['an id with a path in it', () => request(app).put('/api/projects/a.b').send(projectBody())],
      [
        'a project without a title',
        () =>
          request(app)
            .put(`/api/projects/${id}`)
            .send(projectBody({ title: '   ' })),
      ],
      [
        'a date that is not one',
        () =>
          request(app)
            .put(`/api/projects/${id}`)
            .send(projectBody({ updatedAt: 'yesterday' })),
      ],
      [
        'batch ids that are not strings',
        () =>
          request(app)
            .put(`/api/projects/${id}`)
            .send(projectBody({ batchIds: [1, 2] })),
      ],
      [
        'a task without settings',
        () =>
          request(app)
            .put(`/api/projects/${id}`)
            .send(
              projectBody({ tasks: [{ id: 'pending-2', createdAt: '2026-11-17T08:04:00.000Z' }] }),
            ),
      ],
      [
        'a request under another id',
        () =>
          request(app)
            .put(`/api/projects/${id}/turns/turn-1`)
            .send({ turn: turn('turn-9') }),
      ],
      [
        'a request in a state nobody knows',
        () =>
          request(app)
            .put(`/api/projects/${id}/turns/turn-1`)
            .send({ turn: turn('turn-1', { status: 'sleeping' }) }),
      ],
      [
        'a place that is not a number',
        () =>
          request(app)
            .put(`/api/projects/${id}/nodes`)
            .send({ positions: { 'record-1': { x: 'left', y: 0 } } }),
      ],
      [
        'a place under a key with a path in it',
        () =>
          request(app)
            .put(`/api/projects/${id}/nodes`)
            .send({ positions: { '../record': { x: 0, y: 0 } } }),
      ],
    ];
    for (const [name, send] of cases) {
      expect((await send()).status, name).toBe(400);
    }

    const oversized = await request(app)
      .put(`/api/projects/${id}/turns/turn-1`)
      .send({ turn: turn('turn-1', { notes: ['字'.repeat(120_000)] }) });
    expect(oversized.status).toBe(413);
    expect((await request(app).get(`/api/projects/${id}`)).body.turns).toEqual([]);
  });

  it('answers 404 for a request or a board sent to a project that is not there', async () => {
    const app = appFor(createUser());
    const id = randomUUID();

    expect(
      (
        await request(app)
          .put(`/api/projects/${id}/turns/turn-1`)
          .send({ turn: turn('turn-1') })
      ).status,
    ).toBe(404);
    expect(
      (await request(app).put(`/api/projects/${id}/nodes`).send({ positions: {} })).status,
    ).toBe(404);
  });
});
