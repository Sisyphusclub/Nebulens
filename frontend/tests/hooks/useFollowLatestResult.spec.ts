import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useFollowLatestResult } from '@/hooks/useFollowLatestResult';

let feedHeight = 1000;
let feed: HTMLDivElement;
let resize: (() => void) | null = null;
const originalObserver = globalThis.ResizeObserver;

beforeEach(() => {
  feed = document.createElement('div');
  document.body.append(feed);
  feedHeight = 1000;
  vi.spyOn(feed, 'getBoundingClientRect').mockImplementation(
    () => ({ height: feedHeight }) as DOMRect,
  );
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe(): void {}
      disconnect(): void {}
    },
  });
});

afterEach(() => {
  feed.remove();
  resize = null;
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: originalObserver,
  });
});

function setScroll(scrollY: number, scrollHeight: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: scrollY });
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
  });
}

it('scrolls along when the latest result grows while the reader is at the end', () => {
  const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
  setScroll(1200, 2000);
  renderHook(() => useFollowLatestResult({ current: feed }, true));

  // The image arrives and the text check appears under it.
  feedHeight = 1090;
  resize?.();

  expect(scrollBy).toHaveBeenCalledWith({ top: 90 });
});

it('leaves a reader who scrolled up to older results where they are', () => {
  const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
  setScroll(1200, 2000);
  renderHook(() => useFollowLatestResult({ current: feed }, true));

  setScroll(300, 2000);
  window.dispatchEvent(new Event('scroll'));
  feedHeight = 1090;
  resize?.();

  expect(scrollBy).not.toHaveBeenCalled();
});

it('never scrolls when the feed shrinks or while there are no results', () => {
  const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
  setScroll(1200, 2000);
  const { rerender } = renderHook(
    ({ active }) => useFollowLatestResult({ current: feed }, active),
    {
      initialProps: { active: false },
    },
  );
  expect(resize).toBeNull();

  rerender({ active: true });
  feedHeight = 900;
  resize?.();

  expect(scrollBy).not.toHaveBeenCalled();
});
