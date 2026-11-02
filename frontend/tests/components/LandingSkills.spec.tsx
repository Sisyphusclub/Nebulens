import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { LandingSkillDeck } from '@/components/landing/LandingSkills';
import { EVERYDAY_SKILLS, LANDING_SKILLS } from '@/data/landingSkills';

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
  await user.click(within(deck).getByRole('button', { name: '使用技能：角色设定' }));
  expect(onSelect).toHaveBeenCalledWith(LANDING_SKILLS.find((skill) => skill.id === 'character'));
});

it('keeps the company skills on the page beside the creator ones', () => {
  render(<LandingSkillDeck onSelect={vi.fn()} />);

  for (const label of ['汇报封面', '架构图', '方案主视觉', '产线场景']) {
    expect(screen.getByRole('button', { name: `使用技能：${label}` })).toBeInTheDocument();
  }
});

it('shows each skill only once, with no separate featured card', () => {
  render(<LandingSkillDeck onSelect={vi.fn()} />);

  const deck = screen.getByRole('region', { name: '技能' });
  expect(within(deck).getAllByRole('button')).toHaveLength(EVERYDAY_SKILLS.length);
  expect(within(deck).queryByText('精选技能')).not.toBeInTheDocument();
});

it('only ships skills with a brief example and an example image on disk', () => {
  expect(LANDING_SKILLS.length).toBe(14);
  expect(EVERYDAY_SKILLS.length).toBe(12);
  for (const skill of LANDING_SKILLS) {
    expect(skill.briefExample.length).toBeGreaterThan(5);
    // The tiles have room for one short line.
    expect(skill.tagline.length).toBeLessThanOrEqual(10);
    expect(existsSync(resolve(process.cwd(), 'public', skill.image.slice(1)))).toBe(true);
  }
});
