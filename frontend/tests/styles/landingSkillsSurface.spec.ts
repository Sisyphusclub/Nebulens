import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return baseStyles.match(new RegExp(`^${escaped}\\s*\\{([^}]+)\\}`, 'm'))?.[1] ?? '';
}

describe('landing skill deck', () => {
  it('spans the full page width beside the rail instead of a narrow centred column', () => {
    const grid = rule('.landing-deck__grid');

    expect(grid).toContain('max-width: 1760px;');
    // A feature card on the left, then twelve skills in three rows of four.
    expect(grid).toContain(
      'grid-template-columns: minmax(280px, 1.45fr) repeat(4, minmax(0, 1fr));',
    );
    expect(grid).toContain('grid-auto-rows: 84px;');
    expect(rule('.landing-feature')).toContain('grid-row: span 3;');
  });

  it('draws each tile as compact glass with the example on the left', () => {
    const tile = rule('.landing-deck .landing-deck__tile');

    expect(tile).toContain('height: auto;');
    expect(tile).toContain('justify-content: flex-start;');
    expect(tile).toContain('background: rgb(36 40 52 / 0.94);');
    expect(rule('.landing-deck__tile img')).toContain('width: 66px;');
    // One short line under the name, like Kling's tiles.
    expect(rule('.landing-deck__tile-description')).toContain('white-space: nowrap;');
  });
});

describe('landing skill deck beside the rail on narrow windows', () => {
  it('drops to three columns with the feature card across the top', () => {
    expect(baseStyles).toMatch(
      /@media \(max-width: 1240px\)\s*\{\s*\.landing-deck__grid\s*\{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);\s*\}\s*\.landing-feature\s*\{\s*grid-column: 1 \/ -1;/,
    );
  });
});

describe('landing skill deck on hover', () => {
  it('only changes colour, so it cannot flicker over the playing video', () => {
    const hover =
      baseStyles.match(/\.landing-deck \.landing-deck__tile:hover[^{]*\{([^}]+)\}/)?.[1] ?? '';

    expect(hover).toContain('background:');
    // Moving away from the pointer un-hovers the tile, which moves it back, and so on.
    expect(hover).not.toContain('transform');
    // A blur over a video re-samples, and jumps in brightness, as soon as a tile changes.
    expect(rule('.landing-deck .landing-deck__tile')).not.toContain('backdrop-filter');
    expect(baseStyles).not.toMatch(/\.landing-deck__tile:hover img/);
  });
});

describe('landing skill deck on phones', () => {
  it('keeps only the name and example in half-width tiles', () => {
    const phone = baseStyles.slice(
      baseStyles.indexOf('/* Phones: half-width tiles keep the name and example'),
    );
    const block = phone.match(/@media \(max-width: 560px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

    expect(block).toMatch(
      /\.landing-deck__tile-description,\s*\.landing-deck__tile-title svg\s*\{\s*display: none;/,
    );
  });
});
