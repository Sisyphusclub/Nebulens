import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

describe('creation templates layout contract', () => {
  it('keeps template chrome outside the only vertical scroll region', () => {
    expect(baseStyles).toMatch(
      /\.app-shell--templates,\s*\.app-main--templates,\s*\.app-workspace--templates\s*\{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s,
    );
    expect(baseStyles).toMatch(
      /\.templates-page\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*overflow:\s*hidden;/s,
    );
    expect(baseStyles).toMatch(
      /\.templates-page\s*>\s*\.operational-page-header,\s*\.templates-page\s*>\s*\.template-toolbar\s*\{[^}]*flex:\s*0 0 auto;[^}]*background:\s*var\(--background\);/s,
    );
    expect(baseStyles).toMatch(
      /\.template-page-scroll\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1 1 auto;[^}]*overflow-y:\s*auto;/s,
    );
  });
});
