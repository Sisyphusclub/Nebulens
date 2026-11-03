import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

describe('streaming placeholder style contract', () => {
  it('lets clicks fall through to the prompt editor underneath', () => {
    // The standalone base rule, not the descendant overrides elsewhere in the file.
    const start = baseStyles.indexOf('\n.agent-chat-input__streaming-placeholder {');
    const rule = baseStyles.slice(start, baseStyles.indexOf('}', start));

    expect(start).toBeGreaterThanOrEqual(0);
    expect(rule).toContain('pointer-events: none;');
    expect(rule).not.toContain('cursor:');
  });

  it('reads as a hint, not as text already typed into the box', () => {
    const text =
      baseStyles.match(/\n\.agent-chat-input__streaming-placeholder-text \{([^}]+)\}/)?.[1] ?? '';
    const caret =
      baseStyles.match(/\n\.agent-chat-input__streaming-placeholder-caret \{([^}]+)\}/)?.[1] ?? '';

    // A dim flat grey, not the bright gradient real-looking text had.
    expect(text).toContain('color: rgb(240 243 248 / 0.4);');
    expect(text).not.toContain('gradient');
    // A blinking caret made it look as if the box had focus and content.
    expect(caret).toContain('display: none;');
  });
});
