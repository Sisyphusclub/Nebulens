import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const baseStyles = read('src/styles/base.css');
const tokens = read('src/styles/tokens.css');

/** Every rule written for exactly this selector, or ending a selector list with it. */
function rules(selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...baseStyles.matchAll(new RegExp(`^${escaped}\\s*\\{([^}]+)\\}`, 'gm'))].map(
    (match) => match[1] ?? '',
  );
}
const rule = (selector: string): string => rules(selector).join('\n');

const ORANGE = /--accent|--glow-warm|--brand-orange/;

describe('what the AI says and does', () => {
  it('has a plain light colour of its own, apart from the accent', () => {
    expect(tokens).toContain('--ai: var(--text-1);');
    expect(tokens).toContain('--ai-soft: rgb(255 255 255 / 0.14);');
    expect(tokens).toContain('--ai-line: rgb(255 255 255 / 0.32);');
  });

  it.each([
    // The strip under the composer: its badge, the chip that opens similar work, polishing.
    '.ai-insight__badge',
    '.ai-insight .ai-insight__fact--toggle',
    '.ai-insight .ai-insight__action--enhance',
    '.ai-insight .ai-insight__action--enhance:hover:not(:disabled)',
    // Similar work the AI found.
    '.landing-recommendations__reason',
    '.landing-recommendations .landing-recommendations__use',
    // A skill in the composer: its pill in the text, its card underneath.
    '.landing-composer [data-skill-id]',
    '.landing-skill-card__title svg',
    '.landing-skill-card .landing-skill-card__example',
    // The example the composer writes out, and where the writer types.
    '.agent-chat-input__streaming-placeholder-text',
    '.agent-chat-input__streaming-placeholder-caret',
    '.agent-chat-input.agent-chat-input--modes .agent-chat-input__textarea',
    '.home-quick-composer .home-quick-composer__input',
    // Work in progress and work done on the generate page.
    '.generation-history-panel__eyebrow',
    '.generation-history-pending',
    '.generation-history-pending__icon',
    ".studio-toolbar-status__dot[data-active='true']",
    ".studio-toolbar-status[data-active='true']",
    '.session-batch__completion',
    '.session-batch__completion svg',
    '.studio-agent-input .agent-chat-input__submit',
    '.studio-agent-input .agent-chat-input__submit:hover:not(:disabled)',
  ])('%s is not orange', (selector) => {
    const bodies = rules(selector);
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) expect(body).not.toMatch(ORANGE);
  });

  it('marks the AI badge, the skill pill and the search switch with its own colour', () => {
    expect(rule('.ai-insight__badge')).toContain('color: var(--ai);');
    const pill = rule('.landing-composer [data-skill-id]');
    expect(pill).toContain('background: var(--ai-soft);');
    expect(pill).toContain('color: var(--ai);');
    const enhance = rule('.ai-insight .ai-insight__action--enhance');
    expect(enhance).toContain('border-color: var(--ai-line);');
    expect(enhance).toContain('background: var(--ai-soft);');
  });

  it('turns the asset AI search on in that colour, while other toggles keep the accent', () => {
    const on = rule(".operational-toolbar .asset-ai-toggle[aria-pressed='true']");
    expect(on).toContain('border-color: var(--ai-line);');
    expect(on).toContain('background: var(--ai-soft);');
    expect(on).toContain('color: var(--ai);');
    const others =
      baseStyles.match(
        /\.operational-toolbar\s*:is\(\s*\.icon-button\.is-active,\s*\.icon-button\[aria-pressed='true'\]\s*\)\s*\{([^}]+)\}/,
      )?.[1] ?? '';
    expect(others).toContain('background: var(--accent-soft);');
    expect(others).toContain('color: var(--accent);');
  });

  it('names no accent in the composer’s own markup', () => {
    for (const file of ['composer.tsx', 'skills.tsx']) {
      expect(read(`src/components/premium/agent-chat-input/${file}`), file).not.toContain(
        'text-accent',
      );
    }
  });
});
