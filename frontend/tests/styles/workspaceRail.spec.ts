import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

describe('workbench sidebar offset contract', () => {
  it('starts every page after the always-expanded desktop sidebar', () => {
    const workbench = baseStyles.slice(baseStyles.indexOf('/* Workbench sidebar:'));

    expect(workbench).toMatch(
      /\.app-shell \.app-main \{\s*--workspace-sidebar-rail: 0px;\s*padding-left: var\(--workbench-sidebar-width\);/,
    );
    // The same width as the sidebar panel (`--sidebar-width` on its provider).
    expect(workbench).toContain('--workbench-sidebar-width: 17rem;');
  });

  it('has no page rule that pulls library pages back under the sidebar', () => {
    // A more specific padding for the library pages would win over the workbench offset.
    expect(baseStyles).not.toMatch(
      /\.app-main:not\(\.app-main--landing\):not\(\.app-main--generate\)\s*\{[^}]*padding-left/,
    );
  });
});
