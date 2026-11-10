import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');
const tokens = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return baseStyles.match(new RegExp(`^${escaped}\\s*\\{([^}]+)\\}`, 'm'))?.[1] ?? '';
}

describe('landing navigation chrome', () => {
  it('never folds into a glass capsule rail: the desktop sidebar only has its expanded look', () => {
    expect(baseStyles).not.toContain("[data-state='collapsed']");
    expect(baseStyles).not.toContain('.landing-sidebar__collapse');
  });

  it('draws no line between the main navigation and the admin entry', () => {
    expect(baseStyles).not.toMatch(
      /\.landing-sidebar\s+nav\s+\[data-sidebar='group'\]\s*\+\s*\[data-sidebar='group'\]/,
    );
  });

  it('gives creation history rows room to breathe, each led by its cover image', () => {
    const rows =
      baseStyles.match(
        /\.landing-sidebar \.sidebar-history \[data-sidebar='menu-button'\],\s*\[data-mobile='true'\] \.sidebar-history \[data-sidebar='menu-button'\] \{([^}]+)\}/,
      )?.[1] ?? '';
    expect(rows).toContain('height: var(--list-row-height);');
    expect(tokens).toContain('--list-row-height: 44px;');
    expect(rule(".landing-sidebar .sidebar-history [data-sidebar='menu']")).toContain(
      'gap: var(--space-1);',
    );
    const thumb = rule('.sidebar-history__thumb');
    expect(thumb).toContain('width: 28px;');
    expect(thumb).toContain('object-fit: cover;');
  });

  it('marks the active rail item with a light glass pill and keeps labels legible', () => {
    const active = rule(".landing-sidebar [data-sidebar='menu-button'][data-active='true']");
    const item = rule(".landing-sidebar [data-sidebar='menu-button']");

    expect(active).toContain('background: var(--fill-4);');
    expect(item).toContain('color: var(--text-2);');
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
