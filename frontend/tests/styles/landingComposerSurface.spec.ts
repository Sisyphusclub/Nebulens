import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

describe('landing composer surface contract', () => {
  it('keeps pasted unbroken prompts inside the composer width', () => {
    const editorRule = baseStyles.match(/\.agent-chat-input__textarea\s*\{([^}]+)\}/)?.[1] ?? '';

    expect(editorRule).toContain('min-width: 0;');
    expect(editorRule).toContain('max-width: 100%;');
    expect(editorRule).toContain('overflow-x: hidden;');
    expect(editorRule).toContain('overflow-wrap: anywhere;');
    expect(editorRule).toContain('white-space: pre-wrap;');
    expect(editorRule).toContain('word-break: break-word;');
    expect(baseStyles).not.toMatch(
      /\.landing-composer-dock:not\(\.is-expanded\)\s+\.agent-chat-input__textarea\s*\{[^}]*white-space:\s*nowrap;/s,
    );
  });

  it('keeps the generation action after the controls in the desktop toolbar', () => {
    const sharedComposerStart = baseStyles.indexOf(
      '/* Shared image-generation composer contract for Discover and Generate. */',
    );
    const sharedComposerContract = baseStyles.slice(sharedComposerStart);

    expect(sharedComposerContract).toMatch(
      /\.generation-composer \.agent-chat-input__toolbar\s*\{[^}]*flex-wrap:\s*nowrap;/s,
    );
    expect(sharedComposerContract).toMatch(
      /\.generation-composer \.agent-chat-input__toolbar-group:first-child\s*\{[^}]*order:\s*0;/s,
    );
    expect(sharedComposerContract).toMatch(
      /\.generation-composer \.agent-chat-input__toolbar-content\s*\{[^}]*order:\s*1;[^}]*width:\s*auto;/s,
    );
    expect(sharedComposerContract).toMatch(
      /\.generation-composer \.agent-chat-input__toolbar-group--end\s*\{[^}]*order:\s*2;/s,
    );
  });

  it('uses fill-only custom selections without a persistent focus outline', () => {
    const triggerRule = baseStyles.match(/\.generation-custom-trigger\s*\{([^}]+)\}/)?.[1] ?? '';
    const optionRule = baseStyles.match(/\.generation-custom-option\s*\{([^}]+)\}/)?.[1] ?? '';
    const checkedRule =
      baseStyles.match(/\.generation-custom-option\[data-state='checked'\]\s*\{([^}]+)\}/)?.[1] ??
      '';
    const focusRule =
      baseStyles.match(
        /\.generation-custom-option:focus,\s*\.generation-custom-option:focus-visible\s*\{([^}]+)\}/,
      )?.[1] ?? '';
    const triggerFocusRule =
      baseStyles.match(
        /\.generation-custom-trigger:focus,\s*\.generation-custom-trigger:focus-visible\s*\{([^}]+)\}/,
      )?.[1] ?? '';

    expect(triggerRule).toContain('border: 0;');
    expect(optionRule).toContain('border: 0;');
    expect(checkedRule).not.toContain('border-color');
    expect(checkedRule).toContain('box-shadow: none;');
    expect(focusRule).toContain('outline: none !important;');
    expect(focusRule).toContain('box-shadow: none !important;');
    expect(triggerFocusRule).toContain('outline: none !important;');
    expect(triggerFocusRule).toContain('box-shadow: none !important;');
  });

  it('renders both composers as see-through liquid glass', () => {
    const glassStart = baseStyles.indexOf(
      '/* Liquid glass composer, shared by Discover and Generate:',
    );
    const glass = baseStyles.slice(
      glassStart,
      baseStyles.indexOf('/* Composer parity:', glassStart),
    );

    expect(glassStart).toBeGreaterThan(-1);
    // Light tint plus a light blur keeps the artwork wall visible through the composer.
    expect(glass).toContain('backdrop-filter: blur(14px) saturate(1.6);');
    expect(glass).toContain('rgb(255 255 255 / 0.13) 0 0 2px 1px inset');
    expect(glass).toContain('rgb(255 255 255 / 0.07) 0 0 8px 2px inset');
    // Chromium adds edge refraction; other engines keep the plain frosted glass.
    expect(glass).toMatch(
      /\[data-refraction='true'\][^{]*\{[^}]*backdrop-filter: url\(#liquid-glass-refraction\) blur\(14px\) saturate\(1\.6\);/s,
    );
    expect(glass).toContain('background: transparent !important;');
  });

  it('replaces the pointer-driven glow with an even rotating rim', () => {
    const glassStart = baseStyles.indexOf(
      '/* Liquid glass composer, shared by Discover and Generate:',
    );
    const glass = baseStyles.slice(
      glassStart,
      baseStyles.indexOf('/* Composer parity:', glassStart),
    );

    expect(glass).toMatch(
      /\.liquid-glass-frame > \.border-glow-card::before,[^{]*> \.edge-light\s*\{[^}]*display: none;/s,
    );
    expect(glass).toContain('@property --liquid-glass-rim-angle');
    expect(glass).toContain('conic-gradient(\n    from var(--liquid-glass-rim-angle)');
    expect(glass).toContain('animation: liquid-glass-rim-spin 6s linear infinite;');
    expect(glass).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*animation: none;/s);
    expect(baseStyles).not.toContain('border-glow-liquid-glass');
  });
});
