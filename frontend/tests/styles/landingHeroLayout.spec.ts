import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return baseStyles.match(new RegExp(`^${escaped}\\s*\\{([^}]+)\\}`, 'm'))?.[1] ?? '';
}

describe('landing hero layout', () => {
  it('sizes the hero to its content so the skills follow right after it', () => {
    const hero = rule('.landing-hero');
    const content = rule('.landing-hero__content');

    expect(hero).not.toContain('height: 100svh;');
    expect(hero).not.toContain('min-height: 760px;');
    expect(hero).toContain('padding-bottom: clamp(56px, 8svh, 96px);');
    // In flow, not absolutely placed, so its height drives the hero's height.
    expect(content).toContain('position: relative;');
    expect(content).not.toMatch(/^\s*top:/m);
  });
});
