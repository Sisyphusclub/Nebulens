import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { expect, it } from 'vitest';

import {
  clearPromptDraftsWithText,
  PROMPT_DRAFT_LIMIT,
  PROMPT_DRAFTS_STORAGE_KEY,
  readPromptDraft,
  usePromptDraft,
} from '@/hooks/usePromptDraft';

function useDraftedPrompt(storageKey: string | null, initial = '') {
  const [prompt, setPrompt] = useState(initial);
  const draft = usePromptDraft(storageKey, prompt, setPrompt);
  return { prompt, setPrompt, ...draft };
}

function saveDraft(key: string, text: string) {
  const { result, unmount } = renderHook(() => useDraftedPrompt(key));
  act(() => result.current.setPrompt(text));
  unmount();
}

it('keeps what was typed and brings it back after a reload', () => {
  saveDraft('landing:user-a', '雨夜里的霓虹街角');

  const { result } = renderHook(() => useDraftedPrompt('landing:user-a'));

  expect(result.current.prompt).toBe('雨夜里的霓虹街角');
});

it('forgets the draft once the box is emptied', () => {
  const { result } = renderHook(() => useDraftedPrompt('landing:user-a'));
  act(() => result.current.setPrompt('周年庆海报'));
  expect(readPromptDraft('landing:user-a')).toBe('周年庆海报');

  act(() => result.current.setPrompt('   '));

  expect(readPromptDraft('landing:user-a')).toBeNull();
});

it('never replaces a prompt the page already filled in', () => {
  saveDraft('generate:user-a:new', '旧草稿');

  const { result } = renderHook(() => useDraftedPrompt('generate:user-a:new', '模板提示词'));

  expect(result.current.prompt).toBe('模板提示词');
});

it('keeps each key apart and does not carry a prompt over when the key changes', () => {
  saveDraft('generate:user-a:s2', '第二个会话的草稿');
  const { result, rerender } = renderHook(({ key }) => useDraftedPrompt(key), {
    initialProps: { key: 'generate:user-a:s1' },
  });
  act(() => result.current.setPrompt('第一个会话的草稿'));

  // The page empties the box for the new session; the new key's own draft comes back.
  act(() => result.current.setPrompt(''));
  rerender({ key: 'generate:user-a:s2' });

  expect(result.current.prompt).toBe('第二个会话的草稿');
  expect(readPromptDraft('generate:user-a:s1')).toBeNull();
});

it('does not save the previous key prompt under a new key', () => {
  const { result, rerender } = renderHook(({ key }) => useDraftedPrompt(key), {
    initialProps: { key: 'generate:user-a:s1' },
  });
  act(() => result.current.setPrompt('只属于第一个会话'));

  rerender({ key: 'generate:user-a:s2' });

  expect(readPromptDraft('generate:user-a:s2')).toBeNull();
  expect(readPromptDraft('generate:user-a:s1')).toBe('只属于第一个会话');
});

it('does nothing while there is no key yet', () => {
  saveDraft('landing:user-a', '登录后的草稿');
  const { result, rerender } = renderHook(({ key }) => useDraftedPrompt(key), {
    initialProps: { key: null as string | null },
  });
  act(() => result.current.setPrompt('临时输入'));
  expect(readPromptDraft('landing:user-a')).toBe('登录后的草稿');

  act(() => result.current.setPrompt(''));
  rerender({ key: 'landing:user-a' });

  expect(result.current.prompt).toBe('登录后的草稿');
});

it('clears the draft on demand, as after sending it', () => {
  const { result } = renderHook(() => useDraftedPrompt('landing:user-a'));
  act(() => result.current.setPrompt('马上要发送'));

  act(() => result.current.clear());

  expect(readPromptDraft('landing:user-a')).toBeNull();
});

it('keeps only the most recent drafts', () => {
  for (let index = 0; index <= PROMPT_DRAFT_LIMIT; index += 1) {
    saveDraft(`generate:user-a:s${index}`, `草稿 ${index}`);
  }

  expect(readPromptDraft('generate:user-a:s0')).toBeNull();
  expect(readPromptDraft(`generate:user-a:s${PROMPT_DRAFT_LIMIT}`)).toBe(
    `草稿 ${PROMPT_DRAFT_LIMIT}`,
  );
});

it('ignores a damaged store instead of failing', () => {
  localStorage.setItem(PROMPT_DRAFTS_STORAGE_KEY, '{not json');

  const { result } = renderHook(() => useDraftedPrompt('landing:user-a'));
  act(() => result.current.setPrompt('照样能存'));

  expect(readPromptDraft('landing:user-a')).toBe('照样能存');
});

it('forgets a sent prompt under every key of the page, not just the current one', () => {
  saveDraft('generate:user-a:new', '已经发出去的提示词');
  saveDraft('generate:user-a:s1', '另一段草稿');
  saveDraft('landing:user-a', '已经发出去的提示词');

  clearPromptDraftsWithText('generate:user-a:', '  已经发出去的提示词 ');

  expect(readPromptDraft('generate:user-a:new')).toBeNull();
  expect(readPromptDraft('generate:user-a:s1')).toBe('另一段草稿');
  expect(readPromptDraft('landing:user-a')).toBe('已经发出去的提示词');
});
