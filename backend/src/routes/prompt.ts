import { Router, type RequestHandler } from 'express';
import { z } from 'zod';

import { AppError } from '../errors/AppError.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import type { PromptEnhancer } from '../services/promptEnhance.service.js';

export interface PromptRouterDeps {
  /** Omitted when no chat model is configured; the endpoint then answers 503. */
  promptEnhancer?: PromptEnhancer;
  /** Optional override for the auth middleware; defaults to `requireAuth`. */
  authMiddleware?: RequestHandler;
  rateLimiter?: RequestHandler;
}

const enhanceBodySchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
});

export function buildPromptRouter(deps: PromptRouterDeps): Router {
  const router = Router();
  router.use(deps.authMiddleware ?? requireAuth);

  // POST /api/prompt/enhance { prompt } -> { prompt } rewritten into a fuller image prompt.
  router.post('/enhance', deps.rateLimiter ?? passThrough, (req, res, next) => {
    void (async () => {
      try {
        const parsed = enhanceBodySchema.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('BAD_REQUEST', 'Invalid enhance request body', 400, parsed.error, {
            issues: parsed.error.issues,
          });
        }
        if (deps.promptEnhancer === undefined) {
          throw new AppError('PROVIDER_ERROR', '未配置提示词润色模型。', 503);
        }
        const prompt = await deps.promptEnhancer.enhance(parsed.data.prompt);
        res.status(200).json({ prompt });
      } catch (err) {
        next(err);
      }
    })();
  });

  return router;
}

const passThrough: RequestHandler = (_req, _res, next) => next();
