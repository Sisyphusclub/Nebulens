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
    expect(grid).toContain('grid-template-columns: minmax(0, 1.35fr) repeat(4, minmax(0, 1fr));');
    // Fixed rows keep the feature exactly two tiles tall, so it cannot open gaps under them.
    expect(grid).toContain('grid-template-rows: repeat(2, 80px);');
    expect(rule('.landing-deck__feature')).toContain('grid-row: span 2;');
  });

  it('fills the feature card with the example, like the banner on Kling', () => {
    expect(rule('.landing-deck__feature-image')).toContain('inset: 0;');
    expect(rule('.landing-deck__feature-body')).toContain('align-content: end;');
  });

  it('draws each tile as compact glass with the example on the right', () => {
    const tile = rule('.landing-deck .landing-deck__tile');

    expect(tile).toContain('height: auto;');
    expect(tile).toContain('background: rgb(22 25 34 / 0.62);');
    expect(tile).toContain('backdrop-filter: blur(12px) saturate(1.2);');
    expect(rule('.landing-deck__tile img')).toContain('width: 56px;');
    // One short line under the name, like Kling's tiles.
    expect(rule('.landing-deck__tile-description')).toContain('white-space: nowrap;');
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
