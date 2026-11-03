import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

describe('streaming placeholder style contract', () => {
  it('lets clicks on empty space fall through to the prompt editor underneath', () => {
    // The standalone base rule, not the descendant overrides elsewhere in the file.
    const start = baseStyles.indexOf('\n.agent-chat-input__streaming-placeholder {');
    const rule = baseStyles.slice(start, baseStyles.indexOf('}', start));
    const clickable =
      baseStyles.match(
        /\n\.agent-chat-input__streaming-placeholder\[data-active='true'\]\s+\.agent-chat-input__streaming-placeholder-text \{([^}]+)\}/,
      )?.[1] ?? '';

    expect(start).toBeGreaterThanOrEqual(0);
    expect(rule).toContain('pointer-events: none;');
    // Only the showing example text takes the click that fills it in; once the user
    // has typed, the hidden example must not swallow clicks on their text.
    expect(clickable).toContain('pointer-events: auto;');
    expect(clickable).toContain('cursor: pointer;');
  });

  it('streams the example in the brand gradient without a fake caret', () => {
    const text =
      baseStyles.match(/\n\.agent-chat-input__streaming-placeholder-text \{([^}]+)\}/)?.[1] ?? '';
    const caret =
      baseStyles.match(/\n\.agent-chat-input__streaming-placeholder-caret \{([^}]+)\}/)?.[1] ?? '';

    expect(text).toContain('linear-gradient(90deg, #f3f5fa 0%, #c5d9f2 52%, #efc9ac 100%)');
    expect(text).toContain('background-clip: text;');
    // A blinking caret made it look as if the box had focus and content.
    expect(caret).toContain('display: none;');
  });
});
