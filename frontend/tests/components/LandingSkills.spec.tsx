import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { LandingSkillCapsules, LandingSkillGallery } from '@/components/landing/LandingSkills';
import { LANDING_SKILLS, QUICK_SKILL_COUNT } from '@/data/landingSkills';
import { ASPECT_CHOICES } from '@/types/image';

it('offers the most used skills as capsules and hands back the chosen one', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<LandingSkillCapsules onSelect={onSelect} />);

  const group = screen.getByRole('group', { name: '常用技能' });
  expect(within(group).getAllByRole('button')).toHaveLength(QUICK_SKILL_COUNT);
  await user.click(within(group).getByRole('button', { name: '电商主图' }));
  expect(onSelect).toHaveBeenCalledWith(LANDING_SKILLS.find((skill) => skill.id === 'ecommerce'));
});

it('shows every skill as a card with an example, a description and a way to start', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<LandingSkillGallery onSelect={onSelect} />);

  const gallery = screen.getByRole('region', { name: '技能' });
  for (const skill of LANDING_SKILLS) {
    const card = within(gallery).getByRole('button', { name: `使用技能：${skill.label}` });
    expect(card).toHaveTextContent(skill.description);
    expect(card.querySelector('img')).toHaveAttribute('src', skill.image);
  }
  await user.click(within(gallery).getByRole('button', { name: '使用技能：风格重绘' }));
  expect(onSelect).toHaveBeenCalledWith(LANDING_SKILLS.find((skill) => skill.id === 'restyle'));
});

it('only ships skills with a supported ratio, a prompt and an example image on disk', () => {
  expect(LANDING_SKILLS.length).toBeGreaterThanOrEqual(QUICK_SKILL_COUNT);
  for (const skill of LANDING_SKILLS) {
    expect(ASPECT_CHOICES).toContain(skill.aspect);
    expect(skill.prompt.length).toBeGreaterThan(10);
    expect(existsSync(resolve(process.cwd(), 'public', skill.image.slice(1)))).toBe(true);
  }
});
