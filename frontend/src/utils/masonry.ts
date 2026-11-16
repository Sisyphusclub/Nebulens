import type { CSSProperties } from 'react';

/**
 * How a wall of cards is laid out without measuring anything: every column's width is
 * divided into this many grid rows, each card spans as many rows as it needs, and the
 * grid's dense flow drops it into the shortest column. The cards stay in reading order in
 * the page. The stylesheet's `.masonry__grid` reads the same number from `--masonry-rows`.
 */
export const MASONRY_ROWS = 40;

/** A picture taller or wider than this is cropped to it, so no card runs away with a column. */
const TALLEST = 2;
const WIDEST = 0.5;

/**
 * The grid rows a card takes: its picture at these proportions, `extraRows` for whatever
 * the card shows under the picture, and one for the gap beneath it.
 */
export function masonrySpan(width: number, height: number, extraRows = 0): number {
  const shape = width > 0 && height > 0 ? height / width : 1;
  return Math.round(Math.min(Math.max(shape, WIDEST), TALLEST) * MASONRY_ROWS) + extraRows + 1;
}

/**
 * The rows a card with a caption under its picture adds for the caption: a title and a
 * line of detail. Columns are at least 264px wide on such walls, which makes ten rows at
 * least 66px.
 */
export const MEDIA_CARD_INFO_ROWS = 10;

type GridVariables = CSSProperties & { '--masonry-rows': number; '--masonry-info-rows'?: number };
type CardVariables = CSSProperties & { '--masonry-span': number };

/** The style a `.masonry__grid` of pictures alone carries. */
export const MASONRY_GRID_STYLE: GridVariables = { '--masonry-rows': MASONRY_ROWS };

/** The style a `.masonry__grid` of captioned cards carries. */
export const MEDIA_CARD_GRID_STYLE: GridVariables = {
  '--masonry-rows': MASONRY_ROWS,
  '--masonry-info-rows': MEDIA_CARD_INFO_ROWS,
};

/** The style of one card in the grid. */
export function masonryCardStyle(width: number, height: number, extraRows = 0): CardVariables {
  return { '--masonry-span': masonrySpan(width, height, extraRows) };
}
