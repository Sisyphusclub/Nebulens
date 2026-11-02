import { Router, type RequestHandler } from 'express';
import { z } from 'zod';

import { AppError } from '../errors/AppError.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import {
  missingBriefField,
  publicSkill,
  readSkillValues,
  type SkillPlanner,
} from '../services/skillPlanner.service.js';
import { findSkill, SKILLS } from '../skills/skillDefinitions.js';

export interface SkillsRouterDeps {
  planner: SkillPlanner;
  /** Optional override for the auth middleware; defaults to `requireAuth`. */
  authMiddleware?: RequestHandler;
  rateLimiter?: RequestHandler;
}

const planBodySchema = z.object({
  values: z.record(z.string(), z.unknown()).default({}),
  /** One line typed in the composer; when sent, the text and list answers come from it. */
  brief: z.string().max(500).optional(),
  hasReference: z.boolean().default(false),
});

export function buildSkillsRouter(deps: SkillsRouterDeps): Router {
  const router = Router();

  // GET /api/skills (public) -> { skills } with each skill's form and output images.
  router.get('/', (_req, res) => {
    res.status(200).json({ skills: SKILLS.map(publicSkill) });
  });

  // POST /api/skills/:id/plan { values, brief?, hasReference } -> { title, outputs } with
  // one ready-to-generate prompt per output image. With a brief, `values` carries only the
  // choices and the rest is read from the brief.
  router.post(
    '/:id/plan',
    deps.authMiddleware ?? requireAuth,
    deps.rateLimiter ?? passThrough,
    (req, res, next) => {
      void (async () => {
        try {
          const skill = findSkill(String(req.params.id));
          if (skill === undefined) throw new AppError('NOT_FOUND', '没有这个技能。', 404);
          const parsed = planBodySchema.safeParse(req.body ?? {});
          if (!parsed.success) {
            throw new AppError(
              'BAD_REQUEST',
              'Invalid skill plan request body',
              400,
              parsed.error,
              {
                issues: parsed.error.issues,
              },
            );
          }
          let answers: Record<string, unknown> = parsed.data.values;
          if (parsed.data.brief !== undefined) {
            const fromBrief = await deps.planner.readBrief(skill, parsed.data.brief);
            const missing = missingBriefField(skill, fromBrief);
            if (missing !== undefined) {
              throw new AppError('BAD_REQUEST', `请在描述里写上${missing.label}。`, 400);
            }
            answers = { ...parsed.data.values, ...fromBrief };
          }
          const values = readSkillValues(skill, answers, parsed.data.hasReference);
          res.status(200).json(await deps.planner.plan(skill, values, parsed.data.hasReference));
        } catch (err) {
          next(err);
        }
      })();
    },
  );

  return router;
}

const passThrough: RequestHandler = (_req, _res, next) => next();
