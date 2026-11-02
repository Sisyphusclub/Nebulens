import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

it('leaves the -webkit-backdrop-filter prefix to the build', () => {
  // The build adds the Safari prefix itself. A hand-written prefix after the
  // standard property makes the minifier keep only the prefixed one, which
  // Chromium ignores, so the glass silently loses its blur in production.
  expect(baseStyles).not.toContain('-webkit-backdrop-filter');
});
