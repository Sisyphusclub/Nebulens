import { AppError } from '../../errors/AppError.js';
import { logger } from '../../logger.js';

interface OpenAIImageResponse {
  created?: number;
  data?: Array<{ b64_json?: string; revised_prompt?: string }>;
}

interface GeminiImageResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: { data?: string; mimeType?: string };
      }>;
    };
  }>;
}

export interface ProviderImageData {
  /** Base64-encoded image bytes. */
  data: string;
  mimeType?: string;
}

interface FailedResponseContext {
  hasReference: boolean;
  /** The request used the user's own saved key, so auth failures point at that key. */
  usesSavedCredential: boolean;
}

/**
 * Maps the first non-2xx provider response to an AppError. Returns normally when every
 * response succeeded; throws PROVIDER_EMPTY_RESULT when there is no response at all.
 */
export async function throwForFailedResponse(
  responses: readonly Response[],
  { hasReference, usesSavedCredential }: FailedResponseContext,
): Promise<void> {
  const response = responses.find((candidate) => !candidate.ok) ?? responses[0];
  if (response === undefined) {
    throw new AppError('PROVIDER_EMPTY_RESULT', 'Provider returned no response', 502);
  }
  if (response.status === 429) {
    const summary = await summarizeBody(response);
    logger.warn(
      { upstreamStatus: 429, summary, hasReference },
      'image generation: provider rate-limited',
    );
    throw new AppError(
      'PROVIDER_RATE_LIMITED',
      'Image generation provider rate-limited (429)',
      429,
      undefined,
      { upstreamStatus: 429 },
    );
  }
  if (response.ok) return;

  const summary = await summarizeBody(response);
  logger.warn(
    { upstreamStatus: response.status, summary, hasReference },
    'image generation: provider non-2xx',
  );
  if (usesSavedCredential && (response.status === 401 || response.status === 403)) {
    throw new AppError(
      'PROVIDER_KEY_INVALID',
      'The saved image generation API Key was rejected',
      400,
      undefined,
      { upstreamStatus: response.status },
    );
  }
  if (isPromptRejectionStatus(response.status)) {
    throw new AppError(
      'PROVIDER_PROMPT_REJECTED',
      'Image generation provider rejected the prompt or reference image',
      422,
      undefined,
      { upstreamStatus: response.status, reason: 'prompt_rejected' },
    );
  }
  throw new AppError(
    'PROVIDER_ERROR',
    `Image generation provider returned ${response.status}`,
    502,
    undefined,
    { upstreamStatus: response.status, reason: 'provider_http_error' },
  );
}

/** Reads image payloads from successful OpenAI- or Gemini-shaped responses. */
export async function extractImageData(
  responses: readonly Response[],
  isGemini: boolean,
): Promise<ProviderImageData[]> {
  const imageData: ProviderImageData[] = [];
  for (const candidate of responses) {
    const parsed = (await candidate.json()) as OpenAIImageResponse | GeminiImageResponse;
    if (isGemini) {
      imageData.push(...extractGeminiImageData(parsed as GeminiImageResponse));
    } else {
      imageData.push(
        ...((parsed as OpenAIImageResponse).data ?? []).flatMap((item) =>
          typeof item.b64_json === 'string' && item.b64_json.length > 0
            ? [{ data: item.b64_json }]
            : [],
        ),
      );
    }
  }
  return imageData;
}

export function extensionForMime(mimeType: string | undefined): 'png' | 'jpeg' | 'webp' {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpeg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

function extractGeminiImageData(response: GeminiImageResponse): ProviderImageData[] {
  return (response.candidates ?? []).flatMap((candidate) =>
    (candidate.content?.parts ?? []).flatMap((part) => {
      const inlineData = part.inlineData;
      return inlineData?.data
        ? [
            {
              data: inlineData.data,
              ...(inlineData.mimeType ? { mimeType: inlineData.mimeType } : {}),
            },
          ]
        : [];
    }),
  );
}

function isPromptRejectionStatus(status: number): boolean {
  return status === 400 || status === 422;
}

async function summarizeBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 200);
  } catch {
    return '<no body>';
  }
}
