import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

describe('workspace toolbars', () => {
  const block = (pattern: RegExp): string => baseStyles.match(pattern)?.[1] ?? '';

  it('make every control a 32px pill, with no glass', () => {
    const pill = block(
      /\.operational-toolbar\s*:is\(\s*\.search-field,\s*\.admin-search,\s*\.beui-select-trigger,\s*\.icon-button,\s*\.view-switch,\s*\.asset-ai-toggle\s*\)\s*\{([^}]+)\}/,
    );
    expect(pill).toContain('height: 32px;');
    expect(pill).toContain('min-height: 32px;');
    expect(pill).toContain('border-radius: var(--radius-full);');
    expect(pill).toContain('backdrop-filter: none;');
  });

  it('rest the search on a quiet fill and outline the other controls with a hairline', () => {
    const search = block(/\.operational-toolbar :is\(\.search-field, \.admin-search\) \{([^}]+)\}/);
    expect(search).toContain('border: 0;');
    expect(search).toContain('background: var(--bg-surface);');
    const outlined = block(
      /\.operational-toolbar :is\(\.beui-select-trigger, \.icon-button, \.asset-ai-toggle\) \{([^}]+)\}/,
    );
    expect(outlined).toContain('border: 1px solid var(--line-2);');
    expect(outlined).toContain('background: transparent;');
    expect(outlined).toContain('font-size: 12px;');
  });

  it('mark a toggle that is on with the accent', () => {
    // The AI search has a colour of its own: tests/styles/aiColors.spec.ts.
    const on = block(
      /\.operational-toolbar\s*:is\(\s*\.icon-button\.is-active,\s*\.icon-button\[aria-pressed='true'\]\s*\)\s*\{([^}]+)\}/,
    );
    expect(on).toContain('background: var(--accent-soft);');
    expect(on).toContain('color: var(--accent);');
  });

  it('turn the sticky assets toolbar into frosted glass over the grid', () => {
    const chrome =
      baseStyles.match(/\.workspace-page \.asset-workbench__chrome\s*\{([^}]+)\}/)?.[1] ?? '';

    expect(chrome).toContain('background: color-mix(in oklch, var(--bg-page) 72%, transparent);');
    expect(chrome).toContain('backdrop-filter: blur(16px) saturate(1.2);');
  });
});

describe('asset filters', () => {
  function rule(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return baseStyles.match(new RegExp(`^${escaped}\\s*\\{([^}]+)\\}`, 'm'))?.[1] ?? '';
  }

  it('show model chips as solid pills, the active one filled with the accent', () => {
    expect(rule('.assets-page .collection-rail button')).toContain(
      'background: var(--bg-surface-hover);',
    );
    expect(rule(".assets-page .collection-rail button[aria-pressed='true']")).toContain(
      'background: var(--accent-fill);',
    );
  });

  it('round the view buttons to match the pill around them', () => {
    expect(rule('.asset-commandbar .view-switch button')).toContain(
      'border-radius: var(--radius-full);',
    );
  });

  it('mark the active view with the same light pill instead of a solid white block', () => {
    expect(rule(".asset-commandbar .view-switch button[aria-pressed='true']")).toContain(
      'background: var(--fill-4);',
    );
  });
});
