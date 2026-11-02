import { describe, expect, it } from 'vitest';

import {
  resolveApiKey,
  resolveBaseUrl,
  resolveModel,
  type TwoApiRoutingConfig,
} from '../../../src/services/providers/twoApiRouting.js';

const config: TwoApiRoutingConfig = {
  baseUrl: 'https://standard.example',
  highResBaseUrl: 'https://high-res.example',
  apiKey: 'server-standard',
  highResApiKey: 'server-high-res',
  modelApiKeys: { 'gemini-3-pro-image': 'server-gemini' },
  defaultModel: 'gpt-image-2',
  highResModel: 'codex-gpt-image-2',
};

describe('resolveModel', () => {
  it('swaps the default model for the high-res model only at 2K/4K', () => {
    expect(resolveModel(config, 'standard', undefined)).toBe('gpt-image-2');
    expect(resolveModel(config, '2k', undefined)).toBe('codex-gpt-image-2');
    expect(resolveModel(config, '4k', 'gpt-image-2')).toBe('codex-gpt-image-2');
  });

  it('keeps an explicitly requested non-default model', () => {
    expect(resolveModel(config, '4k', 'gpt-image-2.5-sunburst')).toBe('gpt-image-2.5-sunburst');
  });

  it('falls back to the requested or default model without a high-res model', () => {
    const { highResModel: _unused, ...withoutHighRes } = config;
    expect(resolveModel(withoutHighRes, '2k', undefined)).toBe('gpt-image-2');
  });
});

describe('resolveBaseUrl', () => {
  it('routes standard requests and per-model keys to the base URL', () => {
    expect(resolveBaseUrl(config, 'gpt-image-2', 'standard', undefined)).toBe(
      'https://standard.example',
    );
    expect(resolveBaseUrl(config, 'gemini-3-pro-image', '4k', undefined)).toBe(
      'https://standard.example',
    );
  });

  it('routes 2K/4K and high-res credentials to the high-res URL', () => {
    expect(resolveBaseUrl(config, 'codex-gpt-image-2', '2k', undefined)).toBe(
      'https://high-res.example',
    );
    expect(resolveBaseUrl(config, 'gpt-image-2', 'standard', 'high-res')).toBe(
      'https://high-res.example',
    );
  });

  it('falls back to the base URL when no high-res URL is configured', () => {
    const { highResBaseUrl: _unused, ...withoutHighRes } = config;
    expect(resolveBaseUrl(withoutHighRes, 'gpt-image-2', '4k', undefined)).toBe(
      'https://standard.example',
    );
  });
});

describe('resolveApiKey', () => {
  it('sends a saved standard credential only with standard requests', () => {
    expect(resolveApiKey(config, 'gpt-image-2', 'standard', 'user-key', 'standard')).toBe(
      'user-key',
    );
    expect(resolveApiKey(config, 'codex-gpt-image-2', '2k', 'user-key', 'standard')).toBe(
      'server-high-res',
    );
  });

  it('sends a saved high-res credential with high-res requests', () => {
    expect(resolveApiKey(config, 'codex-gpt-image-2', '4k', 'user-key', 'high-res')).toBe(
      'user-key',
    );
  });

  it('prefers a per-model server key, then the standard or high-res server key', () => {
    expect(resolveApiKey(config, 'gemini-3-pro-image', '4k', undefined, undefined)).toBe(
      'server-gemini',
    );
    expect(resolveApiKey(config, 'gpt-image-2', 'standard', undefined, undefined)).toBe(
      'server-standard',
    );
    expect(resolveApiKey(config, 'codex-gpt-image-2', '2k', undefined, undefined)).toBe(
      'server-high-res',
    );
  });
});
