import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');
const tokens = read('src/styles/tokens.css');
const baseStyles = read('src/styles/base.css');
const entry = read('src/main.tsx');
const dependencies = Object.keys(
  (JSON.parse(read('package.json')) as { dependencies: Record<string, string> }).dependencies,
);

describe('typefaces', () => {
  it('sets the interface in Inter and headings in Poppins, with the system Chinese sans behind both', () => {
    for (const [name, first] of [
      ['sans', "'Inter Variable'"],
      ['display', "'Poppins'"],
    ] as const) {
      // :root and the Tailwind theme each spell the stack out: the two have to agree.
      const stacks = [...tokens.matchAll(new RegExp(`--font-${name}:([^;]+);`, 'g'))].map((match) =>
        (match[1] ?? '').replace(/\s+/g, ' ').trim(),
      );
      expect(stacks, name).toHaveLength(2);
      expect(stacks[0], name).toBe(stacks[1]);
      expect(stacks[0]?.startsWith(first), name).toBe(true);
      expect(stacks[0], name).toContain("'PingFang SC'");
    }
  });

  it('keeps a Song face for the home headline alone', () => {
    const stacks = [...tokens.matchAll(/--font-serif:([^;]+);/g)].map((match) =>
      (match[1] ?? '').replace(/\s+/g, ' ').trim(),
    );
    expect(stacks).toHaveLength(2);
    expect(stacks[0]).toBe(stacks[1]);
    // The web font first, then the Song faces a Mac or a Windows machine carries.
    expect(stacks[0]?.startsWith("'Noto Serif SC'")).toBe(true);
    expect(stacks[0]).toContain("'Songti SC'");
    // The wordmark, the sign-in title and every other heading stay in the display face.
    expect(baseStyles.match(/var\(--font-serif\)/g)).toHaveLength(1);
    expect(baseStyles).toMatch(/\.home-hero h1 \{[^}]*font-family: var\(--font-serif\);/);
  });

  it('loads the faces it uses and no others', () => {
    expect(entry).toContain("import '@fontsource-variable/inter';");
    for (const weight of [400, 500, 600]) {
      expect(entry).toContain(`import '@fontsource/poppins/${weight}.css';`);
    }
    expect(entry).toContain("import '@fontsource-variable/noto-serif-sc';");
    expect(dependencies.filter((name) => name.includes('fontsource')).sort()).toEqual([
      '@fontsource-variable/inter',
      '@fontsource-variable/noto-serif-sc',
      '@fontsource/poppins',
    ]);
  });
});
