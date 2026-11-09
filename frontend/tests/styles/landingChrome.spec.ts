import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return baseStyles.match(new RegExp(`^${escaped}\\s*\\{([^}]+)\\}`, 'm'))?.[1] ?? '';
}

describe('landing navigation chrome', () => {
  it('never folds into a glass capsule rail: the desktop sidebar only has its expanded look', () => {
    expect(baseStyles).not.toContain("[data-state='collapsed']");
    expect(baseStyles).not.toContain('.landing-sidebar__collapse');
  });

  it('separates the utility group with an inset hairline that cannot widen the panel', () => {
    const divider =
      baseStyles.match(
        /\.landing-sidebar\s+nav\s+\[data-sidebar='group'\]\s*\+\s*\[data-sidebar='group'\]::before\s*\{([^}]+)\}/,
      )?.[1] ?? '';

    expect(divider).toContain('height: 1px;');
    expect(divider).toContain('left: 20px;');
    expect(divider).toContain('right: 20px;');
  });

  it('marks the active rail item with a light glass pill and keeps labels legible', () => {
    const active = rule(".landing-sidebar [data-sidebar='menu-button'][data-active='true']");
    const item = rule(".landing-sidebar [data-sidebar='menu-button']");

    expect(active).toContain('background: rgb(255 255 255 / 0.12);');
    expect(item).toContain('color: rgb(242 244 247 / 0.78);');
  });

  it('puts the header icon buttons on the same glass as the credits pill', () => {
    const icon = rule(
      '.landing-account-actions .landing-account-actions__icon,\n.landing-account-actions .landing-account-actions__avatar',
    );
    const credits = rule('.landing-account-actions .landing-account-actions__credits');

    expect(icon).toContain('background: rgb(26 30 40 / 0.42);');
    expect(icon).toContain('backdrop-filter: blur(10px) saturate(1.2);');
    expect(credits).toContain('background: rgb(26 30 40 / 0.42);');
  });
});
