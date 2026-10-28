import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { LandingArtworkWall } from '@/components/landing/LandingArtworkWall';

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

let observerCallback: ObserverCallback | null = null;
const originalObserver = globalThis.IntersectionObserver;

beforeEach(() => {
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: class {
      constructor(callback: ObserverCallback) {
        observerCallback = callback;
      }
      disconnect(): void {}
      observe(): void {}
      unobserve(): void {}
    },
  });
});

afterEach(() => {
  observerCallback = null;
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: originalObserver,
  });
});

it('renders decorative columns whose tracks repeat for a seamless loop', () => {
  const { container } = render(<LandingArtworkWall />);
  const wall = container.querySelector('.artwork-wall');
  const columns = container.querySelectorAll('.artwork-wall__column');

  expect(wall).toHaveAttribute('aria-hidden', 'true');
  expect(columns).toHaveLength(8);
  for (const column of columns) {
    const sources = [...column.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    const half = sources.length / 2;
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.slice(0, half)).toEqual(sources.slice(half));
  }
});

it('only references artwork files that ship with the app', () => {
  const { container } = render(<LandingArtworkWall />);
  const sources = new Set(
    [...container.querySelectorAll('img')].map((img) => img.getAttribute('src') ?? ''),
  );

  for (const source of sources) {
    expect(source).toMatch(/^\/media\/hero-wall\/[\w-]+\.jpg$/u);
    expect(existsSync(resolve(process.cwd(), 'public', source.slice(1)))).toBe(true);
  }
});

it('pauses the drift while the hero is scrolled out of view', () => {
  const { container } = render(<LandingArtworkWall />);
  const wall = container.querySelector('.artwork-wall');

  act(() => observerCallback?.([{ isIntersecting: false }]));
  expect(wall).toHaveAttribute('data-paused', 'true');

  act(() => observerCallback?.([{ isIntersecting: true }]));
  expect(wall).not.toHaveAttribute('data-paused');
});
