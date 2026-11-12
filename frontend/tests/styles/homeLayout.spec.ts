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

  it('goes from the composer and its chips straight to the feed, with no tool cards between', () => {
    // The banner and the two rows of tool cards repeated what the composer's skill library
    // and the feed's own tabs already offer.
    for (const gone of ['.home-tools', '.landing-deck', '.landing-feature']) {
      expect(baseStyles).not.toContain(gone);
    }
  });

  it('lays the inspiration feed out in rows of four wide cards', () => {
    expect(rule('.home-feed__grid')).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));');
    expect(rule('.home-feed__media')).toContain('aspect-ratio: 4 / 3;');
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
    expect(panel).toContain('width: var(--sidebar-width);');
    expect(baseStyles).toMatch(
      /\.app-shell \.app-main \{\s*--workspace-sidebar-rail: 0px;\s*padding-left: var\(--sidebar-width\);/,
    );
  });
});

describe('creation history rows', () => {
  it('keep their own compact size: the expanded navigation sizes stop at its <nav>', () => {
    const navButton =
      baseStyles.match(
        /\.group\[data-state='expanded'\] \.landing-sidebar nav \[data-sidebar='menu-button'\] \{([^}]+)\}/,
      )?.[1] ?? '';
    expect(navButton).toContain('height: var(--nav-item-height);');
    expect(readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')).toContain(
      '--nav-item-height: 44px;',
    );
    // No expanded-state rule reaches every menu button or group in the sidebar.
    expect(baseStyles).not.toMatch(
      /\.group\[data-state='expanded'\] \.landing-sidebar \[data-sidebar='(menu-button|group|menu)'\]/,
    );
    const historyGroup =
      baseStyles.match(
        /\.landing-sidebar \[data-sidebar='group'\]\.sidebar-history \{([^}]+)\}/,
      )?.[1] ?? '';
    expect(historyGroup).toContain('padding: var(--space-3) var(--space-2-5) var(--space-2);');
    // Space alone separates the history from the navigation.
    expect(historyGroup).not.toContain('border-top');
  });

  it('leave room for the rename and remove actions in the phone menu, where they always show', () => {
    expect(baseStyles).toMatch(
      /\[data-mobile='true'\] \.sidebar-history \[data-sidebar='menu-button'\] \{[^}]*padding: 0 60px 0 6px;/,
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

describe('brand wordmark', () => {
  it('sets the Chinese name in the serif: the Latin display face has no Chinese glyphs', () => {
    for (const selector of [
      '.landing-sidebar__brand',
      '.landing-mobile-header__brand',
      '.auth-brand',
    ]) {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const body = baseStyles.match(new RegExp(`${escaped} \\{([^}]+)\\}`))?.[1] ?? '';
      expect(body, selector).toContain('font-family: var(--font-serif);');
      expect(body, selector).toContain('font-weight: 600;');
    }
  });
});

describe('home headline', () => {
  it('uses the light Song face of the earlier hero', () => {
    const headline = rule('.home-hero h1');
    expect(headline).toContain('font-family: var(--font-serif);');
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

describe('generate composer', () => {
  it('shows four lines of a long prompt at most, so it cannot cover the results', () => {
    // Four 24px lines and the 14px of padding the text has above and below.
    expect(rule('.studio-create-bar .generation-composer .agent-chat-input__textarea')).toContain(
      'max-height: 110px !important;',
    );
    expect(rule('.agent-chat-input.agent-chat-input--modes .agent-chat-input__textarea')).toContain(
      'padding: 2px 0 var(--space-3) !important;',
    );
  });
});
