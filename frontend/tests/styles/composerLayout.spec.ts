import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');
const MODES = '.agent-chat-input.agent-chat-input--modes';

/** The stylesheet on one line, so a selector the formatter wrapped still reads as written. */
const flat = baseStyles.replace(/\s+/g, ' ');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return flat.match(new RegExp(`(?:^|[}{/] )${escaped} \\{([^}]+)\\}`))?.[1] ?? '';
}

/** The body of the composer's container query for boxes up to `maxWidth` wide. */
function tier(maxWidth: number): string {
  const start = flat.indexOf(`@container composer (max-width: ${maxWidth}px) {`);
  return start === -1 ? '' : flat.slice(start, flat.indexOf('} }', start));
}

describe('composer with modes', () => {
  it('puts the reference images, the text and the toolbar on one left edge', () => {
    expect(rule(`${MODES} .agent-chat-input__surface`)).toContain(
      '--composer-inset: var(--space-3);',
    );
    expect(rule(`${MODES} .agent-chat-input__references`)).toContain(
      'padding: var(--space-3) var(--composer-inset) 0;',
    );
    expect(rule(`${MODES} .agent-chat-input__textarea`)).toContain(
      'padding-inline: var(--composer-inset) !important;',
    );
    expect(rule(`${MODES} .agent-chat-input__toolbar`)).toContain(
      'padding: 0 var(--composer-inset);',
    );
    // The streaming example starts exactly where typed text does.
    const example = rule(
      `${MODES} .agent-chat-input__editor > .agent-chat-input__streaming-placeholder`,
    );
    expect(example).toContain('left: var(--composer-inset);');
    expect(example).toContain('line-height: 1.5;');
  });

  it('keeps the modes, the settings, the skill library and the send button on a single row', () => {
    expect(rule(`${MODES} .agent-chat-input__toolbar`)).toContain('flex-wrap: nowrap;');
    const settings = rule(`${MODES} .agent-chat-input__toolbar-content`);
    expect(settings).toContain('order: 0;');
    expect(settings).toContain('flex: 0 1 auto;');
    // The note and the send button stay together at the right end.
    expect(rule(`${MODES} .agent-chat-input__toolbar-group--end`)).toContain('margin-left: auto;');
    // Every control on the row is one height.
    expect(rule('.agent-chat-input__library-trigger')).toContain('height: var(--control-height);');
  });

  it('gives up the mode icons, then the note, then the single row as the box narrows', () => {
    expect(rule(MODES)).toContain('container: composer / inline-size;');
    expect(tier(1139)).toMatch(/\.agent-chat-input__mode svg \{\s*display: none;/);
    expect(tier(1019)).toMatch(/\.agent-chat-input__submit-note \{\s*display: none;/);
    const twoRows = tier(904);
    expect(twoRows).toMatch(/\.agent-chat-input__toolbar \{\s*flex-wrap: wrap;/);
    expect(twoRows).toMatch(
      /\.agent-chat-input__toolbar-content \{\s*order: -1;\s*flex: 1 0 100%;/,
    );
  });

  it('fits a phone: the library as an icon beside the settings, the modes beside send', () => {
    const phone = tier(559);
    expect(phone).toContain('--composer-inset: var(--space-2);');
    expect(phone).toMatch(/\.agent-chat-input__library-trigger span \{\s*display: none;/);
    expect(phone).toMatch(/\.agent-chat-input__mode-badge \{\s*display: none;/);
  });
});
