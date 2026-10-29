import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');
const emptyStateRules = [...baseStyles.matchAll(/\.generation-empty-state\s*\{([^}]+)\}/g)].map(
  (match) => match[1] ?? '',
);

it('lets the empty state fill the space above the composer instead of guessing its height', () => {
  const [base] = emptyStateRules;

  // In flow inside the flex-column console, so a taller create bar (recommendations,
  // the AI insight bar) pushes the empty state up rather than covering it.
  expect(base).toContain('position: static;');
  expect(base).toContain('flex: 1 1 auto;');
  for (const rule of emptyStateRules) {
    expect(rule).not.toMatch(/^\s*(top|right|bottom|left):/m);
  }
});
