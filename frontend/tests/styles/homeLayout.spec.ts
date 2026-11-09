import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return baseStyles.match(new RegExp(`^${escaped}\\s*\\{([^}]+)\\}`, 'm'))?.[1] ?? '';
}

describe('home layout', () => {
  it('starts after the rail and keeps no artwork backdrop', () => {
    expect(rule('.home-page')).toContain(
      'padding: 0 var(--home-gutter) 72px calc(var(--workspace-sidebar-rail) + var(--home-gutter));',
    );
    expect(baseStyles).not.toContain('.landing-hero__video');
    expect(rule('.home-hero .landing-composer-anchor::before')).toContain('display: none;');
  });

  it('puts the banner beside two rows of tool cards that scroll sideways', () => {
    expect(rule('.home-tools')).toContain(
      'grid-template-columns: clamp(280px, 24vw, 400px) minmax(0, 1fr);',
    );
    const grid = rule('.landing-deck__grid');
    expect(grid).toContain('grid-auto-flow: column;');
    expect(grid).toContain('grid-template-rows: repeat(2, 101px);');
    expect(rule('.landing-deck__scroller')).toContain('overflow-x: auto;');
    // A slice of the next column always shows.
    expect(grid).toContain('grid-auto-columns: max(270px, calc((100% - 40px) / 4.4));');
  });

  it('lays the inspiration feed out in rows of four wide cards', () => {
    expect(rule('.home-feed__grid')).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));');
    expect(rule('.home-feed__media')).toContain('aspect-ratio: 4 / 3;');
  });

  it('stacks the banner above the tool cards on narrow windows', () => {
    expect(baseStyles).toMatch(
      /@media \(max-width: 1240px\)\s*\{\s*\.home-tools\s*\{\s*grid-template-columns: minmax\(0, 1fr\);/,
    );
  });
});

describe('home tool cards on hover', () => {
  it('only changes colour, so the row never jumps under the pointer', () => {
    const hover =
      baseStyles.match(/\.landing-deck \.landing-deck__tile:hover[^{]*\{([^}]+)\}/)?.[1] ?? '';

    expect(hover).toContain('background:');
    expect(hover).not.toContain('transform');
  });
});

describe('flat workbench sidebar', () => {
  it('lies flush against the window edge while expanded', () => {
    expect(baseStyles).toMatch(
      /\.group\[data-state='expanded'\] \.landing-sidebar \{\s*padding: 0;\s*\}/,
    );
    expect(baseStyles).toMatch(
      /\.group\[data-state='expanded'\] \.landing-sidebar \[data-sidebar='sidebar'\] \{[^}]*border-radius: 0;/,
    );
  });
});
