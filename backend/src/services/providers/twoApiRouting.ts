import { DEFAULT_IMAGE_RESOLUTION, type ImageResolution } from '../../types/image.js';

/** The part of TwoApiConfig that decides where a request goes and with which key. */
export interface TwoApiRoutingConfig {
  baseUrl: string;
  highResBaseUrl?: string;
  apiKey: string;
  modelApiKeys?: Readonly<Record<string, string>>;
  highResApiKey?: string;
  defaultModel: string;
  highResModel?: string;
}

export type CredentialGroup = 'standard' | 'high-res' | undefined;

/** 2K/4K requests for the default model use the dedicated high-res model when one is set. */
export function resolveModel(
  config: TwoApiRoutingConfig,
  resolution: ImageResolution,
  requestedModel: string | undefined,
): string {
  if (
    resolution !== DEFAULT_IMAGE_RESOLUTION &&
    config.highResModel !== undefined &&
    (requestedModel === undefined || requestedModel === config.defaultModel)
  ) {
    return config.highResModel;
  }
  return requestedModel ?? config.defaultModel;
}

/** Models with their own key, and standard requests, stay on the base URL. */
export function resolveBaseUrl(
  config: TwoApiRoutingConfig,
  model: string,
  resolution: ImageResolution,
  credentialGroup: CredentialGroup,
): string {
  if (credentialGroup === 'high-res') {
    return config.highResBaseUrl ?? config.baseUrl;
  }
  if (config.modelApiKeys?.[model] !== undefined) return config.baseUrl;
  if (resolution === DEFAULT_IMAGE_RESOLUTION) return config.baseUrl;
  return config.highResBaseUrl ?? config.baseUrl;
}

/**
 * A user's saved key is only sent where its group applies; otherwise a per-model key,
 * then the standard or high-res server key.
 */
export function resolveApiKey(
  config: TwoApiRoutingConfig,
  model: string,
  resolution: ImageResolution,
  credential: string | undefined,
  credentialGroup: CredentialGroup,
): string {
  if (
    credential !== undefined &&
    (resolution === DEFAULT_IMAGE_RESOLUTION || credentialGroup === 'high-res')
  ) {
    return credential;
  }
  const modelApiKey = config.modelApiKeys?.[model];
  if (modelApiKey !== undefined) return modelApiKey;
  if (resolution === DEFAULT_IMAGE_RESOLUTION) {
    return config.apiKey;
  }
  return config.highResApiKey ?? config.apiKey;
}
