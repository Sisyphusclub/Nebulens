import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return baseStyles.match(new RegExp(`^${escaped}\\s*\\{([^}]+)\\}`, 'm'))?.[1] ?? '';
}

describe('landing navigation chrome', () => {
  it('groups the collapsed rail into one glass capsule over the artwork wall', () => {
    const rail = rule(".group[data-state='collapsed'] .landing-sidebar [data-sidebar='menu']");

    expect(rail).toContain('border-radius: 24px;');
    expect(rail).toContain('background: rgb(26 30 40 / 0.42);');
    expect(rail).toContain('backdrop-filter: blur(10px) saturate(1.2);');
  });

  it('marks the active rail item with a light glass pill and keeps labels legible', () => {
    const active = rule(".landing-sidebar [data-sidebar='menu-button'][data-active='true']");
    const item = rule(".landing-sidebar [data-sidebar='menu-button']");

    expect(active).toContain('background: rgb(255 255 255 / 0.14);');
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
