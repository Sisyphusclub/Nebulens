import type { GenerateInput, GenerateOutput } from '../../types/image.js';
import { structureVisibleTextPrompt } from '../../utils/visibleText.js';

import type { ImageGenerationProvider } from './ImageGenerationProvider.js';

/**
 * Sends the provider an exact-text checklist for quoted text. The caller's prompt, and so the
 * stored history, stays as the user wrote it.
 */
export function withStructuredVisibleText(
  provider: ImageGenerationProvider,
): ImageGenerationProvider {
  return {
    generate: (input: GenerateInput): Promise<GenerateOutput> =>
      provider.generate({ ...input, prompt: structureVisibleTextPrompt(input.prompt) }),
    ...(provider.validateCredential !== undefined
      ? { validateCredential: provider.validateCredential.bind(provider) }
      : {}),
  };
}
