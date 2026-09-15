import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

function normalizeCss(value: string) {
  return value.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
}

function ruleBody(styles: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`));

  expect(match, `missing CSS rule: ${selector}`).not.toBeNull();
  return normalizeCss(match?.[1] ?? '');
}

describe('image detail sizing contract', () => {
  it('uses dynamic desktop sizing and preserves mobile overrides', () => {
    const desktopStart = baseStyles.indexOf(
      '@media (min-width: 861px) {',
      baseStyles.indexOf('.image-detail'),
    );
    const desktopEnd = baseStyles.indexOf('.toast-region {', desktopStart);
    const desktopContract = normalizeCss(baseStyles.slice(desktopStart, desktopEnd));
    const mobileStart = baseStyles.indexOf('@media (max-width: 860px) {', desktopEnd);
    const mobileEnd = baseStyles.indexOf('@media (max-width: 560px) {', mobileStart);
    const mobileContract = normalizeCss(baseStyles.slice(mobileStart, mobileEnd));
    const narrowStart = baseStyles.indexOf('@media (max-width: 560px) {', mobileEnd);
    const narrowContract = normalizeCss(baseStyles.slice(narrowStart));

    expect(desktopStart).toBeGreaterThanOrEqual(0);
    const desktopModalRule = ruleBody(desktopContract, '.image-detail-modal');
    expect(desktopModalRule).toContain('height: min(80vh, 720px, calc(100svh - 2rem)) !important;');
    expect(desktopModalRule).toContain('min-height: min(580px, calc(100svh - 2rem)) !important;');
    expect(desktopModalRule).toContain('max-height: min(720px, calc(100svh - 2rem)) !important;');
    expect(desktopContract).toContain('height: 100%;');
    expect(desktopContract).toContain('min-height: 0;');
    expect(desktopContract).toContain('grid-template-rows: minmax(0, 1fr);');
    expect(desktopContract).toContain('.image-detail__media');
    const mediaRule = ruleBody(baseStyles, '.image-detail__media');
    const imageRule = ruleBody(baseStyles, '.image-detail__media img');
    const promptRule = ruleBody(baseStyles, '.image-detail__prompt');

    expect(mediaRule).toContain('flex: 1 1 auto;');
    expect(mediaRule).toContain('height: 100%;');
    expect(mediaRule).toContain('padding: 0;');
    expect(mediaRule).toContain('display: flex;');
    expect(mediaRule).toContain('align-items: center;');
    expect(mediaRule).toContain('justify-content: center;');
    expect(mediaRule).toContain('background: #0a0a0a;');
    expect(mediaRule).toContain('overflow: hidden;');
    expect(imageRule).toContain('width: auto;');
    expect(imageRule).toContain('height: auto;');
    expect(imageRule).toContain('max-width: 100%;');
    expect(imageRule).toContain('max-height: 100%;');
    expect(imageRule).toContain('border-radius: 12px;');
    expect(imageRule).toContain('box-shadow: 0 25px 50px -12px');
    expect(imageRule).toContain('object-fit: contain;');
    expect(desktopContract).toContain('aspect-ratio: auto;');
    expect(baseStyles).toContain('.image-detail__body-content');
    expect(baseStyles).toContain('width: 340px;');
    expect(promptRule).toContain('max-width: 100%;');
    expect(promptRule).toContain('overflow-wrap: anywhere;');
    expect(promptRule).toContain('white-space: pre-wrap;');
    expect(promptRule).toContain('word-break: break-word;');
    expect(mobileContract).toContain('grid-template-rows: auto auto;');
    expect(mobileContract).toContain('height: min(55svh, 72vw);');
    expect(mobileContract).toContain('width: 100%;');
    expect(mobileContract).not.toContain('min-height: 42vh;');
    expect(mobileContract).not.toContain('grid-template-rows: 42svh 1fr;');
    expect(narrowContract).toContain('.image-detail {');
    expect(narrowContract).toContain('grid-template-rows: auto auto;');
    expect(narrowContract).toContain('padding: 0;');
    expect(narrowContract).not.toContain('grid-template-rows: 42svh 1fr;');
  });
});
