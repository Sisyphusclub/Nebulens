import { afterEach, describe, expect, it, vi } from 'vitest';

import { scrollToGenerationBatch } from '@/utils/generationScroll';

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('scrollToGenerationBatch', () => {
  it('centres the matching batch and reports success', () => {
    document.body.innerHTML =
      '<article data-generation-batch="a"></article><article data-generation-batch="b"></article>';
    const target = document.querySelector<HTMLElement>('[data-generation-batch="b"]')!;
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;

    expect(scrollToGenerationBatch('b', 'auto')).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' });
  });

  it('reports failure when the batch is not rendered', () => {
    expect(scrollToGenerationBatch('missing')).toBe(false);
  });

  it('skips smooth scrolling when reduced motion is preferred', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' })),
    );
    document.body.innerHTML = '<article data-generation-batch="a"></article>';
    const target = document.querySelector<HTMLElement>('[data-generation-batch="a"]')!;
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;

    scrollToGenerationBatch('a');
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' });
  });
});
