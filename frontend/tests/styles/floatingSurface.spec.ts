import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, it } from 'vitest';

const tokens = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');
const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

const token = (name: string) => tokens.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim();
const channels = (hex: string) =>
  [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));

it('keeps every dialog, menu, popover and toast on one dark charcoal surface', () => {
  expect(token('surface-floating')).toBe(
    'linear-gradient(180deg, var(--bg-floating), var(--bg-floating-end))',
  );
  for (const stop of ['bg-floating', 'bg-floating-end']) {
    const value = token(stop) ?? '';
    expect(value).toMatch(/^#[0-9a-f]{6}$/);
    // A bright slate (the old top stop was rgb(50 54 64)) stood out against the dark workbench.
    expect(Math.max(...channels(value))).toBeLessThanOrEqual(40);
  }
});

it('matches the account popover caret to the top of the floating surface', () => {
  const caret = baseStyles.match(
    /\.landing-account-popover::before\s*\{[^}]*background:\s*([^;]+);/,
  )?.[1];

  expect(caret).toBe('var(--bg-floating)');
});
