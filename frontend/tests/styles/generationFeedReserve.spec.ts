import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

it('pads the result feed by the measured create bar height at every breakpoint', () => {
  const paddings = [
    ...baseStyles.matchAll(/\.generation-console\.has-results\s*\{([^}]*)\}/g),
  ].flatMap((match) =>
    [...(match[1] ?? '').matchAll(/padding-bottom:\s*([^;]+);/g)].map((m) => m[1]),
  );

  expect(paddings.length).toBeGreaterThan(0);
  for (const padding of paddings) {
    expect(padding).toMatch(/^var\(--studio-create-bar-reserve, \d+px\)$/);
  }
});
