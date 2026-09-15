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
  it('keeps the modal and its split panes bounded while allowing detail scrolling', () => {
    const modalRule = ruleBody(baseStyles, '.image-detail-modal');
    const detailRule = ruleBody(baseStyles, '.image-detail');
    const mediaRule = ruleBody(baseStyles, '.image-detail__media');
    const imageRule = ruleBody(baseStyles, '.image-detail__media img');
    const bodyRule = ruleBody(baseStyles, '.image-detail__body');
    const bodyContentRule = ruleBody(baseStyles, '.image-detail__body-content');
    const actionsRule = ruleBody(baseStyles, '.detail-actions');

    expect(modalRule).toContain('width: 90vw !important;');
    expect(modalRule).toContain('max-width: 1024px !important;');
    expect(modalRule).toContain('height: 85vh !important;');
    expect(modalRule).toContain('min-height: 600px !important;');
    expect(modalRule).toContain('max-height: 780px !important;');
    expect(detailRule).toContain('display: flex;');
    expect(detailRule).toContain('min-height: 0;');
    expect(detailRule).toContain('height: 100%;');
    expect(mediaRule).toContain('display: flex;');
    expect(mediaRule).toContain('min-width: 0;');
    expect(mediaRule).toContain('min-height: 0;');
    expect(mediaRule).toContain('align-items: center;');
    expect(mediaRule).toContain('justify-content: center;');
    expect(mediaRule).toContain('background: rgb(0 0 0 / 0.4);');
    expect(mediaRule).toContain('overflow: hidden;');
    expect(imageRule).toContain('width: auto;');
    expect(imageRule).toContain('height: auto;');
    expect(imageRule).toContain('max-width: 100%;');
    expect(imageRule).toContain('max-height: 100%;');
    expect(imageRule).toContain('object-fit: contain;');
    expect(bodyRule).toContain('width: 340px;');
    expect(bodyRule).toContain('flex-shrink: 0;');
    expect(bodyRule).toContain('min-height: 0;');
    expect(bodyRule).toContain('overflow: hidden;');
    expect(bodyContentRule).toContain('flex: 1 1 auto;');
    expect(bodyContentRule).toContain('min-height: 0;');
    expect(bodyContentRule).toContain('overflow-y: auto;');
    expect(actionsRule).toContain('flex-shrink: 0;');
    expect(actionsRule).toContain('margin-top: auto;');
    expect(actionsRule).toContain('padding-top: 12px;');
  });
});
