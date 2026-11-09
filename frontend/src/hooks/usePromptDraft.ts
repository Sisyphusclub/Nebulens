import { useCallback, useEffect, useRef } from 'react';

/** One browser store for every composer draft, newest last. */
export const PROMPT_DRAFTS_STORAGE_KEY = 'nebulens.prompt-drafts.v1';
/** Drafts of long-abandoned sessions should not pile up for ever. */
export const PROMPT_DRAFT_LIMIT = 20;

interface PromptDraft {
  key: string;
  text: string;
  savedAt: number;
}

function readDrafts(): PromptDraft[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(PROMPT_DRAFTS_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is PromptDraft =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as PromptDraft).key === 'string' &&
        typeof (item as PromptDraft).text === 'string' &&
        typeof (item as PromptDraft).savedAt === 'number',
    );
  } catch {
    return [];
  }
}

function writeDrafts(drafts: readonly PromptDraft[]): void {
  try {
    if (drafts.length === 0) localStorage.removeItem(PROMPT_DRAFTS_STORAGE_KEY);
    else localStorage.setItem(PROMPT_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // Private windows or a full store: the composer still works, it just forgets.
  }
}

export function readPromptDraft(key: string): string | null {
  return readDrafts().find((draft) => draft.key === key)?.text ?? null;
}

function savePromptDraft(key: string, text: string): void {
  const others = readDrafts().filter((draft) => draft.key !== key);
  if (text.trim() === '') {
    writeDrafts(others);
    return;
  }
  writeDrafts([...others, { key, text, savedAt: Date.now() }].slice(-PROMPT_DRAFT_LIMIT));
}

export function clearPromptDraft(key: string): void {
  savePromptDraft(key, '');
}

/**
 * Forgets every draft under `keyPrefix` that holds exactly `text`, once it has been sent:
 * a first send moves the page into a new session, so the draft may sit under the old key.
 */
export function clearPromptDraftsWithText(keyPrefix: string, text: string): void {
  const sent = text.trim();
  const drafts = readDrafts();
  const kept = drafts.filter(
    (draft) => !(draft.key.startsWith(keyPrefix) && draft.text.trim() === sent),
  );
  if (kept.length !== drafts.length) writeDrafts(kept);
}

/**
 * Keeps the composer's text in the browser under `storageKey`, so a refresh or a stray
 * click away does not lose it, and brings it back when the box is empty. A null key (for
 * instance while sign-in is still being checked) neither reads nor writes.
 */
export function usePromptDraft(
  storageKey: string | null,
  prompt: string,
  setPrompt: (value: string) => void,
): { clear: () => void } {
  const promptRef = useRef(prompt);
  promptRef.current = prompt;
  const savedKey = useRef<string | null>(null);

  useEffect(() => {
    if (storageKey === null) return;
    const draft = readPromptDraft(storageKey);
    if (draft !== null && promptRef.current.trim() === '') setPrompt(draft);
  }, [setPrompt, storageKey]);

  useEffect(() => {
    // The render that switches keys still holds the previous key's text; it is not this
    // key's draft, so saving starts with the next change.
    if (savedKey.current !== storageKey) {
      savedKey.current = storageKey;
      return;
    }
    if (storageKey !== null) savePromptDraft(storageKey, prompt);
  }, [prompt, storageKey]);

  const clear = useCallback(() => {
    if (storageKey !== null) clearPromptDraft(storageKey);
  }, [storageKey]);

  return { clear };
}
