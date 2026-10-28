import type { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';

import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logger.js';
import { generateDemoImage } from '../services/demoGeneration.service.js';
import {
  findDemoPromptCacheHit,
  readCachedDemoPromptImage,
  writeDemoPromptCache,
  type DemoPromptCacheConfig,
} from '../services/demoPromptCache.service.js';
import { isUserAdmin } from '../services/adminUser.service.js';
import { insertImageRecords, type NewImageRecord } from '../services/history.service.js';
import {
  assertReferenceImagesOwnedByUser,
  generateImage,
  type GenerateImageOutput,
} from '../services/imageGeneration.service.js';
import type { AnalysisQueue } from '../services/imageAnalysis.service.js';
import type { ImageGenerationProvider } from '../services/providers/ImageGenerationProvider.js';
import type { DailyCheckInResult, QuotaSnapshot } from '../services/quota.service.js';
import { recordReferenceUpload } from '../services/referenceUpload.service.js';
import type { UserQuotaService } from '../services/userQuota.service.js';
import type {
  UserImageApiKeyGroup,
  UserImageApiKeyService,
} from '../services/userImageApiKey.service.js';
import { removeOutput, removeUpload, saveUpload } from '../storage/localStorage.js';
import {
  ASPECT_RATIOS,
  DEFAULT_COUNT,
  DEFAULT_IMAGE_RESOLUTION,
  HIGH_RES_IMAGE_RESOLUTIONS,
  IMAGE_QUALITIES,
  MAX_COUNT,
  MAX_REFERENCE_IMAGES,
  MIN_COUNT,
  supportsImageQuality,
  type ImageQuality,
  type ImageResolution,
} from '../types/image.js';
import { IMAGE_CATEGORIES, type ImageCategory } from '../types/imageCategory.js';

import '../types/express.js';

const generateBaseBodySchema = z.object({
  prompt: z.string().min(1).max(2000),
  referenceId: z.string().min(1).optional(),
  referenceIds: z.array(z.string().min(1)).min(1).max(MAX_REFERENCE_IMAGES).optional(),
  model: z.string().min(1).max(100).optional(),
  count: z.number().int().min(MIN_COUNT).max(MAX_COUNT).optional(),
  aspectRatio: z.enum(ASPECT_RATIOS).optional(),
  quality: z.enum(IMAGE_QUALITIES).optional(),
  isPublic: z.boolean().optional(),
  /** Team visibility; new images are shared unless the requester opts out. */
  isShared: z.boolean().optional(),
  category: z.enum(IMAGE_CATEGORIES).optional(),
});

const generateBodySchema = generateBaseBodySchema.extend({
  demoPresetId: z.string().min(1).max(100).optional(),
  resolution: z.literal(DEFAULT_IMAGE_RESOLUTION).optional(),
});

const highResGenerateBodySchema = generateBaseBodySchema.extend({
  resolution: z.enum(HIGH_RES_IMAGE_RESOLUTIONS),
  demoPresetId: z.never().optional(),
});

export interface ImagesControllerDeps {
  provider: ImageGenerationProvider;
  userQuota: UserQuotaService;
  userImageApiKeys: UserImageApiKeyService;
  /** Analyzes new images in the background when a vision model is configured. */
  imageAnalysis?: AnalysisQueue;
  demoGenerationDelayMs?: number;
  demoPromptCache?: DemoPromptCacheConfig;
}

export interface UploadResponse {
  id: string;
  filename: string;
  mime: string;
  size: number;
}

export interface GenerateImageResponseItem {
  id: string;
  outputUrl: string;
  filename: string;
  mime: string;
  width: number;
  height: number;
}

export interface GenerateResponse {
  batchId: string;
  aspectRatio: string;
  generationMode: GenerateImageOutput['mode'];
  images: GenerateImageResponseItem[];
}

export type QuotaResponse = QuotaSnapshot;

function requireUser(req: Request): { id: string } {
  if (!req.user) {
    throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
  }
  return req.user;
}

function normalizeReferenceIds(
  referenceIds: string[] | undefined,
  referenceId: string | undefined,
): string[] {
  const raw = referenceIds ?? (referenceId !== undefined ? [referenceId] : []);
  return Array.from(new Set(raw.map((id) => id.trim()).filter((id) => id.length > 0)));
}

export function buildImagesController(deps: ImagesControllerDeps): {
  upload: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  generate: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  generateHighRes: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  quota: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  checkIn: (req: Request, res: Response, next: NextFunction) => Promise<void>;
} {
  return {
    async quota(req, res, next) {
      try {
        const user = requireUser(req);
        const pool = deps.userQuota.forUser(user.id);
        const body: QuotaResponse = pool.snapshot();
        res.status(200).json(body);
      } catch (err) {
        next(err);
      }
    },

    async checkIn(req, res, next) {
      try {
        const user = requireUser(req);
        const body: DailyCheckInResult = deps.userQuota.forUser(user.id).checkIn();
        res.status(200).json(body);
      } catch (err) {
        next(err);
      }
    },

    async upload(req, res, next) {
      try {
        const user = requireUser(req);
        if (!req.file) {
          throw new AppError('BAD_REQUEST', 'Missing "image" form field with a file', 400);
        }
        const saved = await saveUpload(req.file.buffer);
        try {
          recordReferenceUpload(saved.filename, user.id);
        } catch (err) {
          await removeUpload(saved.absolutePath);
          throw err;
        }
        const body: UploadResponse = {
          id: saved.filename,
          filename: saved.filename,
          mime: saved.mime,
          size: saved.size,
        };
        res.status(200).json(body);
      } catch (err) {
        next(err);
      }
    },

    generate: abortableHandler(async (req, res, signal) => {
      const user = requireUser(req);
      const parsed = parseGenerateBody(generateBodySchema, req.body);
      const request = buildGenerationRequest(req, user.id, parsed, DEFAULT_IMAGE_RESOLUTION);

      if (parsed.demoPresetId !== undefined) {
        if (!isUserAdmin(user.id)) {
          throw new AppError('FORBIDDEN', '需要管理员权限。', 403);
        }
        if (request.referenceIds.length > 0) {
          throw new AppError('BAD_REQUEST', '演示模式不支持参考图。', 400);
        }

        const result = await generateDemoImage({
          presetId: parsed.demoPresetId,
          signal,
          ...(deps.demoGenerationDelayMs !== undefined
            ? { delayMs: deps.demoGenerationDelayMs }
            : {}),
        });
        await persistAndRespond(request, result, res, signal, deps.imageAnalysis);
        return;
      }

      const hasReferenceContext = request.referenceIds.length > 0;
      if (hasReferenceContext) {
        await assertReferenceImagesOwnedByUser(request.referenceIds, user.id, signal);
      }
      const promptCacheHit =
        deps.demoPromptCache !== undefined && parsed.quality === undefined
          ? findDemoPromptCacheHit(parsed.prompt, deps.demoPromptCache)
          : null;
      if (promptCacheHit !== null && deps.demoPromptCache !== undefined) {
        const cachedResult = await readCachedDemoPromptImage(
          promptCacheHit,
          deps.demoPromptCache,
          hasReferenceContext ? 'image-to-image' : undefined,
          signal,
        );
        if (cachedResult !== null) {
          await persistAndRespond(request, cachedResult, res, signal, deps.imageAnalysis);
          return;
        }
      }

      const result = await generateWithProvider(request, 'standard', signal);
      await persistAndRespond(request, result, res, signal, deps.imageAnalysis);
      if (promptCacheHit !== null && !hasReferenceContext) {
        void writeDemoPromptCache(promptCacheHit, result, signal).catch((cacheError: unknown) => {
          logger.warn(
            { requestId: req.requestId, batchId: result.batchId, err: cacheError },
            'images.generate: failed to write optional demo prompt cache',
          );
        });
      }
    }),

    generateHighRes: abortableHandler(async (req, res, signal) => {
      const user = requireUser(req);
      const parsed = parseGenerateBody(highResGenerateBodySchema, req.body);
      const request = buildGenerationRequest(req, user.id, parsed, parsed.resolution);
      const result = await generateWithProvider(request, 'high-res', signal);
      await persistAndRespond(request, result, res, signal, deps.imageAnalysis);
    }),
  };

  async function generateWithProvider(
    request: GenerationRequest,
    group: UserImageApiKeyGroup,
    signal: AbortSignal,
  ): Promise<GenerateImageOutput> {
    const { body, userId, referenceIds } = request;
    const providerCredential = deps.userImageApiKeys.getProviderCredentialForGroup(userId, group);
    const quotaPool = providerCredential === undefined ? deps.userQuota.forUser(userId) : undefined;
    return generateImage(
      {
        prompt: body.prompt,
        count: body.count ?? DEFAULT_COUNT,
        ...(referenceIds.length > 0 ? { referenceIds } : {}),
        model: body.model ?? env.IMAGE_MODEL,
        ...(body.aspectRatio !== undefined ? { aspectRatio: body.aspectRatio } : {}),
        // The standard endpoint leaves resolution to the service default.
        ...(group === 'high-res' ? { resolution: request.resolution } : {}),
        ...(body.quality !== undefined ? { quality: body.quality } : {}),
        userId,
        requestId: request.requestId,
        signal,
        ...(providerCredential === undefined ? {} : { providerCredential }),
        ...(providerCredential !== undefined && group === 'high-res'
          ? { providerCredentialGroup: 'high-res' as const }
          : {}),
      },
      { provider: deps.provider, ...(quotaPool === undefined ? {} : { quotaPool }) },
    );
  }
}

type GenerateBaseBody = z.infer<typeof generateBaseBodySchema>;

interface GenerationRequest {
  body: GenerateBaseBody;
  userId: string;
  requestId: string;
  referenceIds: string[];
  resolution: ImageResolution;
}

function buildGenerationRequest(
  req: Request,
  userId: string,
  body: GenerateBaseBody,
  resolution: ImageResolution,
): GenerationRequest {
  assertQualitySupported(body.model ?? env.IMAGE_MODEL, body.quality);
  return {
    body,
    userId,
    requestId: req.requestId,
    referenceIds: normalizeReferenceIds(body.referenceIds, body.referenceId),
    resolution,
  };
}

async function persistAndRespond(
  request: GenerationRequest,
  result: GenerateImageOutput,
  res: Response,
  signal: AbortSignal,
  analysis: AnalysisQueue | undefined,
): Promise<void> {
  if (signal.aborted) {
    await discardAbortedResult(result, signal);
  }
  const { body } = request;
  await persistGeneratedImages({
    result,
    userId: request.userId,
    prompt: body.prompt,
    ...(body.model !== undefined ? { requestedModel: body.model } : {}),
    referenceIds: request.referenceIds,
    count: body.count ?? DEFAULT_COUNT,
    resolution: request.resolution,
    ...(body.quality !== undefined ? { quality: body.quality } : {}),
    isPublic: body.isPublic ?? false,
    isShared: body.isShared ?? true,
    ...(body.category !== undefined ? { category: body.category } : {}),
    analyze: analysis !== undefined,
    requestId: request.requestId,
  });
  analysis?.enqueue(result.images.map((image) => image.filename));
  res.status(200).json(responseFromGeneratedResult(result));
}

function abortableHandler(
  handle: (req: Request, res: Response, signal: AbortSignal) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req, res, next) => {
    const requestAbort = createRequestAbortSignal(req, res);
    try {
      await handle(req, res, requestAbort.signal);
    } catch (err) {
      if (!requestAbort.signal.aborted || (!res.destroyed && !res.writableEnded)) next(err);
    } finally {
      requestAbort.dispose();
    }
  };
}

