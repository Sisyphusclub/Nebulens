import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return baseStyles.match(new RegExp(`^${escaped}\\s*\\{([^}]+)\\}`, 'm'))?.[1] ?? '';
}

describe('landing skill cards', () => {
  it('set each caption on a frosted glass strip so it reads on light images too', () => {
    const body = rule('.landing-skills__body');

    expect(body).toContain('bottom: 0;');
    expect(body).toContain('background: rgb(10 12 18 / 0.46);');
    expect(body).toContain('backdrop-filter: blur(14px) saturate(1.3);');
    expect(body).toContain('border-top: 1px solid rgb(255 255 255 / 0.1);');
  });

  it('use the same near-white icons as the skill capsules', () => {
    expect(rule('.landing-skills__title svg')).toContain('color: rgb(244 246 250 / 0.9);');
  });
});

describe('landing skill cards on phones', () => {
  it('keep only the title line so the caption strip does not cover half the image', () => {
    const phone = baseStyles.slice(
      baseStyles.indexOf('/* Phones: narrow two-column cards keep one caption line. */'),
    );
    const rule = phone.match(/@media \(max-width: 560px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

    expect(rule).toMatch(
      /\.landing-skills__description:not\(\.landing-showcase__prompt\),\s*\.landing-showcase__meta\s*\{\s*display: none;/,
    );
    expect(rule).toMatch(/\.landing-skills__body\s*\{[^}]*padding: 8px 10px;/);
  });
});
