import { z, ZodError } from 'zod';

import { AppError } from '../errors/AppError.js';
import {
  ASPECT_RATIOS,
  ASPECT_SIZE_MAP,
  DEFAULT_ASPECT_RATIO,
  MAX_COUNT,
  MIN_COUNT,
  type AspectRatio,
} from '../types/image.js';

export const MODEL_CREATED_AT = 1_710_000_000;

export const OPENAI_COMPAT_MODEL_IDS = [
  'gpt-image-2',
  'gpt-image-2.5-flare',
  'gpt-image-2.5-sunburst',
  'gemini-3-pro-image',
  'codex-gpt-image-2',
  'auto',
  'gpt-5',
  'gpt-5-1',
  'gpt-5-2',
  'gpt-5-3',
  'gpt-5-3-mini',
  'gpt-5-mini',
] as const;

export const SIZE_TO_ASPECT_RATIO: Record<string, AspectRatio> = {
  ...Object.fromEntries(ASPECT_RATIOS.map((ratio) => [ASPECT_SIZE_MAP[ratio].size, ratio])),
  auto: DEFAULT_ASPECT_RATIO,
  '1024x1024': '1:1',
  '1536x1024': '3:2',
  '1024x1536': '2:3',
  '1792x1024': '16:9',
  '1024x1792': '9:16',
};

export const imageResponseFormatSchema = z.enum(['b64_json', 'url']);

export type ImageResponseFormat = z.infer<typeof imageResponseFormatSchema>;

export const promptSchema = z.string().trim().min(1).max(2000);

export const generationBodySchema = z
  .object({
    prompt: promptSchema,
    model: z.string().min(1).max(100).optional(),
    n: z.number().int().min(MIN_COUNT).max(MAX_COUNT).optional(),
    size: z.string().min(1).optional(),
    response_format: imageResponseFormatSchema.optional(),
    stream: z.boolean().optional(),
    partial_images: z.unknown().optional(),
  })
  .passthrough();

export const editsBodySchema = z
  .object({
    prompt: z.preprocess(singleFormValue, promptSchema),
    model: z.preprocess(singleFormValue, z.string().min(1).max(100).optional()),
    n: z.preprocess(
      coerceOptionalFormNumber,
      z.number().int().min(MIN_COUNT).max(MAX_COUNT).optional(),
    ),
    size: z.preprocess(singleFormValue, z.string().min(1).optional()),
    response_format: z.preprocess(singleFormValue, imageResponseFormatSchema.optional()),
    mask: z.unknown().optional(),
    stream: z.preprocess(coerceOptionalFormBoolean, z.boolean().optional()),
    partial_images: z.unknown().optional(),
  })
  .passthrough();

export const chatMessageSchema = z
  .object({
    role: z.string(),
    content: z.unknown(),
  })
  .passthrough();

export const chatBodySchema = z
  .object({
    model: z.string().min(1).max(100).optional(),
    messages: z.array(chatMessageSchema).min(1),
    n: z.number().int().min(MIN_COUNT).max(MAX_COUNT).optional(),
    size: z.string().min(1).optional(),
    stream: z.boolean().optional(),
  })
  .passthrough();

export const responsesBodySchema = z
  .object({
    model: z.string().min(1).max(100).optional(),
    input: z.unknown(),
    tools: z.array(z.unknown()).optional(),
    n: z.number().int().min(MIN_COUNT).max(MAX_COUNT).optional(),
    size: z.string().min(1).optional(),
    stream: z.boolean().optional(),
    tool_choice: z.unknown().optional(),
  })
  .passthrough();

export function parseBody<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  try {
    return schema.parse(value);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new AppError('BAD_REQUEST', message, 400, err, { issues: err.issues });
    }
    throw err;
  }
}

export function singleFormValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.length === 1 ? value[0] : value;
  }
  return value;
}

export function coerceOptionalFormNumber(value: unknown): unknown {
  const single = singleFormValue(value);
  if (single === undefined || single === '') return undefined;
  if (typeof single === 'string') return Number(single);
  return single;
}

export function coerceOptionalFormBoolean(value: unknown): unknown {
  const single = singleFormValue(value);
  if (single === undefined || single === '') return undefined;
  if (typeof single === 'string') {
    if (single === 'true') return true;
    if (single === 'false') return false;
  }
  return single;
}

export function rejectUnsupportedStreaming(
  stream: boolean | undefined,
  partialImages: unknown,
): void {
  if (stream === true) {
    throw new AppError('BAD_REQUEST', 'Streaming image generation is not supported', 400);
  }
  if (partialImages !== undefined) {
    throw new AppError('BAD_REQUEST', 'Partial image streaming is not supported', 400);
  }
}

export function aspectRatioForSize(size: string | undefined): AspectRatio {
  if (size === undefined) return DEFAULT_ASPECT_RATIO;
  const aspectRatio = SIZE_TO_ASPECT_RATIO[size];
  if (aspectRatio === undefined) {
    throw new AppError('BAD_REQUEST', `Unsupported image size: ${size}`, 400, undefined, { size });
  }
  return aspectRatio;
}
