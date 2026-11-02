import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { usePromptEnhancer } from '@/hooks/usePromptEnhancer';

const { enhancePrompt, openAuthModal } = vi.hoisted(() => ({
  enhancePrompt: vi.fn<(prompt: string) => Promise<string>>(),
  openAuthModal: vi.fn(),
}));

vi.mock('@/services/api/promptApi', () => ({ enhancePrompt }));
vi.mock('@/hooks/useAuthModal', () => ({ openAuthModal }));

function setup(initial: string, isAuthenticated = true) {
  const notify = vi.fn();
  const hook = renderHook(() => {
    const [prompt, setPrompt] = useState(initial);
    return {
      prompt,
      setPrompt,
      ...usePromptEnhancer({ prompt, setPrompt, isAuthenticated, notify }),
    };
  });
  return { ...hook, notify };
}

beforeEach(() => {
  enhancePrompt.mockReset();
  openAuthModal.mockReset();
});

it('replaces the prompt with the polished one and can undo it', async () => {
  enhancePrompt.mockResolvedValue('雨后霓虹街道，电影级广角构图');
  const { result } = setup(' 雨后街道 ');

  await act(() => result.current.enhance());

  expect(enhancePrompt).toHaveBeenCalledWith('雨后街道');
  expect(result.current.prompt).toBe('雨后霓虹街道，电影级广角构图');
  expect(result.current.canUndo).toBe(true);

  act(() => result.current.undo());
  expect(result.current.prompt).toBe(' 雨后街道 ');
  expect(result.current.canUndo).toBe(false);
});

it('stops offering undo once the polished prompt is edited', async () => {
  enhancePrompt.mockResolvedValue('雨后霓虹街道');
  const { result } = setup('雨后街道');

  await act(() => result.current.enhance());
  act(() => result.current.setPrompt('雨后霓虹街道，加一只猫'));

  expect(result.current.canUndo).toBe(false);
});

it('keeps what the user typed while polishing was running', async () => {
  let resolve: (value: string) => void = () => {};
  enhancePrompt.mockImplementation(
    () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
  );
  const { result, notify } = setup('雨后街道');

  let pending: Promise<void> = Promise.resolve();
  act(() => {
    pending = result.current.enhance();
  });
  expect(result.current.enhancing).toBe(true);
  act(() => result.current.setPrompt('雨后街道，夜景'));
  await act(async () => {
    resolve('雨后霓虹街道');
    await pending;
  });

  expect(result.current.prompt).toBe('雨后街道，夜景');
  expect(result.current.enhancing).toBe(false);
  expect(notify).toHaveBeenCalledWith('提示词已修改，没有应用润色结果。');
});

it('asks a signed-out user to log in first', async () => {
  const { result } = setup('雨后街道', false);

  await act(() => result.current.enhance());

  expect(openAuthModal).toHaveBeenCalledTimes(1);
  expect(enhancePrompt).not.toHaveBeenCalled();
});

it('reports a failed polish and leaves the prompt alone', async () => {
  enhancePrompt.mockRejectedValue(new Error('润色结果改动了引号中的文字，已保留原提示词。'));
  const { result, notify } = setup('标题“夏日”');

  await act(() => result.current.enhance());

  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith('润色结果改动了引号中的文字，已保留原提示词。', 'error'),
  );
  expect(result.current.prompt).toBe('标题“夏日”');
});
