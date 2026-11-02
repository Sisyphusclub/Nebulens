import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');
const controls = readFileSync(
  resolve(process.cwd(), 'src/components/generation/GenerationComposerControls.tsx'),
  'utf8',
);

describe('generation control panels', () => {
  it('render as Wanxiang-style glass panels', () => {
    const start = baseStyles.indexOf('/* Composer popovers (model menu, custom settings):');
    const panel = baseStyles.slice(start, baseStyles.indexOf('\n}\n', start));

    expect(start).toBeGreaterThan(-1);
    // The select menu ships !important utilities, so the panel overrides them from
    // the same cascade layer with a doubled class.
    expect(panel).toContain('@layer utilities');
    expect(panel).toContain('.generation-control-panel.generation-control-panel {');
    expect(panel).toContain('border-radius: 20px !important;');
    expect(panel).toContain('backdrop-filter: blur(24px) saturate(1.3);');
    expect(controls).not.toContain('!bg-popover');
  });

  it('draws option groups as segmented tracks with a light selected pill', () => {
    const track = baseStyles.match(/^\.generation-custom-options\s*\{([^}]+)\}/m)?.[1] ?? '';
    const checked =
      baseStyles.match(/^\.generation-custom-option\[data-state='checked'\]\s*\{([^}]+)\}/m)?.[1] ??
      '';

    expect(track).toContain('border-radius: 16px;');
    expect(track).toContain('background: rgb(255 255 255 / 0.05);');
    expect(checked).toContain('background: rgb(255 255 255 / 0.14);');
    expect(checked).toContain('color: #fff;');
  });
});
