import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');
const tokens = read('src/styles/tokens.css');
const baseStyles = read('src/styles/base.css');
const shell = read('index.html');

function token(name: string): string {
  return tokens.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim() ?? '';
}

describe('palette', () => {
  it('steps the surfaces through neutral greys, the sidebar and cards a shade above the page', () => {
    expect(token('bg-page')).toBe('#0c0c0c');
    expect(token('bg-sidebar')).toBe('#161616');
    expect(token('bg-surface')).toBe('#161616');
    expect(token('bg-surface-hover')).toBe('#222222');
    for (const name of [
      'bg-media',
      'bg-page',
      'bg-sidebar',
      'bg-surface',
      'bg-surface-hover',
      'bg-floating',
      'bg-floating-end',
      'text-1',
      'primary',
      'on-primary',
    ]) {
      // The same two digits three times over: a grey with no cast.
      expect(token(name), name).toMatch(/^#([0-9a-f]{2})\1\1$/);
    }
  });

  it('writes the text as white at four strengths', () => {
    expect(token('text-1')).toBe('#eeeeee');
    expect(token('text-2')).toBe('rgb(255 255 255 / 0.72)');
    expect(token('text-3')).toBe('rgb(255 255 255 / 0.52)');
    expect(token('text-4')).toBe('rgb(255 255 255 / 0.36)');
  });

  it('has one accent, orange, and no blue outside the logo ribbon', () => {
    expect(token('accent')).toBe('#f76a00');
    expect(token('accent-soft')).toBe('rgb(247 106 0 / 0.16)');
    expect(tokens).not.toContain('--glow-cool');
    expect(baseStyles).not.toContain('var(--glow-cool)');
  });

  it('paints the window the page grey before the stylesheet arrives', () => {
    expect(shell).toContain('background: #0c0c0c;');
  });

  it('writes no grey with a blue cast by hand', () => {
    const cool = [...baseStyles.matchAll(/rgb\((\d+) (\d+) (\d+)/g)]
      .filter(([, red, , blue]) => Number(blue) > Number(red))
      .map(([literal]) => literal);
    expect(cool).toEqual([]);
  });
});
