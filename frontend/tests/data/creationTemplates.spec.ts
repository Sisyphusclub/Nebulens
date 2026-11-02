import { describe, expect, it } from 'vitest';

import manifest from '@/data/creationTemplates.json';
import { CREATION_TEMPLATES, templatesAcrossCategories } from '@/data/creationTemplates';

it('gives every template a Chinese title and keeps the original English one', () => {
  expect(CREATION_TEMPLATES).toHaveLength(manifest.length);
  CREATION_TEMPLATES.forEach((template, index) => {
    expect(template.title).toMatch(/[一-鿿]/u);
    expect(template.englishTitle).toBe(manifest[index]?.title);
  });
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
