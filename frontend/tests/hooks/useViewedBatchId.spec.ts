import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useReleaseJumpTarget, useViewedBatchId } from '@/hooks/useViewedBatchId';

function addBatch(id: string, top: number, bottom: number) {
  const element = document.createElement('article');
  element.dataset.generationBatch = id;
  element.getBoundingClientRect = () => new DOMRect(0, top, 100, bottom - top);
  document.body.append(element);
  return element;
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('follows the batch at the reading position as the page scrolls', () => {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('innerHeight', 1000);
  const first = addBatch('first', 0, 800);
  const second = addBatch('second', 900, 1700);

  const { result } = renderHook(() => useViewedBatchId(2));
  expect(result.current).toBe('first');

  first.getBoundingClientRect = () => new DOMRect(0, -900, 100, 800);
  second.getBoundingClientRect = () => new DOMRect(0, 0, 100, 800);
  act(() => {
    window.dispatchEvent(new Event('scroll'));
  });

  expect(result.current).toBe('second');
  vi.unstubAllGlobals();
});

it('takes the nearest batch when the reading position falls in the gap between two', () => {
  vi.stubGlobal('innerHeight', 1000);
  addBatch('far', 0, 100);
  addBatch('near', 500, 900);

  const { result } = renderHook(() => useViewedBatchId(2));

  expect(result.current).toBe('near');
  vi.unstubAllGlobals();
});

it('releases a jump target once the scroll settles, not while it is still moving', () => {
  vi.useFakeTimers();
  const release = vi.fn();
  renderHook(() => useReleaseJumpTarget('batch', release));

  window.dispatchEvent(new Event('scroll'));
  vi.advanceTimersByTime(100);
  window.dispatchEvent(new Event('scroll'));
  vi.advanceTimersByTime(100);
  expect(release).not.toHaveBeenCalled();

  vi.advanceTimersByTime(100);
  expect(release).toHaveBeenCalledOnce();
  vi.useRealTimers();
});

it('releases a jump target right away when the reader scrolls by hand', () => {
  const release = vi.fn();
  renderHook(() => useReleaseJumpTarget('batch', release));

  window.dispatchEvent(new Event('wheel'));

  expect(release).toHaveBeenCalledOnce();
});

it('keeps a jump target until something scrolls, and ignores scrolling without one', () => {
  const release = vi.fn();
  const { rerender } = renderHook(
    ({ target }: { target: string | null }) => useReleaseJumpTarget(target, release),
    { initialProps: { target: null as string | null } },
  );

  window.dispatchEvent(new Event('wheel'));
  expect(release).not.toHaveBeenCalled();

  rerender({ target: 'batch' });
  expect(release).not.toHaveBeenCalled();
});

it('has no batch to report on an empty page', () => {
  const { result } = renderHook(() => useViewedBatchId(0));

  expect(result.current).toBeNull();
});
