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
  it('has a light blue-to-violet gradient of its own, apart from the accent', () => {
    expect(tokens).toContain('--ai-from: #9ec3ff;');
    expect(tokens).toContain('--ai-to: #cba9ff;');
    expect(tokens).toContain(
      '--ai-gradient: linear-gradient(120deg, var(--ai-from) 0%, var(--ai-to) 100%);',
    );
    // A solid tone between the two, for text on its wash and where a gradient cannot go.
    expect(tokens).toContain('--ai: #b4b6ff;');
    expect(tokens).toMatch(/--ai-wash: linear-gradient\(/);
    expect(tokens).not.toContain('--ai: var(--text-1);');
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

  it('writes the AI badge in the gradient, and sets the skill pill and polishing on its wash', () => {
    const badge = rule('.ai-insight__badge');
    expect(badge).toContain('background: var(--ai-gradient);');
    expect(badge).toContain('-webkit-background-clip: text;');
    expect(badge).toContain('background-clip: text;');
    expect(badge).toContain('color: transparent;');
    expect(rule('.ai-insight__badge svg')).toContain(GRADIENT_STROKE);
    const pill = rule('.landing-composer [data-skill-id]');
    expect(pill).toContain('background: var(--ai-wash);');
    expect(pill).toContain('color: var(--ai);');
    const enhance = rule('.ai-insight .ai-insight__action--enhance');
    expect(enhance).toContain('border-color: var(--ai-line);');
    expect(enhance).toContain('background: var(--ai-wash);');
    expect(enhance).toContain('color: var(--ai);');
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

  it('fills Agent mode once chosen, and the buttons that hand work to the Agent, with it', () => {
    const mode = rule(".agent-chat-input__mode--selected[data-mode='agent']");
    expect(mode).toContain('background: var(--ai-wash);');
    expect(mode).toContain('color: var(--ai);');
    expect(rule(".agent-chat-input__mode--selected[data-mode='agent'] svg")).toContain(
      GRADIENT_STROKE,
    );
    // Its name is written in the gradient itself, the wash staying on the button.
    expect(rule(".agent-chat-input__mode--selected[data-mode='agent'] > span")).toContain(
      'background-clip: text;',
    );
    // Sending in Agent mode, sending from the Agent's panel, and starting its plan.
    const handOver =
      baseStyles.match(
        /\.agent-chat-input\[data-mode='agent'\] \.agent-chat-input__submit:not\(:disabled\),\n\.agent-panel \.agent-composer \.agent-chat-input__submit:not\(:disabled\),\n\.agent-plan \.agent-plan__start:not\(:disabled\) \{([^}]+)\}/,
      )?.[1] ?? '';
    expect(handOver).toContain('background: var(--ai-gradient);');
    expect(handOver).toContain('color: var(--on-ai);');
  });

  it('turns the asset AI search on in its wash, while other toggles keep the accent', () => {
    const on = rule(".operational-toolbar .asset-ai-toggle[aria-pressed='true']");
    expect(on).toContain('border-color: var(--ai-line);');
    expect(on).toContain('background: var(--ai-wash);');
    expect(on).toContain('color: var(--ai);');
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
