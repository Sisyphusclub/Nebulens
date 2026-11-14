import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');
const tokens = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');

describe('operational workspace layout contract', () => {
  it('shares one capped width and responsive gutter scale across workspace pages', () => {
    expect(tokens).toContain('--workspace-content-max: 1580px;');
    expect(tokens).toContain('--workspace-page-gutter: 24px;');

    const sharedContract = baseStyles.slice(
      baseStyles.indexOf('/* Operational routes share one content column'),
      baseStyles.indexOf('/* Keep the template library'),
    );

    expect(sharedContract).toContain('width: min(100%, var(--workspace-content-max));');
    expect(sharedContract).toContain('padding-right: var(--workspace-page-gutter);');
    expect(sharedContract).toContain('padding-left: var(--workspace-page-gutter);');
    expect(baseStyles).toContain('--workspace-page-gutter: 20px;');
    expect(baseStyles).toContain('--workspace-page-gutter: 14px;');
  });

  it('shares one title, toolbar, control, and media-density contract', () => {
    const operationalContract = baseStyles.slice(
      baseStyles.lastIndexOf(
        '/* Templates, Assets, and Users share one operational page skeleton.',
      ),
    );

    // The title row is level with the account buttons in the window's corner, keeps clear
    // of them, and a toolbar that sticks comes to rest underneath them.
    expect(operationalContract).toContain('--operational-header-safe-top: 32px;');
    expect(operationalContract).toContain('--operational-sticky-top: 76px;');
    expect(operationalContract).toContain('--operational-account-reserve: 320px;');
    expect(operationalContract).toContain('.operational-page-header {');
    expect(operationalContract).toContain('min-height: 32px;');
    expect(operationalContract).toContain('margin: 0 0 20px;');
    expect(operationalContract).toContain('border-bottom: 0;');
    expect(operationalContract).toContain(
      'padding-right: var(--operational-account-reserve, 0px);',
    );
    // A quiet title: the size of body text, medium weight.
    expect(operationalContract).toContain('font-size: 16px;');
    expect(operationalContract).toContain('font-weight: 500;');
    expect(operationalContract).toContain('.operational-page-header__meta {');
    expect(operationalContract).toContain('font-size: 12px;');
    expect(operationalContract).toContain('.operational-toolbar {');
    expect(operationalContract).toContain('height: 32px;');
    expect(operationalContract).toContain('.assets-page .asset-workbench__chrome {');
    expect(operationalContract).toContain('padding-top: 0;');
    expect(operationalContract).toContain('.admin-page .admin-panel {');
    expect(operationalContract).toContain('margin-inline: 0;');
    expect(operationalContract).toContain('@media (min-width: 1181px) {');
    expect(operationalContract).toContain(
      '--admin-table-columns: minmax(240px, 1.25fr) minmax(150px, 0.7fr) minmax(230px, 1fr) 180px;',
    );
    expect(operationalContract).toContain('grid-template-columns: var(--admin-table-columns);');
    expect(operationalContract).toContain('.admin-page .admin-row--head > :last-child {');
    expect(operationalContract).toContain('justify-content: flex-end;');

    const adminToolbarContract = operationalContract.slice(
      operationalContract.indexOf('.admin-page .admin-table-toolbar {'),
      operationalContract.indexOf('.admin-page .admin-search {'),
    );
    expect(adminToolbarContract).toContain('min-height: 32px;');
    expect(adminToolbarContract).toContain('gap: 8px;');
    expect(operationalContract).toContain('@media (min-width: 1600px) {');
    expect(operationalContract).toContain('grid-template-columns: repeat(5, minmax(0, 1fr));');
    expect(operationalContract).toContain('@media (max-width: 1180px) {');
    expect(operationalContract).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(operationalContract).toContain('@media (max-width: 560px) {');
    expect(operationalContract).toContain('grid-template-columns: 1fr;');

    const mobileContract = operationalContract.slice(
      operationalContract.indexOf('@media (max-width: 560px) {'),
    );
    expect(mobileContract).toContain('justify-content: flex-start;');
    expect(mobileContract).toContain('padding-block: 8px;');
  });
});
