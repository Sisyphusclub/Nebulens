import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return baseStyles.match(new RegExp(`^${escaped}\\s*\\{([^}]+)\\}`, 'm'))?.[1] ?? '';
}

describe('landing navigation chrome', () => {
  it('wraps the whole collapsed rail in one compact glass capsule', () => {
    const rail = rule(".group[data-state='collapsed'] .landing-sidebar nav");
    const divider =
      baseStyles.match(
        /\.landing-sidebar\s+nav\s+\[data-sidebar='group'\]\s*\+\s*\[data-sidebar='group'\]\s*\{([^}]+)\}/,
      )?.[1] ?? '';

    expect(rail).toContain('border-radius: 22px;');
    expect(rail).toContain('padding: 6px;');
    expect(rail).toContain('background: rgb(26 30 40 / 0.42);');
    expect(rail).toContain('backdrop-filter: blur(10px) saturate(1.2);');
    // The utility group joins the same capsule behind a hairline instead of floating apart.
    expect(divider).toContain('border-top: 1px solid rgb(255 255 255 / 0.08);');
    expect(baseStyles).not.toMatch(
      /\.group\[data-state='collapsed'\] \.landing-sidebar \[data-sidebar='menu'\]\s*\{[^}]*background:/,
    );
  });

  it('nests compact rail items inside the capsule corners', () => {
    const desktopStart = baseStyles.indexOf('@media (min-width: 861px) {\n  .landing-sidebar');
    const desktop = baseStyles.slice(desktopStart, baseStyles.indexOf('\n}\n', desktopStart));

    expect(desktop).toContain('width: 64px !important;');
    expect(desktop).toContain('height: 58px !important;');
    // 22px capsule radius = 16px item radius + 6px capsule padding.
    expect(desktop).toContain('border-radius: 16px;');
    expect(desktop).toMatch(/\[data-sidebar='menu'\]\s*\{\s*gap: 2px;/);
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
