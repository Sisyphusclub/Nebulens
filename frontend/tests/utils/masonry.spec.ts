import { describe, expect, it } from 'vitest';

import { MASONRY_ROWS, masonrySpan } from '@/utils/masonry';

describe('masonrySpan', () => {
  it('gives a square picture a column’s width of rows, and one more for the gap under it', () => {
    expect(MASONRY_ROWS).toBe(40);
    expect(masonrySpan(1024, 1024)).toBe(41);
  });

  it('follows the picture’s proportions', () => {
    expect(masonrySpan(1024, 1360)).toBe(54);
    expect(masonrySpan(1600, 900)).toBe(24);
  });

  it('stops at twice as tall and twice as wide, so no card runs away with a column', () => {
    expect(masonrySpan(600, 3000)).toBe(81);
    expect(masonrySpan(3000, 600)).toBe(21);
  });

  it('adds the rows a card needs for what it shows under the picture', () => {
    expect(masonrySpan(1024, 1024, 10)).toBe(51);
  });

  it('treats a picture of unknown size as square', () => {
    expect(masonrySpan(0, 0)).toBe(41);
    expect(masonrySpan(Number.NaN, 800)).toBe(41);
  });
});
