import type { RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import { AppError } from '../../src/errors/AppError.js';
import type { ImageGenerationProvider } from '../../src/services/providers/ImageGenerationProvider.js';
import type { SkillPlanner } from '../../src/services/skillPlanner.service.js';

const provider: ImageGenerationProvider = {
  generate: vi.fn(async () => ({ images: [], aspectRatio: '1:1' as const })),
};

const signedIn: RequestHandler = (req, _res, next) => {
  req.user = { id: 'skill-user', email: 'skill-user@test.local' };
  next();
};

const signedOut: RequestHandler = (_req, _res, next) => {
  next(new AppError('UNAUTHORIZED', 'Authentication required', 401));
};

describe('GET /api/skills', () => {
  it('lists every skill form without signing in', async () => {
    const app = createApp({ provider, authMiddleware: signedOut });

    const response = await request(app).get('/api/skills');

    expect(response.status).toBe(200);
    const skills = response.body.skills as Array<{ id: string; fields: unknown[] }>;
    expect(skills.map((skill) => skill.id)).toEqual([
      'report',
      'architecture',
      'solution',
      'factory',
      'ecommerce',
      'poster',
      'background',
      'social',
      'logo',
      'infographic',
      'product',
      'restyle',
    ]);
    expect(skills[0]?.fields.length).toBeGreaterThan(0);
  });
});

describe('POST /api/skills/:id/plan', () => {
  it('plans the outputs from validated answers', async () => {
    const skillPlanner: SkillPlanner = {
      plan: vi.fn(async () => ({
        title: '活动海报 · 周年庆典',
        outputs: [{ id: 'portrait', label: '竖版海报', aspect: '3:4' as const, prompt: '海报' }],
      })),
      readBrief: vi.fn(async () => ({})),
    };
    const app = createApp({ provider, skillPlanner, authMiddleware: signedIn });

    const response = await request(app)
      .post('/api/skills/poster/plan')
      .send({ values: { title: ' 周年庆典 ' }, hasReference: false });

    expect(response.status).toBe(200);
    expect(response.body.title).toBe('活动海报 · 周年庆典');
    const [skill, values, hasReference] = vi.mocked(skillPlanner.plan).mock.calls[0]!;
    expect(skill.id).toBe('poster');
    expect(values.text('title')).toBe('周年庆典');
    expect(hasReference).toBe(false);
  });

  it('reads the text answers from a brief and keeps the chosen options', async () => {
    const app = createApp({ provider, authMiddleware: signedIn });

    const response = await request(app)
      .post('/api/skills/ecommerce/plan')
      .send({ brief: '山川明前绿茶，高山云雾', values: { style: '高端质感' } });

    expect(response.status).toBe(200);
    expect(response.body.title).toBe('电商主图 · 山川明前绿茶');
    expect(response.body.outputs[0].prompt).toContain('风格：高端质感');
    expect(response.body.outputs[2].prompt).toContain('“高山云雾”');
  });

  it('asks for the subject when the brief leaves it out', async () => {
    const app = createApp({ provider, authMiddleware: signedIn });

    const response = await request(app).post('/api/skills/ecommerce/plan').send({ brief: '  ' });

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain('请在描述里写上商品名称。');
  });

  it('answers with the template prompts when no planner is configured', async () => {
    const app = createApp({ provider, authMiddleware: signedIn });

    const response = await request(app)
      .post('/api/skills/logo/plan')
      .send({ values: { name: '山川茶事', industry: '茶饮' } });

    expect(response.status).toBe(200);
    expect(response.body.outputs).toHaveLength(4);
    expect(response.body.outputs[0].prompt).toContain('“山川茶事”');
  });

  it('rejects unknown skills, missing answers and signed-out requests', async () => {
    const app = createApp({ provider, authMiddleware: signedIn });

    expect((await request(app).post('/api/skills/nope/plan').send({})).status).toBe(404);
    const missing = await request(app).post('/api/skills/logo/plan').send({ values: {} });
    expect(missing.status).toBe(400);
    expect(JSON.stringify(missing.body)).toContain('请填写品牌名。');

    const signedOutApp = createApp({ provider, authMiddleware: signedOut });
    expect((await request(signedOutApp).post('/api/skills/logo/plan').send({})).status).toBe(401);
  });
});
