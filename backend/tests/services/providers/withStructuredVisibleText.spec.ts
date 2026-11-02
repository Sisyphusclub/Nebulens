import { describe, expect, it, vi } from 'vitest';

import type { ImageGenerationProvider } from '../../../src/services/providers/ImageGenerationProvider.js';
import { withStructuredVisibleText } from '../../../src/services/providers/withStructuredVisibleText.js';

function fakeProvider(): ImageGenerationProvider & { generate: ReturnType<typeof vi.fn> } {
  return {
    generate: vi.fn().mockResolvedValue({ images: [], aspectRatio: '1:1' }),
    validateCredential: vi.fn().mockResolvedValue(undefined),
  };
}

describe('withStructuredVisibleText', () => {
  it('sends the structured prompt and keeps every other generation option', async () => {
    const inner = fakeProvider();
    const provider = withStructuredVisibleText(inner);

    await provider.generate({ prompt: '海报写“开业大吉”', count: 2, model: 'gpt-image-2' });

    expect(inner.generate).toHaveBeenCalledWith(
      expect.objectContaining({ count: 2, model: 'gpt-image-2' }),
    );
    const sent = inner.generate.mock.calls[0]?.[0] as { prompt: string };
    expect(sent.prompt).toContain('1. “开业大吉”');
  });

  it('keeps credential validation from the wrapped provider', async () => {
    const inner = fakeProvider();
    const provider = withStructuredVisibleText(inner);

    await provider.validateCredential?.({ credential: 'sk-user', model: 'gpt-image-2' });

    expect(inner.validateCredential).toHaveBeenCalledWith({
      credential: 'sk-user',
      model: 'gpt-image-2',
    });
  });
});
