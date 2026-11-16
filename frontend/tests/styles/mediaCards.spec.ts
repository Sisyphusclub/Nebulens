import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return baseStyles.match(new RegExp(`^${escaped}\\s*\\{([^}]+)\\}`, 'm'))?.[1] ?? '';
}

describe('walls of cards', () => {
  it('fit as many columns as the wall has room for, each at least 264px wide', () => {
    const grid = rule('.masonry--cards .masonry__grid');
    expect(grid).toContain('--masonry-columns: 1;');
    // Spaced like the home wall: the gap is the shared wall's own, not one set here.
    expect(grid).not.toContain('--masonry-gap');
    expect(rule('.masonry__grid')).toContain('--masonry-gap: 8px;');
    // 264px keeps a column's forty rows tall enough for the caption's ten.
    for (const [width, columns] of [
      [536, 2],
      [808, 3],
      [1080, 4],
      [1352, 5],
    ]) {
      expect(baseStyles).toMatch(
        new RegExp(
          `@container \\(min-width: ${width}px\\) \\{\\s*\\.masonry--cards \\.masonry__grid \\{\\s*--masonry-columns: ${columns};`,
        ),
      );
    }
  });

  it('draw each card as a panel a shade above the page, as tall as its rows', () => {
    const card = rule('.media-card');
    expect(card).toContain('grid-row: span var(--masonry-span);');
    expect(card).toContain('height: calc(100% - var(--masonry-gap));');
    expect(card).toContain('flex-direction: column;');
    expect(card).toContain('border-radius: var(--radius-xl);');
    expect(card).toContain('background: var(--bg-surface-hover);');
    expect(card).not.toContain('border:');
  });

  it('give the caption the rows the script set aside for it, so the picture keeps its proportions', () => {
    const info = rule('.media-card__info');
    expect(info).toContain('height: calc(var(--masonry-info-rows) * var(--masonry-unit));');
    expect(info).toContain('flex: 0 0 auto;');
    const title = rule('.media-card__title');
    expect(title).toContain('font-size: 14px;');
    expect(title).toContain('font-weight: 600;');
    expect(title).toContain('text-overflow: ellipsis;');
    expect(rule('.media-card__meta')).toContain('font-size: 11px;');
  });
});

describe('template cards', () => {
  it('fill the room above the caption with the picture', () => {
    const preview = rule('.template-tile__preview');
    expect(preview).toContain('flex-direction: column;');
    expect(preview).toContain('height: 100%;');
    const image = rule('.template-tile__preview img');
    expect(image).toContain('flex: 1 1 0;');
    expect(image).toContain('object-fit: cover;');
    // The old mosaic: double-width cards, a dark band and the name laid over the picture.
    expect(baseStyles).not.toContain('.template-tile--wide');
    expect(baseStyles).not.toContain('.template-tile__preview::after');
  });

  it('keep the favourite and "use" buttons in the caption’s corner, and turn "use" orange when pointed at', () => {
    const actions = rule('.template-tile__actions');
    expect(actions).toContain('right: 8px;');
    expect(actions).toContain('bottom: ');
    // The word only shows with the pill.
    expect(rule('.template-tile__use-label')).toContain('display: none;');
    expect(baseStyles).toMatch(
      /\.template-tile:hover \.template-tile__use,\s*\.template-tile:focus-within \.template-tile__use \{[^}]*background: var\(--accent\);/,
    );
    expect(rule(".template-tile__actions button[aria-pressed='true']")).toContain(
      'color: var(--accent);',
    );
  });
});
