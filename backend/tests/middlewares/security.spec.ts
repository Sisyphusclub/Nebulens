import type { RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import type { ImageGenerationProvider } from '../../src/services/providers/ImageGenerationProvider.js';

const provider: ImageGenerationProvider = {
  generate: vi.fn(async () => ({
    images: [{ outputPath: '/dev/null/never.png', width: 1024, height: 1024 }],
    aspectRatio: '1:1' as const,
  })),
};

const stubAuth: RequestHandler = (req, _res, next) => {
  req.user = { id: 'rate-limit-user', email: 'rate-limit-user@test.local' };
  next();
};

describe('application security middleware', () => {
  it('sets baseline security headers', async () => {
    const response = await request(createApp({ provider })).get('/api/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
  });

  it('returns the structured AppError envelope when generation is rate limited', async () => {
    const app = createApp({ provider, authMiddleware: stubAuth });
    let response: request.Response | undefined;
    for (let index = 0; index < 11; index += 1) {
      response = await request(app).post('/api/images/generate').send({ prompt: '' });
    }

    expect(response?.status).toBe(429);
    expect(response?.body.error).toMatchObject({
      code: 'RATE_LIMITED',
      message: '请求过于频繁，请稍后重试。',
    });
    expect(response?.body.error.requestId).toEqual(expect.any(String));
    expect(response?.headers['ratelimit']).toEqual(expect.any(String));
  });

  it('does not count session lookups against the auth rate limit', async () => {
    const app = createApp({ provider });
    for (let index = 0; index < 25; index += 1) {
      const response = await request(app).get('/api/auth/get-session');
      expect(response.status).not.toBe(429);
    }

    // Credential endpoints still share the remaining auth budget.
    const signIn = await request(app)
      .post('/api/auth/sign-in/username')
      .send({ username: 'nobody', password: 'wrong-password' });
    expect(signIn.status).not.toBe(429);
  });

  it('does not count profile reads against the auth rate limit', async () => {
    const app = createApp({ provider });
    for (let index = 0; index < 25; index += 1) {
      const response = await request(app).get('/api/auth/me');
      expect(response.status).not.toBe(429);
    }
  });

  it('still rate limits repeated credential attempts', async () => {
    const app = createApp({ provider });
    let response: request.Response | undefined;
    for (let index = 0; index < 21; index += 1) {
      response = await request(app)
        .post('/api/auth/sign-in/username')
        .send({ username: 'nobody', password: 'wrong-password' });
    }

    expect(response?.status).toBe(429);
  });
});
