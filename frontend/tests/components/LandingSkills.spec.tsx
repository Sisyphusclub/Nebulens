import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { LandingSkillDeck } from '@/components/landing/LandingSkills';
import { EVERYDAY_SKILLS, LANDING_SKILLS } from '@/data/landingSkills';

afterEach(() => {
  vi.useRealTimers();
});

it('shows every skill as a tile with its tagline and example', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<LandingSkillDeck onSelect={onSelect} />);

  const deck = screen.getByRole('region', { name: '技能' });
  for (const skill of EVERYDAY_SKILLS) {
    const tile = within(deck).getByRole('button', { name: `使用技能：${skill.label}` });
    expect(tile).toHaveTextContent(skill.tagline);
    expect(tile.querySelector('img')).toHaveAttribute('src', skill.image);
  }
  await user.click(within(deck).getByRole('button', { name: '使用技能：产线场景' }));
  expect(onSelect).toHaveBeenCalledWith(LANDING_SKILLS.find((skill) => skill.id === 'factory'));
});

it('features one skill at a time, picked by its dot or in turn every few seconds', () => {
  vi.useFakeTimers();
  const onSelect = vi.fn();
  render(<LandingSkillDeck onSelect={onSelect} />);
  const [first, second, third] = EVERYDAY_SKILLS;

  fireEvent.click(screen.getByRole('button', { name: `立即使用：${first!.label}` }));
  expect(onSelect).toHaveBeenCalledWith(first);

  act(() => {
    vi.advanceTimersByTime(5000);
  });
  expect(screen.getByRole('button', { name: `立即使用：${second!.label}` })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: `推荐：${second!.label}` })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  fireEvent.click(screen.getByRole('button', { name: `推荐：${third!.label}` }));
  expect(screen.getByRole('button', { name: `立即使用：${third!.label}` })).toBeInTheDocument();
});

it('holds the featured skill while the pointer rests on it', () => {
  vi.useFakeTimers();
  render(<LandingSkillDeck onSelect={vi.fn()} />);
  const [first] = EVERYDAY_SKILLS;
  const cta = screen.getByRole('button', { name: `立即使用：${first!.label}` });

  fireEvent.mouseEnter(cta.closest('.landing-deck__feature')!);
  act(() => {
    vi.advanceTimersByTime(15000);
  });

  expect(screen.getByRole('button', { name: `立即使用：${first!.label}` })).toBeInTheDocument();
});

it('only ships skills with a brief example and an example image on disk', () => {
  expect(LANDING_SKILLS.length).toBe(12);
  expect(EVERYDAY_SKILLS.length).toBe(8);
  for (const skill of LANDING_SKILLS) {
    expect(skill.briefExample.length).toBeGreaterThan(5);
    // The tiles have room for one short line.
    expect(skill.tagline.length).toBeLessThanOrEqual(10);
    expect(existsSync(resolve(process.cwd(), 'public', skill.image.slice(1)))).toBe(true);
  }
});
