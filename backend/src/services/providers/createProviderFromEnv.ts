import { env } from '../../config/env.js';

import { TwoApiImageProvider } from './TwoApiImageProvider.js';

/** The 2API provider configured from environment variables, shared by the server and scripts. */
export function createProviderFromEnv(): TwoApiImageProvider {
  return new TwoApiImageProvider({
    baseUrl: env.IMAGE_API_BASE_URL,
    ...(env.HIGH_RES_IMAGE_API_BASE_URL !== undefined
      ? { highResBaseUrl: env.HIGH_RES_IMAGE_API_BASE_URL }
      : {}),
    apiKey: env.IMAGE_API_KEY,
    modelApiKeys: { 'gemini-3-pro-image': env.GEMINI_IMAGE_API_KEY },
    ...(env.HIGH_RES_IMAGE_API_KEY !== undefined
      ? { highResApiKey: env.HIGH_RES_IMAGE_API_KEY }
      : {}),
    defaultModel: env.IMAGE_MODEL,
    ...(env.HIGH_RES_IMAGE_MODEL !== undefined ? { highResModel: env.HIGH_RES_IMAGE_MODEL } : {}),
    timeoutMs: env.IMAGE_API_TIMEOUT_MS,
  });
}
