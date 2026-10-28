import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { generateImage, type GenerateImageInput } from '../services/imageGeneration.service.js';
import type { ImageGenerationProvider } from '../services/providers/ImageGenerationProvider.js';
import { readOutput, saveUpload } from '../storage/localStorage.js';
import { DEFAULT_COUNT } from '../types/image.js';

import {
  MODEL_CREATED_AT,
  OPENAI_COMPAT_MODEL_IDS,
  generationBodySchema,
  editsBodySchema,
  chatBodySchema,
  responsesBodySchema,
  parseBody,
  rejectUnsupportedStreaming,
  aspectRatioForSize,
} from './openaiCompat.schemas.js';
import {
  extractChatScene,
  extractResponsesScene,
  selectImageGenerationTool,
  buildResponseTool,
} from './openaiCompat.scenes.js';
import {
  buildImagesResponse,
  absoluteOutputUrl,
  unixSeconds,
  formatGeneratedLinks,
} from './openaiCompat.responses.js';
import '../types/express.js';

interface OpenAICompatControllerDeps {
  provider: ImageGenerationProvider;
}

export function buildOpenAICompatController(deps: OpenAICompatControllerDeps): {
  models: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  generations: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  edits: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  chatCompletions: (req: Request, res: Response, next: NextFunction) => Promise<void>;
  responses: (req: Request, res: Response, next: NextFunction) => Promise<void>;
} {
  return {
    async models(_req, res, next) {
      try {
        res.status(200).json({
          object: 'list',
          data: OPENAI_COMPAT_MODEL_IDS.map((id) => ({
            id,
            object: 'model',
            created: MODEL_CREATED_AT,
            owned_by: 'nebulens',
          })),
        });
      } catch (err) {
        next(err);
      }
    },

    async generations(req, res, next) {
      try {
        const parsed = parseBody(
          generationBodySchema,
          req.body as unknown,
          'Invalid image generation request body',
        );
        rejectUnsupportedStreaming(parsed.stream, parsed.partial_images);

        const result = await generateImage(
          buildGenerateInput({
            prompt: parsed.prompt,
            count: parsed.n ?? DEFAULT_COUNT,
            aspectRatio: aspectRatioForSize(parsed.size),
            ...(parsed.model !== undefined ? { model: parsed.model } : {}),
          }),
          { provider: deps.provider },
        );

        const body = await buildImagesResponse(req, result, parsed.response_format ?? 'b64_json');
        res.status(200).json(body);
      } catch (err) {
        next(err);
      }
    },

    async edits(req, res, next) {
      try {
        const parsed = parseBody(
          editsBodySchema,
          req.body as unknown,
          'Invalid image edit request body',
        );
        if (parsed.mask !== undefined) {
          throw new AppError('BAD_REQUEST', 'Masks are not supported by this endpoint', 400);
        }
        rejectUnsupportedStreaming(parsed.stream, parsed.partial_images);

        if (!req.file) {
          throw new AppError('BAD_REQUEST', 'Missing "image" form field with a file', 400);
        }

        const reference = await saveUpload(req.file.buffer);
        const result = await generateImage(
          buildGenerateInput({
            prompt: parsed.prompt,
            referenceId: reference.filename,
            count: parsed.n ?? DEFAULT_COUNT,
            aspectRatio: aspectRatioForSize(parsed.size),
            ...(parsed.model !== undefined ? { model: parsed.model } : {}),
          }),
          { provider: deps.provider },
        );

        const body = await buildImagesResponse(req, result, parsed.response_format ?? 'b64_json');
        res.status(200).json(body);
      } catch (err) {
        next(err);
      }
    },

    async chatCompletions(req, res, next) {
      try {
        const parsed = parseBody(
          chatBodySchema,
          req.body as unknown,
          'Invalid chat completion request body',
        );
        if (parsed.stream === true) {
          throw new AppError('BAD_REQUEST', 'Streaming chat completions are not supported', 400);
        }

        const scene = await extractChatScene(parsed.messages);
        const result = await generateImage(
          buildGenerateInput({
            prompt: scene.prompt,
            count: parsed.n ?? DEFAULT_COUNT,
            aspectRatio: aspectRatioForSize(parsed.size),
            ...(scene.referenceId !== undefined ? { referenceId: scene.referenceId } : {}),
            ...(parsed.model !== undefined ? { model: parsed.model } : {}),
          }),
          { provider: deps.provider },
        );

        const urls = result.images.map((image) => absoluteOutputUrl(req, image.filename));
        const content = formatGeneratedLinks(urls);
        res.status(200).json({
          id: `chatcmpl-local-${randomUUID()}`,
          object: 'chat.completion',
          created: unixSeconds(),
          model: parsed.model ?? env.IMAGE_MODEL,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content,
              },
              finish_reason: 'stop',
              logprobs: null,
            },
          ],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          },
        });
      } catch (err) {
        next(err);
      }
    },

    async responses(req, res, next) {
      try {
        const parsed = parseBody(
          responsesBodySchema,
          req.body as unknown,
          'Invalid responses request body',
        );
        if (parsed.stream === true) {
          throw new AppError('BAD_REQUEST', 'Streaming responses are not supported', 400);
        }
        if (parsed.input === undefined) {
          throw new AppError('BAD_REQUEST', 'Responses request requires input', 400);
        }

        const imageTool = selectImageGenerationTool(parsed.tools);
        const scene = await extractResponsesScene(parsed.input);
        const model = imageTool?.model ?? parsed.model;
        const size = imageTool?.size ?? parsed.size;
        const result = await generateImage(
          buildGenerateInput({
            prompt: scene.prompt,
            count: parsed.n ?? DEFAULT_COUNT,
            aspectRatio: aspectRatioForSize(size),
            ...(scene.referenceId !== undefined ? { referenceId: scene.referenceId } : {}),
            ...(model !== undefined ? { model } : {}),
          }),
          { provider: deps.provider },
        );

        const urls = result.images.map((image) => absoluteOutputUrl(req, image.filename));
        const outputText = formatGeneratedLinks(urls);
        const imageOutputs = await Promise.all(
          result.images.map(async (image) => ({
            id: `ig_local_${randomUUID()}`,
            type: 'image_generation_call',
            status: 'completed',
            result: (await readOutput(image.filename)).toString('base64'),
          })),
        );

        res.status(200).json({
          id: `resp_local_${randomUUID()}`,
          object: 'response',
          created_at: unixSeconds(),
          status: 'completed',
          model: model ?? env.IMAGE_MODEL,
          output_text: outputText,
          output: [
            ...imageOutputs,
            {
              id: `msg_local_${randomUUID()}`,
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [
                {
                  type: 'output_text',
                  text: outputText,
                  annotations: [],
                },
              ],
            },
          ],
          error: null,
          incomplete_details: null,
          parallel_tool_calls: false,
          tool_choice: parsed.tool_choice ?? 'auto',
          tools: [buildResponseTool(imageTool)],
          temperature: null,
          top_p: null,
          usage: {
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
          },
        });
      } catch (err) {
        next(err);
      }
    },
  };
}

function buildGenerateInput(input: GenerateImageInput): GenerateImageInput {
  return input;
}