function parseGenerateBody<T>(schema: z.ZodType<T>, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new AppError('BAD_REQUEST', 'Invalid generate request body', 400, err, {
        issues: err.issues,
      });
    }
    throw err;
  }
}

async function persistGeneratedImages(input: {
  result: GenerateImageOutput;
  userId: string;
  prompt: string;
  requestedModel?: string;
  referenceIds: string[];
  count: number;
  resolution: ImageResolution;
  quality?: ImageQuality;
  isPublic: boolean;
  isShared: boolean;
  category?: ImageCategory;
  analyze: boolean;
  requestId: string;
}): Promise<void> {
  const createdAt = new Date();
  const model = input.result.model ?? input.requestedModel ?? env.IMAGE_MODEL;
  const records: NewImageRecord[] = input.result.images.map((image) => ({
    id: image.filename,
    batchId: input.result.batchId,
    userId: input.userId,
    prompt: input.prompt,
    model,
    ...(input.referenceIds[0] !== undefined ? { referenceId: input.referenceIds[0] } : {}),
    ...(input.referenceIds.length > 0 ? { referenceIds: input.referenceIds } : {}),
    ...(input.result.aspectRatio !== undefined ? { aspectRatio: input.result.aspectRatio } : {}),
    filename: image.filename,
    mime: image.mime,
    width: image.width,
    height: image.height,
    count: input.count,
    resolution: input.resolution,
    ...(input.quality !== undefined ? { quality: input.quality } : {}),
    isPublic: input.isPublic,
    isShared: input.isShared,
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.analyze ? { analysisStatus: 'pending' as const } : {}),
    createdAt,
  }));
  try {
    insertImageRecords(records);
  } catch (insertErr) {
    const cleanupResults = await Promise.allSettled(
      input.result.images.map((image) => removeOutput(image.absolutePath)),
    );
    const cleanupFailures = cleanupResults.filter((result) => result.status === 'rejected');
    logger.error(
      {
        requestId: input.requestId,
        userId: input.userId,
        batchId: input.result.batchId,
        err: insertErr,
        cleanupFailureCount: cleanupFailures.length,
      },
      'images.generate: failed to persist image_records',
    );
    throw new AppError(
      'INTERNAL',
      'Generated images could not be saved to history',
      500,
      insertErr,
      { batchId: input.result.batchId },
    );
  }
}

