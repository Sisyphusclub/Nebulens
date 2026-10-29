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

describe('landing artwork wall brightness', () => {
  it('keeps the artwork wall bright enough to read as a gallery', () => {
    const plane = rule('.artwork-wall__plane');
    const scrim = rule('.artwork-wall__scrim');

    expect(plane).toContain('opacity: 0.78;');
    // The centre stays a little darker for the headline, but no longer near-black.
    expect(scrim).toContain('rgb(5 6 10 / 0.58) 0%');
    expect(scrim).not.toContain('rgb(5 6 10 / 0.82)');
  });
});

describe('landing page-wide artwork wall', () => {
  it('pins the wall behind the whole page so the lower half is not a flat dark block', () => {
    const wall = rule('.landing-hero .artwork-wall,\n.landing-hero__overlay');
    const overlay = rule('.landing-hero__overlay');
    const skills = rule('.landing-skills');

    expect(wall).toContain('position: fixed;');
    // The overlay no longer fades the hero into a solid page colour.
    expect(overlay).not.toContain('var(--background) 100%');
    // A light scrim keeps the skills heading readable over the wall.
    expect(skills).toContain('rgb(5 6 10 / 0.5) 140px');
  });
});
