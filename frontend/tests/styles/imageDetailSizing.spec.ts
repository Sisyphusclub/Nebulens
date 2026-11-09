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

describe('image detail panel', () => {
  it('sizes the prompt to its text, scrolling only when a long one runs out of room', () => {
    const desktop = normalizeCss(baseStyles);

    expect(desktop).toContain(
      '.image-detail__body-content { display: flex; flex-direction: column; gap: 10px; }',
    );
    expect(desktop).toContain(
      '.image-detail__prompt { flex: 0 1 auto; min-height: 72px; max-height: none; }',
    );
    expect(ruleBody(baseStyles, '.image-detail__prompt')).toContain('font-size: 13px;');
  });

  it('keeps the title small and pairs the secondary actions under the main one', () => {
    expect(ruleBody(baseStyles, '.image-detail__body h2')).toContain('font-size: 15px;');
    expect(ruleBody(baseStyles, '.detail-actions--stack')).toContain('flex-wrap: wrap;');
    expect(ruleBody(baseStyles, '.detail-actions--stack .button--primary')).toContain(
      'flex: 1 1 calc(100% - 48px);',
    );
    expect(ruleBody(baseStyles, '.detail-actions--stack .button--danger')).toContain(
      'width: 40px;',
    );
  });
});

describe('image detail surface', () => {
  it('matches the generation panel instead of a flat card with square controls', () => {
    const surface = ruleBody(baseStyles, '.template-detail-modal.template-detail-modal');

    expect(surface).toContain('background: var(--surface-floating);');
    expect(ruleBody(baseStyles, '.detail-actions--stack .button')).toContain(
      'border-radius: var(--radius-full);',
    );
    expect(ruleBody(baseStyles, '.image-detail__close .icon-button')).toContain(
      'border-radius: var(--radius-full);',
    );
  });

  it('shares its slate glass with the login, API key and confirm dialogs', () => {
    const floating = ruleBody(baseStyles, '.floating-surface');

    expect(floating).toContain('background: var(--surface-floating);');
    expect(floating).toContain('box-shadow: var(--shadow-floating);');
    expect(floating).toContain('--card: rgb(255 255 255 / 0.06);');
    for (const file of [
      'src/components/auth/LoginModal.tsx',
      'src/components/settings/ImageApiKeySettingsDialog.tsx',
      'src/components/common/ConfirmActionModal.tsx',
    ]) {
      expect(readFileSync(resolve(process.cwd(), file), 'utf8')).toContain(
        'className="floating-surface ',
      );
    }
  });
});

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
    expect(desktopModalRule).toContain('height: fit-content !important;');
    expect(desktopModalRule).toContain('max-height: calc(100svh - 2rem) !important;');
    // The dialog wraps the image at any ratio, so there is no letterbox inside it.
    expect(desktopContract).toContain(
      'height: max(var(--image-detail-min-height), calc(var(--image-detail-image-height) + 24px));',
    );
    expect(desktopContract).toContain(
      'width: calc(var(--image-detail-image-height) * var(--image-detail-image-ratio));',
    );
    expect(desktopContract).toContain('height: 100%;');
    expect(desktopContract).toContain('min-height: 0;');
    expect(desktopContract).toContain('display: flex;');
    expect(desktopContract).toContain('.image-detail__media');
    const mediaRule = ruleBody(baseStyles, '.image-detail__media');
    const imageRule = ruleBody(baseStyles, '.image-detail__media img');
    const promptRule = ruleBody(baseStyles, '.image-detail__prompt');

    expect(mediaRule).toContain('flex: 0 1 auto;');
    expect(mediaRule).toContain('height: 100%;');
    expect(mediaRule).toContain('width: auto;');
    expect(mediaRule).toContain('display: flex;');
    expect(mediaRule).toContain('align-items: center;');
    expect(mediaRule).toContain('justify-content: center;');
    expect(mediaRule).toContain('overflow: hidden;');
    expect(imageRule).toContain('width: auto;');
    expect(imageRule).toContain('height: 100%;');
    expect(imageRule).toContain('max-width: calc(92vw - 380px);');
    expect(imageRule).toContain('max-height: 100%;');
    expect(imageRule).toContain('border-radius: var(--radius-lg);');
    expect(imageRule).toContain('box-shadow: none;');
    expect(imageRule).toContain('object-fit: contain;');
    expect(desktopContract).toContain('aspect-ratio: auto;');
    expect(baseStyles).toContain('.image-detail__body-content');
    expect(baseStyles).toContain('width: 340px;');
    expect(promptRule).toContain('max-width: 100%;');
    expect(promptRule).toContain('overflow-wrap: anywhere;');
    expect(promptRule).toContain('white-space: pre-wrap;');
    expect(promptRule).toContain('word-break: break-word;');
    expect(mobileContract).toContain('flex-direction: column;');
    expect(mobileContract).toContain('height: min(55svh, 72vw);');
    expect(mobileContract).toContain('width: 100%;');
    // The fixed desktop side panel must not squeeze the image out of the mobile column.
    expect(mobileContract).toContain('flex: 0 0 auto;');
    expect(mobileContract).toContain('flex: 1 1 auto;');
    expect(mobileContract).toContain('height: auto;');
    expect(mobileContract).not.toContain('min-height: 42vh;');
    expect(mobileContract).not.toContain('grid-template-rows: 42svh 1fr;');
    expect(narrowContract).toContain('.image-detail {');
    expect(narrowContract).toContain('grid-template-rows: auto auto;');
    expect(narrowContract).toContain('padding: 0;');
    expect(narrowContract).not.toContain('grid-template-rows: 42svh 1fr;');
  });
});
