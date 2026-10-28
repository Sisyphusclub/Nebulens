import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { LandingSceneShortcuts } from '@/components/landing/LandingSceneShortcuts';
import { LANDING_SCENES } from '@/data/landingScenes';
import { ASPECT_CHOICES } from '@/types/image';

it('offers each scene as a labelled shortcut and hands the chosen scene back', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<LandingSceneShortcuts onSelect={onSelect} />);

  const group = screen.getByRole('group', { name: '从场景开始' });
  for (const scene of LANDING_SCENES) {
    expect(group).toContainElement(screen.getByRole('button', { name: scene.label }));
  }

  await user.click(screen.getByRole('button', { name: '活动海报' }));
  expect(onSelect).toHaveBeenCalledWith(LANDING_SCENES.find((scene) => scene.label === '活动海报'));
});

it('only ships scenes with a supported ratio and quoted text to render', () => {
  expect(LANDING_SCENES.length).toBeGreaterThanOrEqual(5);
  for (const scene of LANDING_SCENES) {
    expect(ASPECT_CHOICES).toContain(scene.aspect);
    expect(scene.prompt).toMatch(/“[^”]+”/u);
  }
});
