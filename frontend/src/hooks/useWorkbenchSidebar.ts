import { useSyncExternalStore } from 'react';

import { createExternalStore } from '@/lib/externalStore';

const STORAGE_KEY = 'nebulens-workbench-sidebar-expanded-v1';

function readExpanded(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    // The workbench opens expanded until the user collapses it once.
    return window.localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

const store = createExternalStore<boolean>(readExpanded());

/** Whether the desktop sidebar is expanded; shared by the sidebar and the page offset. */
export function useWorkbenchSidebarExpanded(): boolean {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function setWorkbenchSidebarExpanded(expanded: boolean): void {
  store.set(expanded);
  try {
    window.localStorage.setItem(STORAGE_KEY, String(expanded));
  } catch {
    // Private windows may refuse storage; the choice then lasts for this visit only.
  }
}

export function resetWorkbenchSidebarForTests(expanded = true): void {
  store.set(expanded);
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignored, as above.
  }
}
