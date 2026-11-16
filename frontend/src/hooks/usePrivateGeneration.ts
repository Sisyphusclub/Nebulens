import { useSyncExternalStore } from 'react';

export const GENERATION_PRIVATE_STORAGE_KEY = 'nebulens.generation-private.v1';

const listeners = new Set<() => void>();
/** The choice for this page alone, for a browser that blocks storage. */
let unsaved = false;

function read(): boolean {
  try {
    return window.localStorage.getItem(GENERATION_PRIVATE_STORAGE_KEY) === 'true';
  } catch {
    return unsaved;
  }
}

function write(isPrivate: boolean): void {
  try {
    if (isPrivate) window.localStorage.setItem(GENERATION_PRIVATE_STORAGE_KEY, 'true');
    else window.localStorage.removeItem(GENERATION_PRIVATE_STORAGE_KEY);
  } catch {
    unsaved = isPrivate;
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  const onStorage = (event: StorageEvent): void => {
    if (event.key === null || event.key === GENERATION_PRIVATE_STORAGE_KEY) listener();
  };
  listeners.add(listener);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

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
  const isPrivate = useSyncExternalStore(subscribe, read, () => false);
  return [isPrivate, write];
}
