import { expect, it } from 'vitest';

import manifest from '@/data/creationTemplates.json';
import { CREATION_TEMPLATES } from '@/data/creationTemplates';

it('gives every template a Chinese title and keeps the original English one', () => {
  expect(CREATION_TEMPLATES).toHaveLength(manifest.length);
  CREATION_TEMPLATES.forEach((template, index) => {
    expect(template.title).toMatch(/[一-鿿]/u);
    expect(template.englishTitle).toBe(manifest[index]?.title);
  });
});
