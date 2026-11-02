import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi, type MockInstance } from 'vitest';

import {
  HERO_BACKDROP_POSTER,
  HERO_BACKDROP_VIDEO,
  LandingHeroBackdrop,
} from '@/components/landing/LandingHeroBackdrop';

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

let observerCallback: ObserverCallback | null = null;
let playSpy: MockInstance<HTMLMediaElement['play']>;
let pauseSpy: MockInstance<HTMLMediaElement['pause']>;
const originalObserver = globalThis.IntersectionObserver;

function stubNavigator(values: Record<string, unknown>) {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(navigator, key, { configurable: true, value });
  }
}

beforeEach(() => {
  stubNavigator({ hardwareConcurrency: 8, deviceMemory: 8, connection: undefined });
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
  playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  observerCallback = null;
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: originalObserver,
  });
});

it('plays the light hero video with its poster on capable devices', () => {
  const { container } = render(<LandingHeroBackdrop reducedMotion={false} />);
  const video = container.querySelector('video.landing-hero__video');

  expect(video).toHaveAttribute('src', HERO_BACKDROP_VIDEO);
  expect(video).toHaveAttribute('poster', HERO_BACKDROP_POSTER);
  expect(container.querySelector('img')).not.toBeInTheDocument();
});

it('shows only the static poster on low-end devices', () => {
  stubNavigator({ hardwareConcurrency: 2 });
  const { container } = render(<LandingHeroBackdrop reducedMotion={false} />);

  expect(container.querySelector('video')).not.toBeInTheDocument();
  expect(container.querySelector('img.landing-hero__video')).toHaveAttribute(
    'src',
    HERO_BACKDROP_POSTER,
  );
});

it('shows only the static poster when data saver or reduced motion is on', () => {
  stubNavigator({ connection: { saveData: true } });
  const { container, rerender } = render(<LandingHeroBackdrop reducedMotion={false} />);
  expect(container.querySelector('video')).not.toBeInTheDocument();

  stubNavigator({ connection: undefined });
  rerender(<LandingHeroBackdrop reducedMotion />);
  expect(container.querySelector('video')).not.toBeInTheDocument();
  expect(container.querySelector('img.landing-hero__video')).toBeInTheDocument();
});

it('falls back to the poster when the video fails to load', () => {
  const { container } = render(<LandingHeroBackdrop reducedMotion={false} />);
  fireEvent.error(container.querySelector('video')!);

  expect(container.querySelector('video')).not.toBeInTheDocument();
  expect(container.querySelector('img.landing-hero__video')).toBeInTheDocument();
});

it('pauses while scrolled out of view and resumes when visible again', () => {
  render(<LandingHeroBackdrop reducedMotion={false} />);
  playSpy.mockClear();

  act(() => observerCallback?.([{ isIntersecting: false }]));
  expect(pauseSpy).toHaveBeenCalledTimes(1);

  act(() => observerCallback?.([{ isIntersecting: true }]));
  expect(playSpy).toHaveBeenCalledTimes(1);
});
