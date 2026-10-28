import type { Request } from 'express';

import { env } from '../config/env.js';
import { createSignedOutputPath } from '../services/outputAccess.service.js';
import { type GenerateImageOutput } from '../services/imageGeneration.service.js';
import { readOutput } from '../storage/localStorage.js';

import type { ImageResponseFormat } from './openaiCompat.schemas.js';

export interface OpenAIImageItem {
  b64_json?: string;
  url?: string;
}

export interface OpenAIImagesResponse {
  created: number;
  data: OpenAIImageItem[];
}

export async function buildImagesResponse(
  req: Request,
  result: GenerateImageOutput,
  responseFormat: ImageResponseFormat,
): Promise<OpenAIImagesResponse> {
  const data: OpenAIImageItem[] = [];
  for (const image of result.images) {
    if (responseFormat === 'url') {
      data.push({ url: absoluteOutputUrl(req, image.filename) });
    } else {
      data.push({ b64_json: (await readOutput(image.filename)).toString('base64') });
    }
  }
  return { created: unixSeconds(), data };
}

export function absoluteOutputUrl(req: Request, filename: string): string {
  const protocol = firstHeaderSegment(req.get('x-forwarded-proto')) ?? req.protocol ?? 'http';
  const host = req.get('host') ?? `localhost:${env.PORT}`;
  return `${protocol}://${host}${createSignedOutputPath(filename)}`;
}

export function firstHeaderSegment(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const first = value.split(',')[0]?.trim();
  return first && first.length > 0 ? first : undefined;
}

export function unixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function formatGeneratedLinks(urls: string[]): string {
  const noun = urls.length === 1 ? 'image' : 'images';
  const links = urls.map((url, index) => `![image ${index + 1}](${url})`).join('\n');
  return `Generated ${urls.length} ${noun}:\n\n${links}`;
}
