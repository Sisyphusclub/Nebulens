import { useCallback } from 'react';

import { createBrowserChoice, useBrowserChoice } from '@/lib/browserChoice';

export const GENERATION_PRIVATE_STORAGE_KEY = 'nebulens.generation-private.v1';

const choice = createBrowserChoice(GENERATION_PRIVATE_STORAGE_KEY, ['false', 'true'], 'false');

/**
 * Whether new images are kept to their maker instead of shown to everyone. The choice is
 * remembered in this browser and shared by every composer, so it is still on after a
 * reload or a move from the home page to the generate page: someone who asked for privacy
 * keeps it until they say otherwise.
 */
export function usePrivateGeneration(): readonly [
  isPrivate: boolean,
  setIsPrivate: (isPrivate: boolean) => void,
] {
  const [value, setValue] = useBrowserChoice(choice);
  const setIsPrivate = useCallback(
    (isPrivate: boolean) => setValue(isPrivate ? 'true' : 'false'),
    [setValue],
  );
  return [value === 'true', setIsPrivate];
}
