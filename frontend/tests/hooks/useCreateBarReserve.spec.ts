import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useCreateBarReserve } from '@/hooks/useCreateBarReserve';

let barTop = 600;
let host: HTMLDivElement;
let bar: HTMLDivElement;

beforeEach(() => {
  host = document.createElement('div');
  host.className = 'generation-console';
  bar = document.createElement('div');
  host.append(bar);
  document.body.append(host);
  barTop = 600;
  vi.spyOn(bar, 'getBoundingClientRect').mockImplementation(() => ({ top: barTop }) as DOMRect);
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
});

afterEach(() => {
  host.remove();
  vi.restoreAllMocks();
});

function setScroll(scrollY: number, scrollHeight: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: scrollY });
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
  });
}

it('reserves the space the fixed create bar covers, plus a gap', () => {
  renderHook(() => useCreateBarReserve({ current: bar }, true));

  // 800px viewport - 600px bar top + 40px gap.
  expect(host.style.getPropertyValue('--studio-create-bar-reserve')).toBe('240px');
});

it('follows a growing bar when the user is at the bottom of the feed', () => {
  const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
  setScroll(1200, 2000);
  renderHook(() => useCreateBarReserve({ current: bar }, true));

  barTop = 450;
  window.dispatchEvent(new Event('resize'));

  expect(host.style.getPropertyValue('--studio-create-bar-reserve')).toBe('390px');
  expect(scrollBy).toHaveBeenCalledWith({ top: 150 });
});

it('leaves the scroll position alone when the user is reading older results', () => {
  const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
  setScroll(200, 2000);
  renderHook(() => useCreateBarReserve({ current: bar }, true));

  barTop = 450;
  window.dispatchEvent(new Event('resize'));

  expect(host.style.getPropertyValue('--studio-create-bar-reserve')).toBe('390px');
  expect(scrollBy).not.toHaveBeenCalled();
});

it('does nothing while the bar is not pinned and clears the reserve afterwards', () => {
  const { rerender, unmount } = renderHook(
    ({ active }) => useCreateBarReserve({ current: bar }, active),
    { initialProps: { active: false } },
  );
  expect(host.style.getPropertyValue('--studio-create-bar-reserve')).toBe('');

  rerender({ active: true });
  expect(host.style.getPropertyValue('--studio-create-bar-reserve')).toBe('240px');
  unmount();
  expect(host.style.getPropertyValue('--studio-create-bar-reserve')).toBe('');
});
