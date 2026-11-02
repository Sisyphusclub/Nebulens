import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return baseStyles.match(new RegExp(`^${escaped}\\s*\\{([^}]+)\\}`, 'm'))?.[1] ?? '';
}

describe('landing hero layout', () => {
  it('sizes the hero to its content so the skill deck follows right after the composer', () => {
    const hero = rule('.landing-hero');
    const content = rule('.landing-hero__content');

    expect(hero).not.toContain('height: 100svh;');
    expect(hero).not.toContain('min-height: 760px;');
    expect(hero).toContain('padding-bottom: 40px;');
    // In flow, not absolutely placed, so its height drives the hero's height.
    expect(content).toContain('position: relative;');
    expect(content).not.toMatch(/^\s*top:/m);
  });
});

describe('landing nebula backdrop', () => {
  it('pins the video and its overlay behind the whole page', () => {
    expect(rule('.landing-hero__video,\n.landing-hero__overlay')).toContain('position: fixed;');
    expect(rule('.landing-hero__video')).toContain('object-fit: cover;');
  });

  it('only shades the edges, keeping the area around the composer bright', () => {
    const overlay =
      baseStyles.match(/\.landing-hero__overlay\s*\{\s*(background:[^}]+)\}/)?.[1] ?? '';

    expect(overlay).toContain('transparent 88%');
    // No even veil over the whole video any more.
    expect(overlay).not.toContain('rgb(5 6 10 / 0.3)');
    expect(rule('.landing-composer-anchor::before')).toContain('radial-gradient(');
  });
});
