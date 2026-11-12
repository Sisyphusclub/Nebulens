import { expect, it } from 'vitest';

import promptsZh from '@/data/creationTemplatePromptsZh.json';
import manifest from '@/data/creationTemplates.json';
import { CREATION_TEMPLATES } from '@/data/creationTemplates';

it('gives every template a Chinese title and keeps the original English one', () => {
  expect(CREATION_TEMPLATES).toHaveLength(manifest.length);
  CREATION_TEMPLATES.forEach((template, index) => {
    expect(template.title).toMatch(/[一-鿿]/u);
    expect(template.englishTitle).toBe(manifest[index]?.title);
  });
});

it('shows every prompt in Chinese and keeps the original for search', () => {
  CREATION_TEMPLATES.forEach((template, index) => {
    expect(template.originalPrompt).toBe(manifest[index]?.prompt);
    expect(template.prompt).toMatch(/[一-鿿]{4}/u);
  });
});

it('leaves text meant to appear in the image exactly as the original has it', () => {
  const lab = CREATION_TEMPLATES.find(
    (item) => item.id === 'gpt-image2-biophilic-biotech-lab-render',
  );

  expect(lab?.prompt).toContain('亲自然');
  for (const text of ['"HELIX BIO LAB 03"', '"Clean Zone"', '"22 C"']) {
    expect(lab?.prompt).toContain(text);
  }
});

it('translates only templates that exist', () => {
  const ids = new Set(manifest.map((item) => item.id));
  Object.keys(promptsZh).forEach((id) => expect(ids.has(id)).toBe(true));
});
