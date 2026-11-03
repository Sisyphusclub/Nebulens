import type { z } from 'zod';

import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { saveUpload } from '../storage/localStorage.js';
import { MAX_REFERENCE_IMAGES } from '../types/image.js';
import { isRecord } from '../utils/narrowing.js';

import {
  compatQualitySchema,
  type CompatQuality,
  type chatMessageSchema,
} from './openaiCompat.schemas.js';

export interface SceneInput {
  prompt: string;
  /** Every data image in the message, in order. */
  referenceIds: string[];
}

export interface ImageGenerationToolSelection {
  model?: string;
  size?: string;
  quality?: CompatQuality;
}

function assertReferenceRoom(referenceIds: readonly string[]): void {
  if (referenceIds.length >= MAX_REFERENCE_IMAGES) {
    throw new AppError(
      'BAD_REQUEST',
      `At most ${MAX_REFERENCE_IMAGES} reference images are supported`,
      400,
      undefined,
      { max: MAX_REFERENCE_IMAGES },
    );
  }
}

export async function extractChatScene(
  messages: Array<z.infer<typeof chatMessageSchema>>,
): Promise<SceneInput> {
  const latestUser = [...messages].reverse().find((message) => message.role === 'user');
  if (!latestUser) {
    throw new AppError('BAD_REQUEST', 'Chat request requires at least one user message', 400);
  }
  return extractChatContentScene(latestUser.content);
}

export async function extractChatContentScene(content: unknown): Promise<SceneInput> {
  if (typeof content === 'string') {
    return { prompt: validatePrompt(content, 'messages[].content'), referenceIds: [] };
  }
  if (!Array.isArray(content)) {
    throw new AppError(
      'BAD_REQUEST',
      'User message content must be a string or content array',
      400,
    );
  }

  const textParts: string[] = [];
  const referenceIds: string[] = [];
  for (const part of content) {
    if (!isRecord(part)) continue;
    const type = readStringProperty(part, 'type');
    if (type === 'text') {
      const text = readStringProperty(part, 'text');
      if (text === undefined) {
        throw new AppError('BAD_REQUEST', 'Text content parts require text', 400);
      }
      textParts.push(text);
    }
    if (type === 'image_url') {
      const url = readChatImageUrl(part);
      if (isRemoteImageUrl(url)) {
        throw new AppError('BAD_REQUEST', 'Remote image URLs are not supported', 400);
      }
      assertReferenceRoom(referenceIds);
      referenceIds.push(await saveDataImageUrl(url));
    }
  }

  const prompt = validatePrompt(textParts.join('\n'), 'messages[].content[].text');
  return { prompt, referenceIds };
}

export function readChatImageUrl(part: Record<string, unknown>): string {
  const imageUrl = part['image_url'];
  if (!isRecord(imageUrl)) {
    throw new AppError('BAD_REQUEST', 'image_url content parts require image_url.url', 400);
  }
  const url = readStringProperty(imageUrl, 'url');
  if (url === undefined) {
    throw new AppError('BAD_REQUEST', 'image_url content parts require image_url.url', 400);
  }
  return url;
}

export async function extractResponsesScene(input: unknown): Promise<SceneInput> {
  const textParts: string[] = [];
  const referenceIds: string[] = [];

  async function visit(value: unknown): Promise<void> {
    if (typeof value === 'string') {
      textParts.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        await visit(item);
      }
      return;
    }
    if (!isRecord(value)) return;

    const type = readStringProperty(value, 'type');
    if (type === 'input_text' || type === 'text') {
      const text = readStringProperty(value, 'text');
      if (text !== undefined) textParts.push(text);
      return;
    }
    if (type === 'input_image') {
      const imageUrl = readStringProperty(value, 'image_url');
      if (imageUrl === undefined) {
        throw new AppError('BAD_REQUEST', 'input_image items require image_url', 400);
      }
      if (isRemoteImageUrl(imageUrl)) {
        throw new AppError('BAD_REQUEST', 'Remote image URLs are not supported', 400);
      }
      assertReferenceRoom(referenceIds);
      referenceIds.push(await saveDataImageUrl(imageUrl));
      return;
    }

    const content = value['content'];
    if (content !== undefined) {
      await visit(content);
    }
  }

  await visit(input);
  const prompt = validatePrompt(textParts.join('\n'), 'input');
  return { prompt, referenceIds };
}

export async function saveDataImageUrl(url: string): Promise<string> {
  if (isRemoteImageUrl(url)) {
    throw new AppError('BAD_REQUEST', 'Remote image URLs are not supported', 400);
  }

  const match = /^data:image\/(png|jpe?g|webp);base64,([\s\S]+)$/i.exec(url);
  if (!match) {
    throw new AppError('BAD_REQUEST', 'Only data:image/*;base64 image URLs are supported', 400);
  }

  const buffer = Buffer.from(match[2]!.replace(/\s+/g, ''), 'base64');
  if (buffer.byteLength > env.UPLOAD_MAX_BYTES) {
    throw new AppError(
      'PAYLOAD_TOO_LARGE',
      `Image data URL exceeds ${env.UPLOAD_MAX_BYTES} bytes`,
      413,
      undefined,
      { maxBytes: env.UPLOAD_MAX_BYTES },
    );
  }
  const saved = await saveUpload(buffer);
  return saved.filename;
}

export function isRemoteImageUrl(url: string): boolean {
  return /^https?:\/\//iu.test(url);
}

export function validatePrompt(value: string, field: string): string {
  const prompt = value.trim();
  if (prompt.length === 0) {
    throw new AppError('BAD_REQUEST', `${field} must provide a non-empty prompt`, 400);
  }
  if (prompt.length > 2000) {
    throw new AppError('BAD_REQUEST', `${field} must be at most 2000 characters`, 400);
  }
  return prompt;
}

export function selectImageGenerationTool(
  tools: unknown[] | undefined,
): ImageGenerationToolSelection | undefined {
  if (tools === undefined) return undefined;

  for (const tool of tools) {
    if (!isRecord(tool) || tool['type'] !== 'image_generation') continue;
    const selection: ImageGenerationToolSelection = {};
    const model = tool['model'];
    if (model !== undefined) {
      if (typeof model !== 'string' || model.length === 0) {
        throw new AppError(
          'BAD_REQUEST',
          'image_generation tool model must be a non-empty string',
          400,
        );
      }
      selection.model = model;
    }
    const size = tool['size'];
    if (size !== undefined) {
      if (typeof size !== 'string' || size.length === 0) {
        throw new AppError(
          'BAD_REQUEST',
          'image_generation tool size must be a non-empty string',
          400,
        );
      }
      selection.size = size;
    }
    const quality = tool['quality'];
    if (quality !== undefined) {
      const parsed = compatQualitySchema.safeParse(quality);
      if (!parsed.success) {
        throw new AppError(
          'BAD_REQUEST',
          `image_generation tool quality must be one of ${compatQualitySchema.options.join(', ')}`,
          400,
        );
      }
      selection.quality = parsed.data;
    }
    return selection;
  }

  throw new AppError('BAD_REQUEST', 'Responses endpoint requires an image_generation tool', 400);
}

export function buildResponseTool(
  selection: ImageGenerationToolSelection | undefined,
): Record<string, string> {
  return {
    type: 'image_generation',
    ...(selection?.model !== undefined ? { model: selection.model } : {}),
    ...(selection?.size !== undefined ? { size: selection.size } : {}),
    ...(selection?.quality !== undefined ? { quality: selection.quality } : {}),
  };
}

export function readStringProperty(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}