function assertQualitySupported(model: string, quality: ImageQuality | undefined): void {
  if (quality === undefined || supportsImageQuality(model)) return;
  throw new AppError(
    'BAD_REQUEST',
    `Image quality is not supported for model ${model}`,
    400,
    undefined,
    { model, quality },
  );
}

function responseFromGeneratedResult(result: GenerateImageOutput): GenerateResponse {
  return {
    batchId: result.batchId,
    aspectRatio: result.aspectRatio,
    generationMode: result.mode,
    images: result.images.map((image) => ({
      id: image.filename,
      outputUrl: `/api/outputs/${image.filename}`,
      filename: image.filename,
      mime: image.mime,
      width: image.width,
      height: image.height,
    })),
  };
}

function createRequestAbortSignal(
  req: Request,
  res: Response,
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const abort = (): void => {
    if (!controller.signal.aborted) {
      controller.abort(new DOMException('Client disconnected', 'AbortError'));
    }
  };
  const abortOnPrematureClose = (): void => {
    if (!res.writableEnded) abort();
  };
  req.once('aborted', abort);
  res.once('close', abortOnPrematureClose);
  return {
    signal: controller.signal,
    dispose: () => {
      req.off('aborted', abort);
      res.off('close', abortOnPrematureClose);
    },
  };
}

async function discardAbortedResult(
  result: GenerateImageOutput,
  signal: AbortSignal,
): Promise<void> {
  await removeGeneratedImages(result);
  throw requestAbortedError(signal.reason);
}

async function removeGeneratedImages(result: GenerateImageOutput): Promise<void> {
  await Promise.all(result.images.map((image) => removeOutput(image.absolutePath)));
}

function requestAbortedError(cause: unknown): AppError {
  return new AppError('REQUEST_ABORTED', 'Image generation request was cancelled', 499, cause);
}
