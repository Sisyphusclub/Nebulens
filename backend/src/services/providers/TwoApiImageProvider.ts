import { Buffer } from 'node:buffer';

import { AppError } from '../../errors/AppError.js';
import { logger } from '../../logger.js';
import { removeOutput, saveOutput } from '../../storage/localStorage.js';
import {
  DEFAULT_ASPECT_RATIO,
  DEFAULT_COUNT,
  DEFAULT_IMAGE_RESOLUTION,
  GEMINI_IMAGE_MODEL,
  aspectSizeForResolution,
  type AspectRatio,
  type GenerateImageItem,
  type GenerateInput,
  type GenerateOutput,
  type ImageResolution,
} from '../../types/image.js';
import { readImageDimensions } from '../../utils/imageDimensions.js';
import { isRecord } from '../../utils/narrowing.js';

import type {
  ImageGenerationProvider,
  ProviderCredentialValidationInput,
} from './ImageGenerationProvider.js';
import {
  buildUrl,
  sendGeminiImageRequests,
  sendOpenAIImageRequest,
  type FetchImpl,
  type ProviderImageRequest,
} from './twoApiRequests.js';
import {
  extensionForMime,
  extractImageData,
  throwForFailedResponse,
  type ProviderImageData,
} from './twoApiResponses.js';
import { resolveApiKey, resolveBaseUrl, resolveModel } from './twoApiRouting.js';

export interface TwoApiConfig {
  baseUrl: string;
  highResBaseUrl?: string;
  apiKey: string;
  modelApiKeys?: Readonly<Record<string, string>>;
  highResApiKey?: string;
  defaultModel: string;
  highResModel?: string;
  timeoutMs: number;
}

export class TwoApiImageProvider implements ImageGenerationProvider {
  private readonly config: TwoApiConfig;
  private readonly fetchImpl: FetchImpl;

