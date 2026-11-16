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
const GRADIENT_STROKE = 'stroke: url(#ai-gradient) var(--ai);';

describe('what the AI says and does', () => {
  it('has a pale pearl of its own, a light blue turning lilac, apart from the accent', () => {
    expect(tokens).toContain('--ai-from: #bfd0ff;');
    expect(tokens).toContain('--ai-to: #d7c4ff;');
    expect(tokens).toContain(
      '--ai-gradient: linear-gradient(120deg, var(--ai-from) 0%, var(--ai-to) 100%);',
    );
    // A solid tone between the two, where a gradient cannot go.
    expect(tokens).toContain('--ai: #ccc9fb;');
    expect(tokens).toMatch(/--ai-wash: linear-gradient\(/);
    // Handing work to the Agent fills a button nearly white, the tint only a sheen on it.
    expect(tokens).toMatch(/--ai-pearl: linear-gradient\(/);
    expect(tokens).not.toContain('--ai: var(--text-1);');
  });

  it('writes no word in its colour or a gradient: the tint is in icons, washes and lines', () => {
    for (const selector of [
      '.ai-insight__badge',
      '.ai-insight .ai-insight__fact--toggle',
      '.ai-insight .ai-insight__action--enhance',
      '.ai-insight .ai-insight__action--enhance:hover:not(:disabled)',
      '.landing-recommendations .landing-recommendations__use',
      '.landing-composer [data-skill-id]',
      ".operational-toolbar .asset-ai-toggle[aria-pressed='true']",
      ".agent-chat-input__mode--selected[data-mode='agent']",
    ]) {
      const body = rule(selector);
      expect(body, selector).toContain('color: var(--text-1);');
      expect(body, selector).not.toContain('background-clip: text');
    }
    expect(rule(".agent-chat-input__mode--selected[data-mode='agent'] > span")).toBe('');
  });

  it('draws its icons in the same gradient, defined once in the page', () => {
    expect(read('index.html')).toMatch(/<linearGradient\s+id="ai-gradient"/);
    // The stops take the tokens, so the two colours live in one place.
    expect(baseStyles).toMatch(/#ai-gradient stop:first-child \{\s*stop-color: var\(--ai-from\);/);
    expect(baseStyles).toMatch(/#ai-gradient stop:last-child \{\s*stop-color: var\(--ai-to\);/);
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
    // Agent mode once chosen, the Agent's own panel, and its plan's go-ahead.
    ".agent-chat-input__mode--selected[data-mode='agent']",
    '.agent-panel__mark',
    '.agent-plan .agent-plan__start:not(:disabled)',
  ])('%s is not orange', (selector) => {
    const bodies = rules(selector);
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) expect(body).not.toMatch(ORANGE);
  });

  it('marks the AI badge by its icon, and sets the skill pill and polishing on its wash', () => {
    expect(rule('.ai-insight__badge svg')).toContain(GRADIENT_STROKE);
    expect(rule('.landing-composer [data-skill-id]')).toContain('background: var(--ai-wash);');
    const enhance = rule('.ai-insight .ai-insight__action--enhance');
    expect(enhance).toContain('border-color: var(--ai-line);');
    expect(enhance).toContain('background: var(--ai-wash);');
    expect(rule('.ai-insight .ai-insight__action--enhance svg')).toContain(GRADIENT_STROKE);
  });

  it('draws in the gradient what it reports while it works and when it is done', () => {
    expect(rule(".studio-toolbar-status__dot[data-active='true']")).toContain(
      'background: var(--ai-gradient);',
    );
    expect(rule('.agent-chat-input__streaming-placeholder-caret')).toContain(
      'background: var(--ai-gradient);',
    );
    for (const selector of [
      '.generation-history-pending__icon svg',
      '.session-batch__completion svg',
      '.landing-skill-card__title svg',
      '.agent-panel__mark svg',
      '.generation-empty-state__sparkle',
    ]) {
      expect(rule(selector), selector).toContain(GRADIENT_STROKE);
    }
  });

  it('sets Agent mode once chosen on its wash, and gives every send button a pearl sheen', () => {
    expect(rule(".agent-chat-input__mode--selected[data-mode='agent']")).toContain(
      'background: var(--ai-wash);',
    );
    expect(rule(".agent-chat-input__mode--selected[data-mode='agent'] svg")).toContain(
      GRADIENT_STROKE,
    );
    // Sending in any mode on any page, and starting the Agent's plan, look the same; stopping a
    // run keeps its own look, and a send that cannot go yet keeps the page's dim one.
    const send =
      baseStyles.match(
        /\.agent-chat-input \.agent-chat-input__submit:not\(:disabled\):not\(\.agent-chat-input__submit--stop\),\n\.agent-plan \.agent-plan__start:not\(:disabled\) \{([^}]+)\}/,
      )?.[1] ?? '';
    expect(send).toContain('background: var(--ai-pearl);');
    expect(send).toContain('color: var(--on-ai);');
    // No coloured glow round it: it is lit and shaded like the other light buttons.
    expect(send).not.toContain('var(--ai)');
    expect(baseStyles).not.toContain("[data-mode='agent'] .agent-chat-input__submit");
  });

  it('turns the asset AI search on in its wash, while other toggles keep the accent', () => {
    const on = rule(".operational-toolbar .asset-ai-toggle[aria-pressed='true']");
    expect(on).toContain('border-color: var(--ai-line);');
    expect(on).toContain('background: var(--ai-wash);');
    expect(rule(".operational-toolbar .asset-ai-toggle[aria-pressed='true'] svg")).toContain(
      GRADIENT_STROKE,
    );
    expect(
      rule(".operational-toolbar .asset-ai-toggle[aria-pressed='true']:hover:not(:disabled)"),
    ).toContain('background: var(--ai-wash-strong);');
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
