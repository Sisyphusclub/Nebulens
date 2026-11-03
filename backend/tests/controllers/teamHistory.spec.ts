import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import { db } from '../../src/db/drizzle.js';
import { user, userQuota } from '../../src/db/schema.js';
import { AppError } from '../../src/errors/AppError.js';
import type { ImageGenerationProvider } from '../../src/services/providers/ImageGenerationProvider.js';
import { saveOutput } from '../../src/storage/localStorage.js';
import type { GenerateInput, GenerateOutput } from '../../src/types/image.js';
import { productDateKey } from '../../src/utils/date.js';

const PNG_PREFIX = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fakeProvider(): ImageGenerationProvider {
  return {
    generate: vi.fn(async (input: GenerateInput): Promise<GenerateOutput> => {
      const images = [] as GenerateOutput['images'];
      for (let index = 0; index < (input.count ?? 1); index += 1) {
        const saved = await saveOutput(Buffer.concat([PNG_PREFIX, Buffer.alloc(32, index)]), 'png');
        images.push({ outputPath: saved.absolutePath, width: 1024, height: 1024 });
      }
      return { images, aspectRatio: input.aspectRatio ?? '1:1' };
    }),
  };
}

function stubAuth(userId: string, username = userId): RequestHandler {
  const now = new Date();
  db.insert(user)
    .values({
      id: userId,
      name: `Test ${userId}`,
      email: `${userId}@test.local`,
      username,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .run();
  db.insert(userQuota)
    .values({
      userId,
      usedToday: 0,
      quotaDate: productDateKey(),
      dailyTotal: 20,
      permanentTotal: 20,
      permanentUsed: 0,
    })
    .onConflictDoNothing({ target: userQuota.userId })
    .run();
  return (req, _res, next) => {
    req.user = { id: userId, email: `${userId}@test.local` };
    next();
  };
}

const denyAuth: RequestHandler = (_req, _res, next) => {
  next(new AppError('UNAUTHORIZED', 'Authentication required', 401));
};

/** Matches the optional auth on image files: no session, no user. */
const signedOut: RequestHandler = (_req, _res, next) => {
  next();
};

async function generate(
  app: ReturnType<typeof createApp>,
  body: Record<string, unknown>,
): Promise<string> {
  const res = await request(app)
    .post('/api/images/generate')
    .send({ count: 1, ...body });
  expect(res.status).toBe(200);
  return res.body.images[0].id as string;
}

describe('team sharing on generated records', () => {
  it('shares new images with the team by default and keeps a requested category', async () => {
    const app = createApp({
      provider: fakeProvider(),
      authMiddleware: stubAuth(`team-default-${randomUUID()}`),
    });

    const sharedId = await generate(app, { prompt: '默认共享', category: 'poster' });
    const privateId = await generate(app, { prompt: '仅自己', isShared: false });

    const history = await request(app).get('/api/history');
    const byId = new Map(history.body.records.map((r: { id: string }) => [r.id, r]));
    expect(byId.get(sharedId)).toMatchObject({ isShared: true, category: 'poster' });
    expect(byId.get(privateId)).toMatchObject({ isShared: false });
    expect(byId.get(privateId)).not.toHaveProperty('category');
  });

  it('rejects an unknown category on generation', async () => {
    const app = createApp({
      provider: fakeProvider(),
      authMiddleware: stubAuth(`team-bad-${randomUUID()}`),
    });
    const res = await request(app)
      .post('/api/images/generate')
      .send({ prompt: 'x', count: 1, category: 'not-a-category' });
    expect(res.status).toBe(400);
  });

  it('updates sharing and category on an owned record', async () => {
    const app = createApp({
      provider: fakeProvider(),
      authMiddleware: stubAuth(`team-patch-${randomUUID()}`),
    });
    const id = await generate(app, { prompt: '改分类' });

    const updated = await request(app)
      .patch(`/api/history/${id}`)
      .send({ isShared: false, category: 'logo' });
    expect(updated.status).toBe(200);
    expect(updated.body.record).toMatchObject({ isShared: false, category: 'logo' });

    const invalid = await request(app).patch(`/api/history/${id}`).send({ category: 'nope' });
    expect(invalid.status).toBe(400);
  });
});

describe('GET /api/history/team', () => {
  it('lists shared images from every user with the owner name, filtered by category', async () => {
    const suffix = randomUUID();
    const appA = createApp({
      provider: fakeProvider(),
      authMiddleware: stubAuth(`team-a-${suffix}`, `alice_${suffix.slice(0, 8)}`),
    });
    const appB = createApp({
      provider: fakeProvider(),
      authMiddleware: stubAuth(`team-b-${suffix}`),
    });
    const posterId = await generate(appA, { prompt: `海报 ${suffix}`, category: 'poster' });
    const logoId = await generate(appA, { prompt: `Logo ${suffix}`, category: 'logo' });
    const hiddenId = await generate(appA, {
      prompt: `私有 ${suffix}`,
      category: 'poster',
      isShared: false,
    });

    const all = await request(appB).get('/api/history/team').query({ limit: 50 });
    expect(all.status).toBe(200);
    const ids = all.body.records.map((r: { id: string }) => r.id);
    expect(ids).toEqual(expect.arrayContaining([posterId, logoId]));
    expect(ids).not.toContain(hiddenId);
    expect(all.body.records.find((r: { id: string }) => r.id === posterId)).toMatchObject({
      isShared: true,
      ownerName: `alice_${suffix.slice(0, 8)}`,
    });
    expect(all.body.records.find((r: { id: string }) => r.id === posterId)).not.toHaveProperty(
      'referenceIds',
    );

    const posters = await request(appB)
      .get('/api/history/team')
      .query({ category: 'poster', limit: 50 });
    expect(posters.body.records.every((r: { category: string }) => r.category === 'poster')).toBe(
      true,
    );
    expect(posters.body.records.map((r: { id: string }) => r.id)).toContain(posterId);
  });

  it('pages through shared images without repeating any', async () => {
    const app = createApp({
      provider: fakeProvider(),
      authMiddleware: stubAuth(`team-page-${randomUUID()}`),
    });
    for (let index = 0; index < 3; index += 1)
      await generate(app, { prompt: `翻页 ${index}`, category: 'social' });

    const first = await request(app)
      .get('/api/history/team')
      .query({ category: 'social', limit: 2 });
    expect(first.body.records).toHaveLength(2);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await request(app)
      .get('/api/history/team')
      .query({ category: 'social', limit: 2, cursor: first.body.nextCursor });
    const firstIds = first.body.records.map((r: { id: string }) => r.id);
    expect(second.body.records.some((r: { id: string }) => firstIds.includes(r.id))).toBe(false);
  });

  it('requires a signed-in user and validates the query', async () => {
    const anonymous = createApp({ provider: fakeProvider(), authMiddleware: denyAuth });
    expect((await request(anonymous).get('/api/history/team')).status).toBe(401);

    const app = createApp({
      provider: fakeProvider(),
      authMiddleware: stubAuth(`team-q-${randomUUID()}`),
    });
    expect((await request(app).get('/api/history/team').query({ category: 'nope' })).status).toBe(
      400,
    );
  });
});

describe('team access to shared image files', () => {
  it('serves shared images to other signed-in users only', async () => {
    const owner = createApp({
      provider: fakeProvider(),
      authMiddleware: stubAuth(`team-file-a-${randomUUID()}`),
    });
    const teammate = createApp({
      provider: fakeProvider(),
      authMiddleware: stubAuth(`team-file-b-${randomUUID()}`),
    });
    const anonymous = createApp({ provider: fakeProvider(), authMiddleware: signedOut });
    const sharedId = await generate(owner, { prompt: '共享文件' });
    const privateId = await generate(owner, { prompt: '私有文件', isShared: false });

    expect((await request(teammate).get(`/api/outputs/${sharedId}`)).status).toBe(200);
    expect((await request(teammate).get(`/api/outputs/${privateId}`)).status).toBe(404);
    expect((await request(anonymous).get(`/api/outputs/${sharedId}`)).status).toBe(404);
  });
});

describe('analysis after generation', () => {
  it('queues every new image for analysis when analysis is configured', async () => {
    const queue = { enqueue: vi.fn(), idle: vi.fn(async () => undefined) };
    const app = createApp({
      provider: fakeProvider(),
      authMiddleware: stubAuth(`analysis-on-${randomUUID()}`),
      imageAnalysis: queue,
    });

    const res = await request(app)
      .post('/api/images/generate')
      .send({ prompt: '海报写“新品上市”', count: 2 });

    const ids = res.body.images.map((image: { id: string }) => image.id);
    expect(queue.enqueue).toHaveBeenCalledWith(ids);
    // The client shows the check as running from this response, before any history fetch.
    expect(res.body.analysisStatus).toBe('pending');
    const history = await request(app).get('/api/history');
    expect(
      history.body.records
        .filter((record: { id: string }) => ids.includes(record.id))
        .map((record: { analysisStatus?: string }) => record.analysisStatus),
    ).toEqual(['pending', 'pending']);
  });

  it('leaves records unanalyzed when analysis is not configured', async () => {
    const app = createApp({
      provider: fakeProvider(),
      authMiddleware: stubAuth(`analysis-off-${randomUUID()}`),
    });
    const generated = await request(app).post('/api/images/generate').send({ prompt: '无分析' });
    expect(generated.body).not.toHaveProperty('analysisStatus');
    const id = await generate(app, { prompt: '无分析' });
    const history = await request(app).get('/api/history');
    expect(
      history.body.records.find((record: { id: string }) => record.id === id),
    ).not.toHaveProperty('analysisStatus');
  });
});

describe('GET /api/history/team/recommendations', () => {
  it('recommends shared teammate work for a need, with the author and a reason', async () => {
    const suffix = randomUUID().slice(0, 8);
    const owner = createApp({
      provider: fakeProvider(),
      authMiddleware: stubAuth(`rec-owner-${suffix}`, `bob_${suffix}`),
    });
    const asker = createApp({
      provider: fakeProvider(),
      authMiddleware: stubAuth(`rec-ask-${suffix}`),
    });
    const sharedId = await generate(owner, {
      prompt: `奶茶新品海报 ${suffix}`,
      category: 'poster',
    });
    const privateId = await generate(owner, {
      prompt: `奶茶新品海报 ${suffix} 私有`,
      category: 'poster',
      isShared: false,
    });

    const res = await request(asker)
      .get('/api/history/team/recommendations')
      .query({ q: `奶茶新品海报 ${suffix}` });

    expect(res.status).toBe(200);
    const ids = res.body.recommendations.map((item: { record: { id: string } }) => item.record.id);
    expect(ids).toContain(sharedId);
    expect(ids).not.toContain(privateId);
    expect(res.body.recommendations[0]).toMatchObject({
      ownerName: `bob_${suffix}`,
      reason: expect.stringContaining('海报'),
    });
  });

  it('validates the query', async () => {
    const app = createApp({
      provider: fakeProvider(),
      authMiddleware: stubAuth(`rec-q-${randomUUID()}`),
    });
    expect((await request(app).get('/api/history/team/recommendations')).status).toBe(400);
    expect(
      (
        await request(app)
          .get('/api/history/team/recommendations')
          .query({ q: 'x'.repeat(501) })
      ).status,
    ).toBe(400);
  });
});

describe('GET /api/history/recommendations', () => {
  it('searches only the signed-in user’s own images, private ones included', async () => {
    const suffix = randomUUID().slice(0, 8);
    const me = createApp({
      provider: fakeProvider(),
      authMiddleware: stubAuth(`own-rec-me-${suffix}`),
    });
    const other = createApp({
      provider: fakeProvider(),
      authMiddleware: stubAuth(`own-rec-other-${suffix}`),
    });
    const privateId = await generate(me, {
      prompt: `咖啡店开业海报 ${suffix}`,
      category: 'poster',
      isShared: false,
    });
    const othersId = await generate(other, {
      prompt: `咖啡店开业海报 ${suffix}`,
      category: 'poster',
    });

    const res = await request(me)
      .get('/api/history/recommendations')
      .query({ q: `咖啡店开业海报 ${suffix}` });

    expect(res.status).toBe(200);
    const ids = res.body.matches.map((item: { id: string }) => item.id);
    expect(ids).toContain(privateId);
    expect(ids).not.toContain(othersId);
    expect(res.body.matches[0]).toMatchObject({
      id: privateId,
      reason: expect.stringContaining('海报'),
    });
  });

  it('requires a signed-in user and validates the query', async () => {
    const denied = createApp({ provider: fakeProvider(), authMiddleware: denyAuth });
    expect(
      (await request(denied).get('/api/history/recommendations').query({ q: '海报' })).status,
    ).toBe(401);
    const app = createApp({
      provider: fakeProvider(),
      authMiddleware: stubAuth(`own-rec-q-${randomUUID()}`),
    });
    expect((await request(app).get('/api/history/recommendations')).status).toBe(400);
  });
});