  constructor(config: TwoApiConfig, fetchImpl?: FetchImpl) {
    this.config = config;
    this.fetchImpl = fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async validateCredential(input: ProviderCredentialValidationInput): Promise<void> {
    const timeoutSignal = AbortSignal.timeout(this.config.timeoutMs);
    const signal =
      input.signal === undefined ? timeoutSignal : AbortSignal.any([input.signal, timeoutSignal]);
    const baseUrl =
      input.credentialGroup === 'high-res'
        ? (this.config.highResBaseUrl ?? this.config.baseUrl)
        : this.config.baseUrl;
    let response: Response;
    try {
      response = await this.fetchImpl(buildUrl(baseUrl, 'v1/models'), {
        method: 'GET',
        headers: { Authorization: `Bearer ${input.credential}` },
        signal,
      });
    } catch (err) {
      if (input.signal?.aborted === true) {
        throw new AppError('REQUEST_ABORTED', 'API Key validation was cancelled', 499, err);
      }
      if (timeoutSignal.aborted || isTimeoutLike(err)) {
        throw new AppError(
          'PROVIDER_KEY_VALIDATION_FAILED',
          'Timed out while validating the API Key',
          504,
          err,
        );
      }
      throw new AppError(
        'PROVIDER_KEY_VALIDATION_FAILED',
        'Failed to reach the image generation provider while validating the API Key',
        502,
        err,
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new AppError(
        'PROVIDER_KEY_INVALID',
        'The image generation API Key was rejected',
        400,
        undefined,
        { upstreamStatus: response.status },
      );
    }
    if (!response.ok) {
      throw new AppError(
        'PROVIDER_KEY_VALIDATION_FAILED',
        `Image generation provider returned ${response.status} while validating the API Key`,
        502,
        undefined,
        { upstreamStatus: response.status },
      );
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch (err) {
      if (input.signal?.aborted === true) {
        throw new AppError('REQUEST_ABORTED', 'API Key validation was cancelled', 499, err);
      }
      if (timeoutSignal.aborted || isTimeoutLike(err)) {
        throw new AppError(
          'PROVIDER_KEY_VALIDATION_FAILED',
          'Timed out while reading API Key validation results',
          504,
          err,
        );
      }
      throw new AppError(
        'PROVIDER_KEY_VALIDATION_FAILED',
        'Image generation provider returned malformed model data',
        502,
        err,
      );
    }
    if (!isRecord(parsed) || !Array.isArray(parsed.data)) {
      throw new AppError(
        'PROVIDER_KEY_VALIDATION_FAILED',
        'Image generation provider returned malformed model data',
        502,
      );
    }
    const modelIds = parsed.data.flatMap((model) =>
      isRecord(model) && typeof model.id === 'string' ? [model.id] : [],
    );
    if (!modelIds.includes(input.model)) {
      throw new AppError(
        'PROVIDER_KEY_MODEL_UNAVAILABLE',
        'The API Key group does not provide the configured image model',
        400,
        undefined,
        { model: input.model },
      );
    }
  }

  async generate(input: GenerateInput): Promise<GenerateOutput> {
    const aspectRatio: AspectRatio = input.aspectRatio ?? DEFAULT_ASPECT_RATIO;
    const resolution: ImageResolution = input.resolution ?? DEFAULT_IMAGE_RESOLUTION;
    const model = resolveModel(this.config, resolution, input.model);
    const baseUrl = resolveBaseUrl(this.config, model, resolution, input.providerCredentialGroup);
    const apiKey = resolveApiKey(
      this.config,
      model,
      resolution,
      input.providerCredential,
      input.providerCredentialGroup,
    );
    const count = input.count ?? DEFAULT_COUNT;
    const sizing = aspectSizeForResolution(aspectRatio, resolution);
    if (sizing === undefined) {
      throw new AppError(
        'BAD_REQUEST',
        `Unsupported aspect ratio ${aspectRatio} for image resolution ${resolution}`,
        400,
        undefined,
        { aspectRatio, resolution },
      );
    }
    const referencePaths = normalizeReferencePaths(input);
    const hasReference = referencePaths.length > 0;
    const timeoutSignal = AbortSignal.timeout(this.config.timeoutMs);
    const requestSignal =
      input.signal === undefined ? timeoutSignal : AbortSignal.any([input.signal, timeoutSignal]);

    const start = Date.now();
    const isGemini = model === GEMINI_IMAGE_MODEL;
    const request: ProviderImageRequest = {
      baseUrl,
      apiKey,
      model,
      prompt: input.prompt,
      referencePaths,
      count,
      size: sizing.size,
      quality: input.quality,
      aspectRatio,
      resolution,
      signal: requestSignal,
      requestId: input.requestId,
    };
    let responses: Response[];
    try {
      responses = isGemini
        ? await sendGeminiImageRequests(this.fetchImpl, request)
        : [await sendOpenAIImageRequest(this.fetchImpl, request)];
    } catch (err) {
      if (input.signal?.aborted === true) {
        throw new AppError('REQUEST_ABORTED', 'Image generation request was cancelled', 499, err);
      }
      if (isTimeoutLike(err)) {
        throw new AppError(
          'PROVIDER_TIMEOUT',
          `Image generation timed out after ${this.config.timeoutMs}ms`,
          504,
          err,
        );
      }
      throw new AppError('PROVIDER_ERROR', 'Failed to reach image generation provider', 502, err);
    }

    await throwForFailedResponse(responses, {
      hasReference,
      usesSavedCredential: input.providerCredential !== undefined,
    });

    let imageData: ProviderImageData[];
    try {
      imageData = await extractImageData(responses, isGemini);
    } catch (err) {
      if (input.signal?.aborted === true) {
        throw new AppError('REQUEST_ABORTED', 'Image generation request was cancelled', 499, err);
      }
      if (timeoutSignal.aborted || isTimeoutLike(err)) {
        throw new AppError(
          'PROVIDER_TIMEOUT',
          `Image generation timed out after ${this.config.timeoutMs}ms`,
          504,
          err,
        );
      }
      throw new AppError('PROVIDER_ERROR', 'Provider returned malformed JSON', 502, err);
    }

    if (imageData.length === 0) {
      throw new AppError(
        'PROVIDER_EMPTY_RESULT',
        'Provider did not return image data',
        502,
        undefined,
        { reason: 'empty_result' },
      );
    }

    const images: GenerateImageItem[] = [];
    try {
      for (const item of imageData) {
        requestSignal.throwIfAborted();
        const buffer = Buffer.from(item.data, 'base64');
        const dimensions = readImageDimensions(buffer) ?? sizing;
        const saved = await saveOutput(buffer, extensionForMime(item.mimeType));
        if (requestSignal.aborted) {
          await removeOutput(saved.absolutePath);
          requestSignal.throwIfAborted();
        }
        images.push({
          outputPath: saved.absolutePath,
          width: dimensions.width,
          height: dimensions.height,
        });
      }
    } catch (err) {
      await Promise.all(images.map((image) => removeOutput(image.outputPath)));
      if (input.signal?.aborted === true) {
        throw new AppError('REQUEST_ABORTED', 'Image generation request was cancelled', 499, err);
      }
      if (timeoutSignal.aborted) {
        throw new AppError(
          'PROVIDER_TIMEOUT',
          `Image generation timed out after ${this.config.timeoutMs}ms`,
          504,
          err,
        );
      }
      throw err;
    }

    logger.info(
      {
        durationMs: Date.now() - start,
        outputCount: images.length,
        aspectRatio,
        resolution,
        highResRequest: resolution !== DEFAULT_IMAGE_RESOLUTION,
        hasReference,
      },
      'image generation: provider success',
    );

    return { images, aspectRatio, model };
  }
}

function normalizeReferencePaths(input: GenerateInput): string[] {
  const raw = input.referencePaths ?? (input.referencePath ? [input.referencePath] : []);
  return Array.from(new Set(raw.filter((item) => item.length > 0)));
}

function isTimeoutLike(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === 'AbortError' || err.name === 'TimeoutError';
}
