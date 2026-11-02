import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

it('lets the blurred image overflow the page on every side, past the global image cap', () => {
  const rule = baseStyles.match(/^\.studio-ambient__image\s*\{([^}]+)\}/m)?.[1] ?? '';

  expect(rule).toContain('inset: -15%;');
  expect(rule).toContain('width: 130%;');
  // Capped at 100%, the image stops 15% short of the right edge and splits the page.
  expect(rule).toContain('max-width: none;');
});
