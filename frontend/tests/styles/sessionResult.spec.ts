import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

it('anchors result actions to the image rather than the whole card', () => {
  const media = baseStyles.match(/^\.session-result__media\s*\{([^}]+)\}/m)?.[1] ?? '';

  expect(media).toContain('position: relative;');
});
