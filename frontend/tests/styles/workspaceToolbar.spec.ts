import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

describe('workspace toolbars', () => {
  it('put search, filters and icon buttons on the same glass pills as Discover', () => {
    const glass =
      baseStyles.match(
        /\.operational-toolbar\s*:is\(\s*\.search-field,\s*\.admin-search,\s*\.beui-select-trigger,\s*\.icon-button,\s*\.view-switch\s*\)\s*\{([^}]+)\}/,
      )?.[1] ?? '';

    expect(glass).toContain('border-radius: var(--radius-full);');
    expect(glass).toContain('background: rgb(26 30 40 / 0.42);');
    expect(glass).toContain('backdrop-filter: blur(10px) saturate(1.2);');
  });

  it('turn the sticky assets toolbar into frosted glass over the grid', () => {
    const chrome =
      baseStyles.match(/\.workspace-page \.asset-workbench__chrome\s*\{([^}]+)\}/)?.[1] ?? '';

    expect(chrome).toContain('background: rgb(5 6 10 / 0.72);');
    expect(chrome).toContain('backdrop-filter: blur(16px) saturate(1.2);');
  });
});

describe('asset filters', () => {
  function rule(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return baseStyles.match(new RegExp(`^${escaped}\\s*\\{([^}]+)\\}`, 'm'))?.[1] ?? '';
  }

  it('show model chips as glass pills with a light pill for the active one', () => {
    expect(rule('.assets-page .collection-rail button')).toContain(
      'background: rgb(26 30 40 / 0.42);',
    );
    expect(rule(".assets-page .collection-rail button[aria-pressed='true']")).toContain(
      'background: rgb(255 255 255 / 0.14);',
    );
  });

  it('mark the active view with the same light pill instead of a solid white block', () => {
    expect(rule(".asset-commandbar .view-switch button[aria-pressed='true']")).toContain(
      'background: rgb(255 255 255 / 0.14);',
    );
  });
});
