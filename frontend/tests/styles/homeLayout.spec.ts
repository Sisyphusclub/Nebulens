import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return baseStyles.match(new RegExp(`^${escaped}\\s*\\{([^}]+)\\}`, 'm'))?.[1] ?? '';
}

describe('home layout', () => {
  it('starts after the rail', () => {
    expect(rule('.home-page')).toContain(
      'padding: 0 var(--home-gutter) 72px calc(var(--workspace-sidebar-rail) + var(--home-gutter));',
    );
    expect(rule('.home-hero .landing-composer-anchor::before')).toContain('display: none;');
  });

  it('lights the hero with a faint glow of the logo ribbon’s colours over the plain page', () => {
    // From the sidebar to the window edge, and down through the gap above the feed.
    expect(rule('.home-backdrop')).toContain(
      'inset: 0 calc(-1 * var(--home-gutter)) calc(-1 * var(--space-12));',
    );
    expect(rule('.home-feed')).toContain('margin-top: var(--space-12);');
    const glow = rule('.home-backdrop__glow');
    // The ribbon's blue, cyan and orange, faint, along the top edge.
    for (const brand of ['--brand-blue', '--brand-cyan', '--brand-orange']) {
      expect(glow).toContain(`var(${brand})`);
    }
    expect(glow).toContain('radial-gradient(');
    // No picture and nothing moving: the composer and the work below carry the colour.
    expect(glow).not.toContain('url(');
    expect(glow).not.toContain('animation');
    // A fine grain keeps so faint a gradient from settling into bands.
    expect(rule('.home-backdrop__glow::after')).toContain(
      'background-image: url("data:image/svg+xml',
    );
    // The backdrop fades into the page at the bottom.
    expect(rule('.home-backdrop__overlay')).toMatch(
      /linear-gradient\(180deg, transparent calc\(100% - \d+px\), var\(--background\)\)/,
    );
    // The video and the night sky that came before it are gone, with the composer corner
    // the stars bent around.
    for (const gone of [
      '.home-backdrop__media',
      '.landing-hero__video',
      '.home-backdrop__stars',
      '.home-hero .landing-composer-presentation',
    ]) {
      expect(baseStyles).not.toContain(gone);
    }
  });

  it('leaves the hero composer as clear glass, the same as on the generate page', () => {
    // A black box in the hero read as a hole in the page. The composer keeps the same glass
    // as on the generate page: nothing on the home page repaints or flattens it.
    expect(baseStyles).not.toMatch(/\.home-hero [^{]*\.generation-composer[^{]*\{[^}]*background:/);
    expect(baseStyles).not.toMatch(
      /\.home-hero [^{]*\.generation-composer[^{]*\{[^}]*backdrop-filter: none/,
    );
  });

  it('offers the skills once under the composer: no tool cards or banner repeat them further down', () => {
    // The banner and the two rows of tool cards repeated what the composer's skill library
    // and the feed's own tabs already offer. The news row that follows the hero is about
    // other things: signing in, and what has changed.
    for (const gone of ['.home-tools', '.landing-deck', '.landing-feature']) {
      expect(baseStyles).not.toContain(gone);
    }
  });

  it('gives the hero composer four lines to write in, and eight before it scrolls', () => {
    // Three lines looked too low on the home page and five left an empty band under a short
    // prompt. A phone keeps the shared three lines, so the rule waits for a composer at
    // least 560px wide.
    expect(baseStyles).toMatch(
      /@container composer \(min-width: 560px\) \{\s*\.home-hero \.agent-chat-input\.agent-chat-input--modes \.agent-chat-input__textarea \{\s*--prompt-min-lines: 4;\s*--prompt-max-lines: 8;/,
    );
    // The earlier hero height lost to the shared composer rule and did nothing.
    expect(baseStyles).not.toContain('min-height: 96px !important;');
  });

  it('spaces the hero on the spacing scale and sets the feed well apart from it', () => {
    const hero = rule('.home-hero');
    expect(hero).toContain('padding-top: clamp(88px, 13svh, 148px);');
    expect(hero).toContain('padding-bottom: var(--space-12);');
    expect(rule('.home-mode-switch')).toContain('margin-top: var(--space-6);');
    expect(rule('.home-hero .landing-composer-anchor')).toContain('margin-top: var(--space-8);');
    expect(rule('.home-skill-chips')).toContain('margin-top: var(--space-5);');
    expect(rule('.home-feed')).toContain('margin-top: var(--space-12);');
    // Whatever stands under the composer, the chips or the AI strip, starts at one offset.
    expect(rule('.home-hero .ai-insight')).toContain('margin: var(--space-5) 0 0;');
    // A phone used to add 30px of its own above the composer, on top of the anchor's gap.
    expect(rule('.home-hero .landing-composer')).toContain('margin-top: 0;');
  });

  it('keeps the hero narrower than the page, just wide enough for the composer', () => {
    // A composer at least 947px wide keeps its toolbar on one row.
    expect(rule('.home-hero')).toContain('--home-hero-width: 960px;');
    expect(rule('.home-hero .landing-composer-anchor')).toContain(
      'max-width: var(--home-hero-width);',
    );
    expect(rule('.home-skill-chips')).toContain('max-width: var(--home-hero-width);');
    expect(baseStyles).toMatch(
      /\.home-hero \.ai-insight,\s*\.home-hero \.landing-hero__secondary \{\s*max-width: var\(--home-hero-width\);/,
    );
  });

  it('lays the inspiration feed out as a wall of four columns, each piece at its own proportions', () => {
    // The wall is the shared masonry: a column's width is divided into rows, each card
    // spans as many as its picture needs, and the dense flow drops it into the shortest
    // column.
    const grid = rule('.masonry__grid');
    expect(grid).toContain('--masonry-columns: 4;');
    expect(grid).toContain(
      'grid-template-columns: repeat(var(--masonry-columns), minmax(0, 1fr));',
    );
    expect(grid).toContain('grid-auto-rows: var(--masonry-unit);');
    expect(grid).toContain('grid-auto-flow: row dense;');
    // Only columns are spaced by the grid: the gap under a card is part of its own span.
    expect(grid).toContain('gap: 0 var(--masonry-gap);');
    expect(rule('.masonry')).toContain('container-type: inline-size;');
    const card = rule('.home-feed .home-feed__card');
    expect(card).toContain('grid-row: span var(--masonry-span);');
    // The last row of a card's span is the gap under it.
    expect(card).toContain('height: calc(100% - var(--masonry-gap));');
    expect(card).toContain('border-radius: var(--radius-lg);');
    expect(baseStyles).not.toContain('.home-feed__media');
    expect(baseStyles).not.toContain('.home-feed__section');
  });

  it('narrows the wall to three columns, then two', () => {
    expect(baseStyles).toMatch(
      /@media \(max-width: 1240px\) \{\s*\.home-feed__grid \{\s*--masonry-columns: 3;/,
    );
    expect(baseStyles).toMatch(
      /@media \(max-width: 860px\) \{[\s\S]*?\.home-feed__grid \{\s*--masonry-columns: 2;/,
    );
  });

  it('lays the title, author and "make similar" over a picture when it is pointed at', () => {
    const overlay = rule('.home-feed__overlay');
    expect(overlay).toContain('opacity: 0;');
    expect(baseStyles).toMatch(
      /\.home-feed__card:hover \.home-feed__overlay,\s*\.home-feed__card:focus-visible \.home-feed__overlay \{\s*opacity: 1;/,
    );
    const cta = rule('.home-feed__cta');
    expect(cta).toContain('background: rgb(255 255 255 / 0.95);');
    expect(cta).toContain('color: var(--on-primary);');
    // A touch screen has no hover: the caption is always there, and the whole card is the button.
    expect(baseStyles).toMatch(
      /@media \(hover: none\) \{\s*\.home-feed__overlay \{[^}]*opacity: 1;[^}]*\}\s*\.home-feed__cta \{\s*display: none;/,
    );
  });

  it('heads each part of the page with a display title and an orange mark', () => {
    const title = rule('.home-section-title');
    expect(title).toContain('font-family: var(--font-display);');
    expect(title).toContain('font-size: 20px;');
    expect(title).toContain('font-weight: 600;');
    expect(rule('.home-section-title__mark')).toContain('color: var(--accent);');
  });
});

describe('news row', () => {
  it('stands a section apart from the hero above it', () => {
    expect(rule('.home-news')).toContain('margin-top: var(--space-12);');
  });

  it('is one row of cards that scrolls sideways when the page is too narrow for them all', () => {
    const row = rule('.home-news__row');
    expect(row).toContain('grid-auto-flow: column;');
    // At least 268px each; with room to spare they share it and nothing scrolls.
    expect(row).toContain('grid-auto-columns: minmax(268px, 1fr);');
    expect(row).toContain('overflow-x: auto;');
    expect(row).toContain('scrollbar-width: none;');
  });

  it('draws its cards as raised panels with no outline', () => {
    const card = rule('.home-news__promo,\n.home-news__card');
    expect(card).toContain('border-radius: var(--radius-lg);');
    expect(card).toContain('background: var(--bg-surface);');
    expect(card).not.toContain('border:');
  });

  it('gives the first card the accent: a warm glow in its corner and a filled button', () => {
    expect(rule('.home-news__promo')).toMatch(/radial-gradient\([^;]*var\(--accent\)/);
    const action = rule('.home-news__promo .home-news__promo-action');
    expect(action).toContain('background: var(--accent);');
    expect(action).toContain('color: var(--on-primary);');
  });
});

describe('closing lines and footer', () => {
  it('centres the closing lines under the wall, the title in the headline’s own Song face', () => {
    const closing = rule('.home-closing');
    expect(closing).toContain('align-items: center;');
    expect(closing).toContain('margin-top: var(--space-12);');
    expect(closing).toContain('text-align: center;');
    // The page opens and closes on the same voice: light, widely tracked Song.
    const title = rule('.home-closing h2');
    const headline = rule('.home-hero h1');
    for (const declaration of [
      'font-family: var(--font-serif);',
      'font-weight: 300;',
      'letter-spacing: 0.05em;',
    ]) {
      expect(title).toContain(declaration);
      expect(headline).toContain(declaration);
    }
  });

  it('sets the footer apart with a hairline and keeps it quiet', () => {
    const footer = rule('.home-footer');
    expect(footer).toContain('margin-top: var(--space-12);');
    expect(footer).toContain('border-top: 1px solid var(--line-1);');
    expect(footer).toContain('color: var(--text-3);');
    // The way back up sits at the far end of the row.
    expect(rule('.home-footer .home-footer__top')).toContain('margin-left: auto;');
  });
});

describe('quick composer', () => {
  it('rides the bottom of the window in the middle of the page column, and has a place of its own at the page’s end', () => {
    const dock = rule('.home-page .home-quick-composer');
    // Sticky, not fixed: it stays in the page column whatever the sidebar's width, and at
    // the end of the page it comes to rest in its own place, above the footer.
    expect(dock).toContain('position: sticky;');
    expect(dock).toContain('bottom: var(--space-6);');
    expect(dock).toContain('height: 56px;');
    expect(dock).toContain('margin-top: var(--space-12);');
    // Over the feed, under the sidebar and every dialog.
    expect(dock).toContain('z-index: 30;');
    const bar = rule('.home-quick-composer__bar');
    expect(bar).toContain('width: min(700px, 100%);');
    expect(bar).toContain('height: 100%;');
    expect(bar).toContain('margin: 0 auto;');
  });

  it('is a pill of glass, like the hero composer it stands in for', () => {
    const bar = rule('.home-quick-composer__bar');
    expect(bar).toContain('border-radius: var(--radius-2xl);');
    expect(bar).toContain('backdrop-filter: blur(24px) saturate(1.2);');
    expect(bar).toMatch(/background: rgb\(30 30 30 \/ 0\.\d+\);/);
  });

  it('slides up as it arrives, unless motion is to be kept down', () => {
    expect(rule('.home-quick-composer__bar')).toContain(
      'animation: home-quick-composer-in 300ms var(--ease-out-expo) both;',
    );
    expect(baseStyles).toMatch(
      /@keyframes home-quick-composer-in \{\s*from \{\s*opacity: 0;\s*transform: translateY\(12px\);/,
    );
    expect(baseStyles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.home-quick-composer__bar \{\s*animation: none;/,
    );
  });

  it('gets a neutral light edge when written in, never a coloured frame', () => {
    const focused = rule('.home-quick-composer__bar:focus-within');
    expect(focused).toContain('rgb(255 255 255 / 0.4)');
    expect(focused).not.toContain('accent');
    expect(rule('.home-quick-composer .home-quick-composer__input')).toContain('outline: none;');
  });
});

describe('flat workbench sidebar', () => {
  const panel =
    baseStyles.match(/\.group\[data-state='expanded'\] \.landing-sidebar \{([^}]+)\}/)?.[1] ?? '';

  const surface =
    baseStyles.match(
      /\.group\[data-state='expanded'\] \.landing-sidebar \[data-sidebar='sidebar'\] \{([^}]+)\}/,
    )?.[1] ?? '';

  it('lies flush against the window edge while expanded', () => {
    expect(panel).toContain('padding: 0;');
    expect(surface).toContain('border-radius: 0;');
  });

  it('is told from the page by its lighter grey alone, with no line down its edge', () => {
    expect(surface).toContain('background: var(--bg-sidebar);');
    expect(surface).toContain('border: 0;');
    expect(surface).not.toContain('border-right');
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
      '--nav-item-height: 36px;',
    );
    // Compact rows: small labels in a softly rounded row.
    expect(navButton).toContain('font-size: 13px;');
    expect(navButton).toContain('border-radius: var(--radius-md);');
    // No expanded-state rule reaches every menu button or group in the sidebar.
    expect(baseStyles).not.toMatch(
      /\.group\[data-state='expanded'\] \.landing-sidebar \[data-sidebar='(menu-button|group|menu)'\]/,
    );
    const historyGroup =
      baseStyles.match(
        /\.landing-sidebar \[data-sidebar='group'\]\.sidebar-history \{([^}]+)\}/,
      )?.[1] ?? '';
    expect(historyGroup).toContain('padding: var(--space-3) var(--space-3) var(--space-2);');
    // Space alone separates the history from the navigation.
    expect(historyGroup).not.toContain('border-top');
  });

  it('mark the open page with a raised row and an orange icon', () => {
    const active =
      baseStyles.match(
        /\.group\[data-state='expanded'\]\s+\.landing-sidebar\s+nav\s+\[data-sidebar='menu-button'\]\[data-active='true'\] \{([^}]+)\}/,
      )?.[1] ?? '';
    expect(active).toContain('background: var(--bg-surface-hover);');
    expect(baseStyles).toMatch(
      /\.group\[data-state='expanded'\]\s+\.landing-sidebar\s+nav\s+\[data-sidebar='menu-button'\]\[data-active='true'\]\s+svg \{\s*color: var\(--accent\);/,
    );
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
  it('sets the name in the display face, whose stack ends in the system Chinese sans', () => {
    for (const selector of [
      '.landing-sidebar__brand',
      '.landing-mobile-header__brand',
      '.auth-brand',
    ]) {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const body = baseStyles.match(new RegExp(`${escaped} \\{([^}]+)\\}`))?.[1] ?? '';
      expect(body, selector).toContain('font-family: var(--font-display);');
      expect(body, selector).toContain('font-weight: 600;');
    }
  });
});

describe('home headline', () => {
  it('is set in a light, widely tracked Song face', () => {
    const headline = rule('.home-hero h1');
    expect(headline).toContain('font-family: var(--font-serif);');
    expect(headline).toContain('font-weight: 300;');
    expect(headline).toContain('letter-spacing: 0.05em;');
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
    expect(rule('.studio-create-bar .generation-composer .agent-chat-input__textarea')).toContain(
      '--prompt-max-lines: 4;',
    );
  });

  it('scrolls a longer prompt in a window of whole lines, clear of the toolbar', () => {
    const text = rule('.agent-chat-input.agent-chat-input--modes .agent-chat-input__textarea');
    // The window is a whole number of 24px lines tall, three to six unless a page says otherwise.
    expect(text).toContain('--prompt-line: 24px;');
    expect(text).toContain(
      'min-height: calc(var(--prompt-min-lines, 3) * var(--prompt-line)) !important;',
    );
    expect(text).toContain(
      'max-height: calc(var(--prompt-max-lines, 6) * var(--prompt-line)) !important;',
    );
    // Padding would be inside the window: a line scrolled past was drawn in it, right up
    // against the toolbar. Margin keeps that room outside, where no text can reach.
    expect(text).toContain('margin: 2px 0 var(--space-3);');
    expect(text).toContain('padding: 0 !important;');
  });
});

describe('corner radius scale', () => {
  it('rounds every surface generously, from small badges to the composer', () => {
    const tokens = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');
    for (const [name, value] of [
      ['xs', '8px'],
      ['sm', '10px'],
      ['md', '12px'],
      ['lg', '16px'],
      ['xl', '20px'],
      ['2xl', '28px'],
    ]) {
      expect(tokens).toContain(`--radius-${name}: ${value};`);
    }
  });
});
