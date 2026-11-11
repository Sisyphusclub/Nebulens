import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');
const MODES = '.agent-chat-input.agent-chat-input--modes';
/** The composer as both pages show it, inside the glass frame. */
const GLASS = '.liquid-glass-frame > .agent-chat-input.generation-composer';

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
  it('starts the reference images, the text beside them and the toolbar on one left edge', () => {
    expect(rule(`${MODES} .agent-chat-input__surface`)).toContain(
      '--composer-inset: var(--space-3);',
    );
    expect(rule(`${MODES} .agent-chat-input__body`)).toContain(
      'padding: var(--space-3) var(--composer-inset) 0;',
    );
    expect(rule(`${MODES} .agent-chat-input__toolbar`)).toContain(
      'padding: 0 var(--composer-inset);',
    );
    // Inside the row neither column adds an inset of its own.
    expect(rule(`${MODES} .agent-chat-input__references`)).toContain(
      'padding: 0 0 var(--space-3);',
    );
    expect(rule(`${MODES} .agent-chat-input__textarea`)).toContain(
      'padding: 2px 0 var(--space-3) !important;',
    );
    // The streaming example starts exactly where typed text does.
    const example = rule(
      `${MODES} .agent-chat-input__editor > .agent-chat-input__streaming-placeholder`,
    );
    expect(example).toContain('top: 2px;');
    expect(example).toContain('left: 0;');
    expect(example).toContain('line-height: 1.5;');
  });

  it('sets the text at the top of the box, beside the reference images', () => {
    const body = rule(`${MODES} .agent-chat-input__body`);
    expect(body).toContain('display: flex;');
    expect(body).toContain('align-items: flex-start;');
    expect(rule(`${MODES} .agent-chat-input__editor`)).toContain('flex: 1 1 0;');
    // Many images wrap inside their own column instead of pushing the text off the row.
    const strip = rule(`${MODES} .agent-chat-input__references`);
    expect(strip).toContain('max-width: min(292px, 40%);');
    expect(strip).toContain('flex: 0 0 auto;');
    expect(rule(`${MODES} .agent-chat-input__reference-row`)).toContain('flex-wrap: wrap;');
  });

  it('answers the pointer: a text cursor, a brighter edge, then an accent ring and caret', () => {
    expect(rule(`${MODES} .agent-chat-input__body`)).toContain('cursor: text;');
    expect(rule(`${GLASS}:hover`)).toContain('0 0 0 1px var(--line-3)');
    const focused = rule(`${GLASS}.agent-chat-input--focused`);
    expect(focused).toContain('0 0 0 1px var(--accent)');
    expect(focused).toContain('0 0 0 4px var(--accent-soft)');
    // The glass highlights stay under the ring in every state, so the ring can fade in.
    for (const state of [GLASS, `${GLASS}:hover`, `${GLASS}.agent-chat-input--focused`]) {
      expect(rule(state)).toContain('var(--composer-glass)');
    }
    expect(rule(`${MODES} .agent-chat-input__textarea`)).toContain('caret-color: var(--accent);');
    // The home page used to hide the caret of an empty box.
    expect(flat).not.toContain('caret-color: transparent');
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
    // Beside a narrow column images would squeeze the words, so they go under the text.
    expect(phone).toMatch(/\.agent-chat-input__body \{\s*flex-wrap: wrap;/);
    expect(phone).toMatch(
      /\.agent-chat-input__references--filled \{\s*order: 1;\s*max-width: none;\s*flex: 1 0 100%;/,
    );
  });
});
