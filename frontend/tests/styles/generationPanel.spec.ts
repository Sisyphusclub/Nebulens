import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return baseStyles.match(new RegExp(`^${escaped}\\s*\\{([^}]+)\\}`, 'm'))?.[1] ?? '';
}

describe('the generation settings panel', () => {
  it('never hangs off the window: it slides left by what it is wider than the room it has', () => {
    const panel = rule('.generation-custom-panel');
    expect(panel).toContain('max-width: calc(100vw - 24px);');
    expect(panel).toContain(
      'translate: min(0px, var(--radix-dropdown-menu-content-available-width, 100%) - 100%) 0;',
    );
    // Hung off its button by the button's width, the panel lost its left edge on a phone
    // once a second button sat beside it, and its right edge on anything narrower than a
    // desktop.
    expect(baseStyles).not.toContain('--radix-dropdown-menu-trigger-width');
    const phone =
      baseStyles.match(
        /@media \(max-width: 560px\) \{[\s\S]*?\n {2}\.generation-custom-panel \{([^}]+)\}/,
      )?.[1] ?? '';
    expect(phone).toContain('max-width: calc(100vw - 24px);');
    expect(phone).not.toContain('translate');
  });
});
