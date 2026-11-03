import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { logger } from '../../logger.js';
import { mimeFromExt } from '../../storage/localStorage.js';
import type { ImageQuality } from '../../types/image.js';

export type FetchImpl = typeof globalThis.fetch;

/** Everything needed to send one image request to the 2API gateway. */
export interface ProviderImageRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  referencePaths: string[];
  count: number;
  /** OpenAI-style `WIDTHxHEIGHT` size. */
  size: string;
  quality: ImageQuality | undefined;
  signal: AbortSignal;
  requestId: string | undefined;
}

export function buildUrl(baseUrl: string, suffix: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return `${trimmed}/${suffix}`;
}

/** OpenAI Images API: one call returns `count` images, edits when references are given. */
export function sendOpenAIImageRequest(
  fetchImpl: FetchImpl,
  request: ProviderImageRequest,
): Promise<Response> {
  return request.referencePaths.length > 0
    ? callEdits(fetchImpl, request)
    : callGenerations(fetchImpl, request);
}

async function callGenerations(
  fetchImpl: FetchImpl,
  request: ProviderImageRequest,
): Promise<Response> {
  const { baseUrl, apiKey, model, prompt, count, size, quality, signal, requestId } = request;
  const url = buildUrl(baseUrl, 'v1/images/generations');
  logger.info(
    { requestId, model, promptLength: prompt.length, url, count, size, quality },
    'image generation: provider request (text-to-image)',
  );
  return fetchImpl(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      n: count,
      size,
      ...(quality === undefined ? {} : { quality }),
      response_format: 'b64_json',
    }),
    signal,
  });
}

async function callEdits(fetchImpl: FetchImpl, request: ProviderImageRequest): Promise<Response> {
  const {
    baseUrl,
    apiKey,
    model,
    prompt,
    referencePaths,
    count,
    size,
    quality,
    signal,
    requestId,
  } = request;
  const url = buildUrl(baseUrl, 'v1/images/edits');
  const referenceFiles = await Promise.all(
    referencePaths.map((referencePath) => readReferenceFile(referencePath)),
  );

  const form = new FormData();
  for (const file of referenceFiles) {
    form.append(
      'image',
      new Blob([new Uint8Array(file.buffer)], { type: file.mime }),
      file.basename,
    );
  }
  form.append('prompt', prompt);
  form.append('model', model);
  form.append('n', String(count));
  form.append('size', size);
  if (quality !== undefined) form.append('quality', quality);
  form.append('response_format', 'b64_json');

  logger.info(
    {
      requestId,
      model,
      promptLength: prompt.length,
      url,
      referenceFiles: referenceFiles.map((file) => file.basename),
      referenceBytes: referenceFiles.reduce((sum, file) => sum + file.buffer.byteLength, 0),
      referenceCount: referenceFiles.length,
      count,
      size,
      quality,
    },
    'image generation: provider request (image-to-image)',
  );

  return fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal,
  });
}

async function readReferenceFile(
  referencePath: string,
): Promise<{ buffer: Buffer; basename: string; mime: string }> {
  const buffer = await readFile(referencePath);
  const basename = path.basename(referencePath);
  const ext = basename.split('.').pop()?.toLowerCase() ?? 'png';
  const cleanExt = ext === 'jpg' ? 'jpeg' : ext;
  const mime = mimeFromExt(cleanExt);
  return { buffer, basename, mime };
}
