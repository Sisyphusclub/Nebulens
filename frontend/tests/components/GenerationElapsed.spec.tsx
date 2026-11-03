import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { GenerationElapsed } from '@/components/generation/GenerationElapsed';

afterEach(() => {
  vi.useRealTimers();
});

it('counts up while an image is being made, so a long wait does not look stuck', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-03T08:00:00.000Z'));
  render(<GenerationElapsed startedAt="2026-11-03T08:00:00.000Z" />);

  expect(screen.getByText('已等待 0 秒')).toBeInTheDocument();
  act(() => {
    vi.advanceTimersByTime(42_000);
  });
  expect(screen.getByText('已等待 42 秒')).toBeInTheDocument();
  act(() => {
    vi.advanceTimersByTime(83_000);
  });
  expect(screen.getByText('已等待 2 分 5 秒')).toBeInTheDocument();
});
