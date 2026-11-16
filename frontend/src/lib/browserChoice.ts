import { useSyncExternalStore } from 'react';

export interface BrowserChoice<T extends string> {
  fallback: T;
  read: () => T;
  write: (value: T) => void;
  subscribe: (listener: () => void) => () => void;
}

/**
 * One choice out of a few, remembered in this browser and shared by everything on the page
 * that reads it. The fallback is stored as no entry at all, and anything else found under
 * the key reads as the fallback. Where the browser blocks storage the choice lasts as long
 * as the page.
 */
export function createBrowserChoice<T extends string>(
  key: string,
  values: readonly T[],
  fallback: T,
): BrowserChoice<T> {
  const listeners = new Set<() => void>();
  let unsaved = fallback;

  return {
    fallback,
    read() {
      try {
        const stored = window.localStorage.getItem(key);
        return values.find((value) => value === stored) ?? fallback;
      } catch {
        return unsaved;
      }
    },
    write(value) {
      try {
        if (value === fallback) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, value);
      } catch {
        unsaved = value;
      }
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      const onStorage = (event: StorageEvent): void => {
        if (event.key === null || event.key === key) listener();
      };
      listeners.add(listener);
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
      };
    },
  };
}

export function useBrowserChoice<T extends string>(
  choice: BrowserChoice<T>,
): readonly [value: T, setValue: (value: T) => void] {
  const value = useSyncExternalStore(choice.subscribe, choice.read, () => choice.fallback);
  return [value, choice.write];
}
