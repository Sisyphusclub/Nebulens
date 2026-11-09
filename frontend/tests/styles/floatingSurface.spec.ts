import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, it } from 'vitest';

const tokens = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');
const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

it('keeps every dialog, menu, popover and toast on one dark charcoal surface', () => {
  const surface = tokens.match(/--surface-floating:\s*([^;]+);/)?.[1] ?? '';
  const stops = [...surface.matchAll(/rgb\((\d+) (\d+) (\d+)/g)].map((match) =>
    match.slice(1).map(Number),
  );

  expect(stops.length).toBeGreaterThan(0);
  // A bright slate (the old top stop was rgb(50 54 64)) stood out against the dark workbench.
  for (const channels of stops) expect(Math.max(...channels)).toBeLessThanOrEqual(40);
});

it('matches the account popover caret to the top of the floating surface', () => {
  const top = tokens.match(/--surface-floating:\s*linear-gradient\(180deg,\s*(rgb\([^)]+\))/)?.[1];
  const caret = baseStyles.match(
    /\.landing-account-popover::before\s*\{[^}]*background:\s*([^;]+);/,
  )?.[1];

  expect(top).toBeDefined();
  expect(caret).toBe(top);
});
