import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, it } from 'vitest';

const baseStyles = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return baseStyles.match(new RegExp(`^${escaped}\\s*\\{([^}]+)\\}`, 'm'))?.[1] ?? '';
}

it('keeps a failed generation’s text inside its card, however long the message or id', () => {
  const content = rule('.generation-error-card__content');
  // The request id does not wrap, so it once stretched the content past the card's edge,
  // where the card cut off both the message and the id.
  expect(content).toContain('min-width: 0;');
  expect(content).toContain('max-width: min(360px, 100%);');
  expect(content).toContain('overflow-wrap: anywhere;');
  // The id ends in an ellipsis instead, the whole of it in its tooltip.
  expect(rule('.generation-error-card__request')).toContain('text-overflow: ellipsis;');
});

it('lets a failed card grow taller than a wide picture would be, rather than cut its text', () => {
  // A box with a ratio grows to fit what is in it only while it does not clip: clipped, a
  // 16:9 card stayed 149px tall where its text and button need 224px.
  const card = rule('.generation-error-card');
  expect(card).toContain('place-items: center;');
  expect(card).not.toContain('overflow: hidden;');
});
