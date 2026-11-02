import { describe, expect, it } from 'vitest';

import promptsZh from '@/data/creationTemplatePromptsZh.json';
import manifest from '@/data/creationTemplates.json';
import { CREATION_TEMPLATES, templatesAcrossCategories } from '@/data/creationTemplates';

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

describe('templatesAcrossCategories', () => {
  it('takes one template from each category in turn, anime last in each round', () => {
    const categories = new Set(CREATION_TEMPLATES.map((template) => template.category));
    const picked = templatesAcrossCategories(categories.size + 2);

    expect(picked).toHaveLength(categories.size + 2);
    expect(
      new Set(picked.slice(0, categories.size).map((template) => template.category)).size,
    ).toBe(categories.size);
    expect(picked[categories.size - 1]?.category).toBe('动漫漫画');
    expect(new Set(picked.map((template) => template.id)).size).toBe(picked.length);
  });
});
