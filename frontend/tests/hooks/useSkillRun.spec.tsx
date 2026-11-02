import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { useSkillRun } from '@/hooks/useSkillRun';
import type { GenerationSettingsSnapshot, ImageRecord, TextCheckResult } from '@/types/image';
import type { FeedItem } from '@/utils/generationFeed';

function settings(prompt: string): GenerationSettingsSnapshot {
  return {
    prompt,
    model: 'gpt-image-2',
    count: 1,
    aspectRatio: '1:1',
    resolution: 'standard',
    isPublic: false,
    referenceIds: [],
  };
}

function feedItem(
  batchId: string,
  analysisStatus: ImageRecord['analysisStatus'],
  textCheck?: TextCheckResult,
): FeedItem {
  return {
    id: batchId,
    createdAt: '2026-10-29T08:00:00.000Z',
    settings: settings('主图'),
    entries: [
      {
        record: {
          id: `${batchId}.png`,
          batchId,
          createdAt: '2026-10-29T08:00:00.000Z',
          prompt: '主图',
          model: 'gpt-image-2',
          width: 1024,
          height: 1024,
          isPublic: false,
          ...(analysisStatus === undefined ? {} : { analysisStatus }),
          ...(textCheck === undefined ? {} : { textCheck }),
        },
        imageUrl: `/${batchId}.png`,
      },
    ],
  };
}

const RUN = {
  skillLabel: '电商主图',
  steps: [
    { label: '主图', settings: settings('主图提示词') },
    { label: '卖点图', settings: settings('卖点图提示词') },
  ],
};

function setup(runGeneration: (s: GenerationSettingsSnapshot) => Promise<string | undefined>) {
  const fixText = vi.fn(() => Promise.resolve());
  const notify = vi.fn();
  const hook = renderHook(
    (props: { isGenerating: boolean; feed: FeedItem[] }) =>
      useSkillRun({ ...props, runGeneration, fixText, notify }),
    { initialProps: { isGenerating: false, feed: [] as FeedItem[] } },
  );
  return { ...hook, fixText, notify };
}

it('generates the images one at a time, each after the previous one finishes', async () => {
  const releases: Array<(batchId: string) => void> = [];
  const runGeneration = vi.fn(
    () => new Promise<string | undefined>((resolve) => releases.push(resolve)),
  );
  const { result, notify } = setup(runGeneration);

  act(() => result.current.start(RUN));

  await waitFor(() => expect(runGeneration).toHaveBeenCalledTimes(1));
  expect(runGeneration).toHaveBeenLastCalledWith(settings('主图提示词'));
  expect(notify).toHaveBeenCalledWith('「电商主图」会依次生成 2 张图，并自动检查文字。');
  expect(result.current.isRunning).toBe(true);

  await act(() => {
    releases[0]?.('batch-main');
    return Promise.resolve();
  });
  await waitFor(() => expect(runGeneration).toHaveBeenCalledTimes(2));
  expect(runGeneration).toHaveBeenLastCalledWith(settings('卖点图提示词'));

  await act(() => {
    releases[1]?.('batch-points');
    return Promise.resolve();
  });
  await waitFor(() => expect(result.current.isRunning).toBe(false));
});

it('waits while another generation is in flight', async () => {
  const runGeneration = vi.fn(() => Promise.resolve<string | undefined>('batch-main'));
  const { result, rerender } = setup(runGeneration);
  rerender({ isGenerating: true, feed: [] });

  act(() => result.current.start(RUN));
  await act(async () => Promise.resolve());
  expect(runGeneration).not.toHaveBeenCalled();

  rerender({ isGenerating: false, feed: [] });
  await waitFor(() => expect(runGeneration).toHaveBeenCalledTimes(2));
});

it('redraws wrong text once, after the vision check has read the image', async () => {
  const runGeneration = vi.fn(() => Promise.resolve<string | undefined>('batch-main'));
  const { result, rerender, fixText, notify } = setup(runGeneration);

  act(() => result.current.start({ skillLabel: '电商主图', steps: [RUN.steps[0]!] }));
  await waitFor(() => expect(result.current.isRunning).toBe(false));

  // Right after generating, the image has no analysis status until history is re-fetched.
  rerender({ isGenerating: false, feed: [feedItem('batch-main', undefined)] });
  rerender({ isGenerating: false, feed: [feedItem('batch-main', 'pending')] });
  expect(fixText).not.toHaveBeenCalled();

  const wrong: TextCheckResult = {
    status: 'issues',
    segments: [{ text: '¥199', found: '¥169', ok: false }],
  };
  const checked = feedItem('batch-main', 'done', wrong);
  rerender({ isGenerating: false, feed: [checked] });

  await waitFor(() => expect(fixText).toHaveBeenCalledWith(checked, checked.entries[0]));
  expect(notify).toHaveBeenLastCalledWith('「主图」的文字有误，正在自动重画。');

  rerender({ isGenerating: false, feed: [{ ...checked }] });
  await act(async () => Promise.resolve());
  expect(fixText).toHaveBeenCalledTimes(1);
});

it('still redraws when the check landed before the image was registered', async () => {
  const wrong: TextCheckResult = {
    status: 'issues',
    segments: [{ text: '¥199', found: null, ok: false }],
  };
  const checked = feedItem('batch-main', 'done', wrong);
  const runGeneration = vi.fn(() => Promise.resolve<string | undefined>('batch-main'));
  const { result, rerender, fixText } = setup(runGeneration);
  rerender({ isGenerating: false, feed: [checked] });

  act(() => result.current.start({ skillLabel: '电商主图', steps: [RUN.steps[0]!] }));

  await waitFor(() => expect(fixText).toHaveBeenCalledWith(checked, checked.entries[0]));
});

it('leaves images with correct text alone', async () => {
  const runGeneration = vi.fn(() => Promise.resolve<string | undefined>('batch-main'));
  const { result, rerender, fixText } = setup(runGeneration);

  act(() => result.current.start({ skillLabel: '电商主图', steps: [RUN.steps[0]!] }));
  await waitFor(() => expect(result.current.isRunning).toBe(false));
  rerender({
    isGenerating: false,
    feed: [feedItem('batch-main', 'done', { status: 'passed', segments: [] })],
  });
  await act(async () => Promise.resolve());

  expect(fixText).not.toHaveBeenCalled();
});

it('drops the images not yet started when cancelled', async () => {
  const releases: Array<(batchId: string | undefined) => void> = [];
  const runGeneration = vi.fn(
    () => new Promise<string | undefined>((resolve) => releases.push(resolve)),
  );
  const { result } = setup(runGeneration);

  act(() => result.current.start(RUN));
  await waitFor(() => expect(runGeneration).toHaveBeenCalledTimes(1));
  act(() => result.current.cancel());
  await act(() => {
    releases[0]?.(undefined);
    return Promise.resolve();
  });

  await waitFor(() => expect(result.current.isRunning).toBe(false));
  expect(runGeneration).toHaveBeenCalledTimes(1);
});
