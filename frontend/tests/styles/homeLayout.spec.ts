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
  const panel =
    baseStyles.match(/\.group\[data-state='expanded'\] \.landing-sidebar \{([^}]+)\}/)?.[1] ?? '';

  it('lies flush against the window edge while expanded', () => {
    expect(panel).toContain('padding: 0;');
    expect(baseStyles).toMatch(
      /\.group\[data-state='expanded'\] \.landing-sidebar \[data-sidebar='sidebar'\] \{[^}]*border-radius: 0;/,
    );
  });

  it('stays exactly as wide as the page offset, however long the creation titles are', () => {
    // Tailwind 4 does not generate the registry's `w-[--sidebar-width]`; without this the
    // panel grows to fit the longest title and covers the page.
    expect(panel).toContain('width: var(--workbench-sidebar-width);');
    expect(baseStyles).toMatch(
      /\.app-shell \.app-main \{\s*--workspace-sidebar-rail: 0px;\s*padding-left: var\(--workbench-sidebar-width\);/,
    );
  });
});

describe('creation history rows', () => {
  it('keep their own compact size: the expanded navigation sizes stop at its <nav>', () => {
    const navButton =
      baseStyles.match(
        /\.group\[data-state='expanded'\] \.landing-sidebar nav \[data-sidebar='menu-button'\] \{([^}]+)\}/,
      )?.[1] ?? '';
    expect(navButton).toContain('height: 42px;');
    // No expanded-state rule reaches every menu button or group in the sidebar.
    expect(baseStyles).not.toMatch(
      /\.group\[data-state='expanded'\] \.landing-sidebar \[data-sidebar='(menu-button|group|menu)'\]/,
    );
    const historyGroup =
      baseStyles.match(
        /\.landing-sidebar \[data-sidebar='group'\]\.sidebar-history \{([^}]+)\}/,
      )?.[1] ?? '';
    expect(historyGroup).toContain('padding: 14px 10px 8px;');
  });

  it('leave room for the rename and remove actions in the phone menu, where they always show', () => {
    expect(baseStyles).toMatch(
      /\[data-mobile='true'\] \.sidebar-history \[data-sidebar='menu-button'\] \{[^}]*padding: 0 60px 0 12px;/,
    );
  });
});

describe('phone menu', () => {
  it('has a width of its own, so long creation titles cannot push it off the screen', () => {
    // Matched by its own attributes: the sheet is portaled out of `.landing-sidebar`.
    const sheet =
      baseStyles.match(/\n {2}\[data-sidebar='sidebar'\]\[data-mobile='true'\] \{([^}]+)\}/)?.[1] ??
      '';
    expect(sheet).toContain('width: min(20rem, 85vw);');
    expect(baseStyles).not.toContain(
      ".landing-sidebar [data-sidebar='sidebar'][data-mobile='true']",
    );
  });
});

describe('home headline', () => {
  it('uses the light Song face of the earlier hero', () => {
    const headline = rule('.home-hero h1');
    expect(headline).toContain('font-family: var(--font-hero-serif);');
    expect(headline).toContain('font-weight: 300;');
    expect(rule('.home-hero h1 > span')).toContain('display: inline-block;');
  });
});

describe('image detail over the sidebar', () => {
  it('sends the sidebar and phone header beneath the page while a detail is open', () => {
    expect(baseStyles).toMatch(
      /\.app-shell--detail-open \.landing-navigation-shell,\s*\.app-shell--detail-open \.landing-mobile-header \{\s*z-index: 0;/,
    );
  });
});
