import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return baseStyles.match(new RegExp(`^${escaped}\\s*\\{([^}]+)\\}`, 'm'))?.[1] ?? '';
}

it.each(['.session-result__actions', '.template-tile__actions'])(
  'keeps %s in sight before hovering, so people can find them',
  (selector) => {
    const body = rule(selector);

    expect(body).toContain('opacity: 0.72;');
    expect(body).not.toContain('opacity: 0;');
  },
);
