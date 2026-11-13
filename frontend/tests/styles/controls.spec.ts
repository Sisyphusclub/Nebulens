import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');
const tokens = read('src/styles/tokens.css');
const baseStyles = read('src/styles/base.css');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return baseStyles.match(new RegExp(`^${escaped}\\s*\\{([^}]+)\\}`, 'm'))?.[1] ?? '';
}

describe('buttons', () => {
  it('are softly rounded and set in the medium weight', () => {
    const button = rule('.button');
    expect(button).toContain('border-radius: var(--radius-lg);');
    expect(button).toContain('font-weight: 500;');
    expect(rule('.button--icon,\n.icon-button')).toContain('border-radius: var(--radius-md);');
  });

  it('shade the primary button underneath and light its top edge on hover, with no outline', () => {
    expect(tokens).toContain('--shadow-primary: inset 0 -2px 4px rgb(0 0 0 / 0.24);');
    expect(rule('.button--primary')).toContain('box-shadow: var(--shadow-primary);');
    expect(rule('.button--primary:hover')).toContain('box-shadow: var(--shadow-primary-hover);');
  });

  it('raise the secondary button a shade and light its top edge on hover', () => {
    expect(rule('.button--secondary')).toContain('box-shadow: var(--shadow-control);');
    expect(rule('.button--secondary:hover')).toContain('box-shadow: var(--shadow-control-hover);');
  });
});

describe('filter pills', () => {
  const groups = [
    ['.home-feed .home-feed__tab', "[aria-pressed='true']"],
    ['.template-category-chips button', "[aria-pressed='true']"],
    ['.assets-page .collection-rail button', "[aria-pressed='true']"],
  ] as const;

  it('sit raised on the page as solid pills, with no outline and no glass', () => {
    for (const [selector] of groups) {
      const pill = rule(selector);
      expect(pill, selector).toContain('border: 0;');
      expect(pill, selector).toContain('border-radius: var(--radius-full);');
      expect(pill, selector).toContain('background: var(--bg-surface-hover);');
      expect(pill, selector).toContain('box-shadow: var(--shadow-control);');
      expect(pill, selector).not.toContain('backdrop-filter');
    }
  });

  it('fill the chosen one with the accent and set its label dark', () => {
    // A warm highlight over orange: the fill is one token, so every row of pills matches.
    expect(tokens).toMatch(/--accent-fill:\s*linear-gradient\([^;]+radial-gradient\([^;]+;/);
    for (const [selector, chosen] of groups) {
      const pill = rule(`${selector}${chosen}`);
      expect(pill, selector).toContain('background: var(--accent-fill);');
      expect(pill, selector).toContain('box-shadow: var(--shadow-accent-fill);');
      expect(pill, selector).toContain('color: var(--on-primary);');
    }
  });

  it('are 32px tall on the home feed, and 40px under a finger', () => {
    const tab = rule('.home-feed .home-feed__tab');
    expect(tab).toContain('height: 32px;');
    expect(tab).toContain('min-height: 32px;');
    expect(tab).toContain('font-size: 12px;');
    expect(baseStyles).toMatch(
      /@media \(max-width: 860px\) \{[\s\S]*?\.home-feed \.home-feed__tab \{\s*height: 40px;\s*min-height: 40px;/,
    );
  });
});

describe('skill chips', () => {
  it('are small solid chips under the composer, so the sky behind does not show through the labels', () => {
    expect(rule('.home-skill-chips')).toContain('--chip-height: 32px;');
    const chip = rule('.home-skill-chips .home-skill-chips__chip');
    expect(chip).toContain('border: 0;');
    expect(chip).toContain('border-radius: var(--radius-md);');
    expect(chip).toContain('background: var(--bg-surface-hover);');
    expect(chip).toContain('box-shadow: var(--shadow-control);');
    expect(chip).toContain('font-size: 12px;');
  });
});
