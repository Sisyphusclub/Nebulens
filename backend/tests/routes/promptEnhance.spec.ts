import type { RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import { AppError } from '../../src/errors/AppError.js';
import type { PromptEnhancer } from '../../src/services/promptEnhance.service.js';
import type { ImageGenerationProvider } from '../../src/services/providers/ImageGenerationProvider.js';

const provider: ImageGenerationProvider = {
  generate: vi.fn(async () => ({ images: [], aspectRatio: '1:1' as const })),
};

const signedIn: RequestHandler = (req, _res, next) => {
  req.user = { id: 'prompt-user', email: 'prompt-user@test.local' };
  next();
};

describe('POST /api/prompt/enhance', () => {
  it('returns the polished prompt', async () => {
    const promptEnhancer: PromptEnhancer = {
      enhance: vi.fn(async (prompt: string) => `${prompt}，清晨薄雾，柔和侧光`),
    };
    const app = createApp({ provider, promptEnhancer, authMiddleware: signedIn });

    const response = await request(app).post('/api/prompt/enhance').send({ prompt: ' 玻璃山居 ' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ prompt: '玻璃山居，清晨薄雾，柔和侧光' });
    expect(promptEnhancer.enhance).toHaveBeenCalledWith('玻璃山居');
  });

  it('rejects an empty prompt', async () => {
    const app = createApp({
      provider,
      promptEnhancer: { enhance: vi.fn() },
      authMiddleware: signedIn,
    });

    const response = await request(app).post('/api/prompt/enhance').send({ prompt: '  ' });

    expect(response.status).toBe(400);
  });

  it('answers 503 when no polishing model is configured', async () => {
    const app = createApp({ provider, authMiddleware: signedIn });

    const response = await request(app).post('/api/prompt/enhance').send({ prompt: '猫' });

    expect(response.status).toBe(503);
  });

  it('passes polishing failures through with their status', async () => {
    const promptEnhancer: PromptEnhancer = {
      enhance: vi.fn(async () => {
        throw new AppError('PROVIDER_ERROR', '润色结果改动了引号中的文字，已保留原提示词。', 502);
      }),
    };
    const app = createApp({ provider, promptEnhancer, authMiddleware: signedIn });

    const response = await request(app).post('/api/prompt/enhance').send({ prompt: '标题“夏日”' });

    expect(response.status).toBe(502);
    expect(JSON.stringify(response.body)).toContain('引号');
  });

  it('requires a signed-in user', async () => {
    const app = createApp({
      provider,
      promptEnhancer: { enhance: vi.fn() },
      authMiddleware: (_req, _res, next) =>
        next(new AppError('UNAUTHORIZED', 'Login required', 401)),
    });

    const response = await request(app).post('/api/prompt/enhance').send({ prompt: '猫' });

    expect(response.status).toBe(401);
  });
});
