import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');
/** The page's last word on each rule: the shared skeleton at the end of the stylesheet. */
const skeleton = baseStyles.slice(
  baseStyles.lastIndexOf('/* Templates, Assets, and Users share one operational page skeleton.'),
);

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return skeleton.match(new RegExp(`^${escaped}\\s*\\{([^}]+)\\}`, 'm'))?.[1] ?? '';
}

describe('user management page', () => {
  it('sets the table on one panel a shade above the page, with no outline', () => {
    const shell = rule('.admin-page .admin-table-shell');
    expect(shell).toContain('border: 0;');
    expect(shell).toContain('border-radius: var(--radius-lg);');
    expect(shell).toContain('background: var(--bg-surface);');
  });

  it('keeps the head, the rows and the pager on that panel, parted by hairlines', () => {
    const head = rule('.admin-page .admin-row--head');
    expect(head).toContain('background: transparent;');
    expect(head).toContain('border-bottom: 1px solid var(--line-1);');
    const pager = rule('.admin-page .admin-pagination');
    expect(pager).toContain('background: transparent;');
    expect(pager).toContain('border-top: 1px solid var(--line-1);');
    expect(rule('.admin-page .admin-row:not(.admin-row--head):hover')).toContain(
      'background: var(--fill-1);',
    );
  });

  it('sizes the controls in the table like the toolbar above it: 32px', () => {
    const quota = rule('.admin-page .admin-quota input');
    expect(quota).toContain('height: 32px;');
    expect(quota).toContain('border-radius: var(--radius-md);');
    const action = rule('.admin-page .admin-actions .button');
    expect(action).toContain('height: 32px;');
    expect(action).toContain('min-height: 32px;');
    const page = rule('.admin-page .admin-pagination .icon-button');
    expect(page).toContain('width: 32px;');
    expect(page).toContain('height: 32px;');
    expect(page).toContain('border-radius: var(--radius-full);');
    expect(rule('.admin-page .admin-page-size')).toContain('height: 32px;');
  });

  it('draws the form for a new account as the same kind of panel', () => {
    const form = rule('.admin-page .admin-create');
    expect(form).toContain('border: 0;');
    expect(form).toContain('border-radius: var(--radius-lg);');
    expect(form).toContain('background: var(--bg-surface);');
    const field = rule('.admin-page .admin-create input');
    expect(field).toContain('height: 36px;');
    expect(field).toContain('border-radius: var(--radius-md);');
  });
});
