import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, it } from 'vitest';

import { LANDING_SKILLS } from '@/data/landingSkills';

it('only ships skills with a brief example and an example image on disk', () => {
  expect(LANDING_SKILLS.length).toBe(14);
  expect(LANDING_SKILLS.filter((skill) => skill.everyday).length).toBe(12);
  for (const skill of LANDING_SKILLS) {
    expect(skill.briefExample.length).toBeGreaterThan(5);
    // The "/" menu has room for one short line beside each skill.
    expect(skill.tagline.length).toBeLessThanOrEqual(10);
    expect(existsSync(resolve(process.cwd(), 'public', skill.image.slice(1)))).toBe(true);
  }
});
