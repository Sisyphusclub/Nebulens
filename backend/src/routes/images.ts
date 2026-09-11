import { Router, type RequestHandler } from 'express';

import {
  buildImagesController,
  type ImagesControllerDeps,
} from '../controllers/images.controller.js';
import { AppError } from '../errors/AppError.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { uploadImageMiddleware } from '../middlewares/upload.js';
import { isUserAdmin } from '../services/adminUser.service.js';

export interface ImagesRouterDeps extends ImagesControllerDeps {
  /** Optional override for the auth middleware; defaults to `requireAuth`. */
  authMiddleware?: RequestHandler;
  uploadRateLimiter?: RequestHandler;
  generationRateLimiter?: RequestHandler;
}

export function buildImagesRouter(deps: ImagesRouterDeps): Router {
  const router = Router();
  const controller = buildImagesController(deps);

  // All image endpoints require authentication. Each handler reads the
  // authenticated user from `req.user.id` for per-user quota tracking.
  router.use(deps.authMiddleware ?? requireAuth);

  // GET /api/images/quota -> { total, remaining } for the current user's effective quota.
  router.get('/quota', (req, res, next) => {
    void controller.quota(req, res, next);
  });
  router.post('/quota/check-in', (req, res, next) => {
    void controller.checkIn(req, res, next);
  });
  router.post(
    '/upload',
    deps.uploadRateLimiter ?? passThrough,
    uploadImageMiddleware,
    (req, res, next) => {
      void controller.upload(req, res, next);
    },
  );
  router.post('/generate', deps.generationRateLimiter ?? passThrough, (req, res, next) => {
    void controller.generate(req, res, next);
  });
  // POST /api/images/generate/high-res -> admin or personal 2K/4K credential.
  router.post(
    '/generate/high-res',
    deps.generationRateLimiter ?? passThrough,
    (req, _res, next) => {
      try {
        if (!req.user) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
        const canUseHighRes =
          isUserAdmin(req.user.id) ||
          deps.userImageApiKeys.getStatus(req.user.id).highResConfigured === true;
        if (!canUseHighRes) {
          throw new AppError('FORBIDDEN', '请先配置 2K/4K 生图 Key。', 403);
        }
        next();
      } catch (err) {
        next(err);
      }
    },
    (req, res, next) => {
      void controller.generateHighRes(req, res, next);
    },
  );

  return router;
}

const passThrough: RequestHandler = (_req, _res, next) => next();
