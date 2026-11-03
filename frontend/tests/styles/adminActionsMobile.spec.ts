import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

it('puts the actions label on its own row on phones, so the two buttons share the next one', () => {
  // Each mobile cell gets a "操作"-style label from ::before; in the two-column actions grid it
  // used to take the first cell and push the second button onto a row of its own.
  expect(baseStyles).toMatch(/\.admin-page \.admin-actions::before\s*\{\s*grid-column: 1 \/ -1;/);
});
