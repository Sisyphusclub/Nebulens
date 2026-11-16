import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return baseStyles.match(new RegExp(`^${escaped}\\s*\\{([^}]+)\\}`, 'm'))?.[1] ?? '';
}

it('spaces the similar work evenly: the same padding all round, the cards as far apart', () => {
  // It was 14px on the left and 10px on the right, with the cards only 8px apart.
  expect(rule('.landing-recommendations')).toContain('padding: 12px;');
  const list = rule('.landing-recommendations__list');
  expect(list).toContain('gap: 12px;');
  // Fit rather than fill: two cards share the row instead of leaving an empty third column.
  expect(list).toContain('grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));');
  // The picture sits inside its card rather than against the edge.
  expect(rule('.landing-recommendations__item')).toContain('padding: 8px;');
});

it('lets the generate page’s compact row fill its width with however many cards it has', () => {
  expect(rule('.generation-inspiration .landing-recommendations__list')).toContain(
    'grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));',
  );
});
