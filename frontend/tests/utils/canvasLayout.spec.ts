import { describe, expect, it } from 'vitest';

import type { HistoryEntry } from '@/types/image';
import {
  boardSlots,
  boundsOf,
  fitViewport,
  marqueeHits,
  nodeSize,
  NODE_GAP,
  NODE_WIDTH,
  placeholderSize,
  placeNode,
  reconcilePositions,
  tidyPositions,
  zoomAt,
} from '@/utils/canvasLayout';
import type { FeedItem } from '@/utils/generationFeed';

function entry(id: string, width = 1024, height = 1024): HistoryEntry {
  return {
    record: {
      id,
      createdAt: '2026-11-16T08:00:00.000Z',
      prompt: id,
      model: 'gpt-image-2',
      width,
      height,
      isPublic: false,
      isFavorite: false,
    },
    imageUrl: `/api/outputs/${id}`,
  };
}

function item(id: string, entries: HistoryEntry[], overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id,
    createdAt: '2026-11-16T08:00:00.000Z',
    entries,
    settings: {
      prompt: id,
      model: 'gpt-image-2',
      count: 1,
      aspectRatio: '1:1',
      resolution: 'standard',
      isPublic: false,
      referenceIds: [],
    },
    ...overrides,
  };
}

describe('node sizes', () => {
  it('draws every picture 320 wide at its own proportions, within limits', () => {
    expect(nodeSize(1024, 1024)).toEqual({ width: NODE_WIDTH, height: 320 });
    expect(nodeSize(1024, 1360)).toEqual({ width: NODE_WIDTH, height: 425 });
    expect(nodeSize(1792, 1024)).toEqual({ width: NODE_WIDTH, height: 183 });
    // A strip is cut short rather than left to run off the board.
    expect(nodeSize(100, 1000)).toEqual({ width: NODE_WIDTH, height: 800 });
    expect(nodeSize(1000, 100)).toEqual({ width: NODE_WIDTH, height: 128 });
    // A record with no size is a square until the picture says otherwise.
    expect(nodeSize(0, 0)).toEqual({ width: NODE_WIDTH, height: 320 });
  });

  it('draws a placeholder at the proportions that were asked for', () => {
    expect(placeholderSize('3:4')).toEqual({ width: NODE_WIDTH, height: 427 });
    expect(placeholderSize('16:9')).toEqual({ width: NODE_WIDTH, height: 180 });
  });
});

describe('placing a node', () => {
  const square = { width: 320, height: 320 };

  it('puts the first at the origin and the next of its run to its right', () => {
    const first = placeNode([], square);
    expect(first).toEqual({ x: 0, y: 0 });
    const firstRect = { ...first, ...square };
    expect(placeNode([firstRect], square, firstRect)).toEqual({ x: 320 + NODE_GAP, y: 0 });
  });

  it('wraps a run after four in a row, under the tallest of them', () => {
    const row = [0, 1, 2, 3].map((column) => ({
      x: column * (320 + NODE_GAP),
      y: 0,
      width: 320,
      height: column === 1 ? 480 : 320,
    }));
    expect(placeNode(row, square, row[3])).toEqual({ x: 0, y: 480 + NODE_GAP });
  });

  it('starts a new run on a fresh row under everything, at the left edge', () => {
    const board = [
      { x: 40, y: 10, width: 320, height: 320 },
      { x: 400, y: 10, width: 320, height: 200 },
    ];
    expect(placeNode(board, square)).toEqual({ x: 40, y: 330 + NODE_GAP });
  });

  it('never lands on a node that was dragged into the way', () => {
    const last = { x: 0, y: 0, width: 320, height: 320 };
    const dragged = { x: 360, y: 100, width: 320, height: 320 };
    expect(placeNode([last, dragged], square, last)).toEqual({ x: 0, y: 420 + NODE_GAP });
  });
});

describe('keeping the board in step with the feed', () => {
  it('lays out what a session already holds in rows, in feed order', () => {
    const feed = [item('batch-a', [entry('a1'), entry('a2')]), item('batch-b', [entry('b1')])];
    const result = reconcilePositions({
      previous: [],
      next: feed,
      positions: {},
      lastPlaced: null,
      run: null,
    });

    expect(result.positions).toEqual({
      a1: { x: 0, y: 0 },
      a2: { x: 344, y: 0 },
      b1: { x: 688, y: 0 },
    });
    expect(result.placed).toEqual(['a1', 'a2', 'b1']);
  });

  it('gives a finished picture the place its placeholder held', () => {
    const pending = [item('pending-1', [])];
    const placed = reconcilePositions({
      previous: [],
      next: pending,
      positions: { old: { x: 0, y: 0 } },
      lastPlaced: null,
      run: 'turn-1',
    });
    expect(placed.positions['pending-1#0']).toEqual({ x: 0, y: 0 });

    const done = reconcilePositions({
      previous: pending,
      next: [item('batch-1', [entry('fresh')])],
      positions: placed.positions,
      lastPlaced: placed.lastPlaced,
      run: 'turn-1',
    });
    expect(done.positions.fresh).toEqual({ x: 0, y: 0 });
    expect(done.positions).not.toHaveProperty('pending-1#0');
    expect(done.placed).toEqual([]);
    // The run goes on from the finished picture, not from a placeholder that is gone.
    expect(done.lastPlaced).toEqual({ key: 'fresh', run: 'turn-1' });
  });

  it('keeps the pictures of one run in a row and starts the next run underneath', () => {
    const first = reconcilePositions({
      previous: [],
      next: [item('batch-1', [entry('one')])],
      positions: {},
      lastPlaced: null,
      run: 'turn-1',
    });
    const second = reconcilePositions({
      previous: [item('batch-1', [entry('one')])],
      next: [item('batch-1', [entry('one')]), item('pending-2', [])],
      positions: first.positions,
      lastPlaced: first.lastPlaced,
      run: 'turn-1',
    });
    expect(second.positions['pending-2#0']).toEqual({ x: 344, y: 0 });

    const nextRun = reconcilePositions({
      previous: [item('batch-1', [entry('one')]), item('pending-2', [])],
      next: [item('batch-1', [entry('one')]), item('pending-2', []), item('pending-3', [])],
      positions: second.positions,
      lastPlaced: second.lastPlaced,
      run: 'turn-2',
    });
    expect(nextRun.positions['pending-3#0']).toEqual({ x: 0, y: 344 });
  });

  it('leaves a board that needs nothing exactly as it was', () => {
    const positions = { a1: { x: 5, y: 6 } };
    const result = reconcilePositions({
      previous: [],
      next: [item('batch-a', [entry('a1')])],
      positions,
      lastPlaced: null,
      run: null,
    });
    expect(result.positions).toBe(positions);
  });

  it('shows one card for a failed batch and as many placeholders as a batch will make', () => {
    const slots = boardSlots([
      item('failed', [], { error: '上游失败' }),
      item('pending', [], {
        settings: { ...item('pending', []).settings, count: 3, aspectRatio: '3:4' },
      }),
      item('done', [entry('d1', 1024, 1360)]),
    ]);
    expect(slots.map((slot) => [slot.key, slot.kind, slot.size.height])).toEqual([
      ['failed#0', 'error', 320],
      ['pending#0', 'pending', 427],
      ['pending#1', 'pending', 427],
      ['pending#2', 'pending', 427],
      ['d1', 'image', 425],
    ]);
  });
});

describe('the view', () => {
  it('fits everything in the window, centred, without magnifying past 100%', () => {
    expect(
      fitViewport({ x: 0, y: 0, width: 320, height: 320 }, { width: 1000, height: 800 }),
    ).toEqual({ x: 340, y: 240, zoom: 1 });
    const wide = fitViewport(
      { x: 100, y: 50, width: 3000, height: 600 },
      { width: 1000, height: 800 },
    );
    expect(wide.zoom).toBeCloseTo(0.28);
    // The board's middle is the window's middle.
    expect(wide.x + (100 + 1500) * wide.zoom).toBeCloseTo(500);
    expect(wide.y + (50 + 300) * wide.zoom).toBeCloseTo(400);
    // Nothing to fit: the origin, at 100%.
    expect(fitViewport(null, { width: 1000, height: 800 })).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('zooms about the pointer, within limits', () => {
    const zoomed = zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 200, y: 100 }, 2);
    expect(zoomed).toEqual({ x: -200, y: -100, zoom: 2 });
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, 99).zoom).toBe(4);
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, 0).zoom).toBe(0.1);
  });

  it('finds what a marquee touches and the box around a set of nodes', () => {
    const rects = [
      { key: 'a', x: 0, y: 0, width: 100, height: 100 },
      { key: 'b', x: 300, y: 0, width: 100, height: 100 },
    ];
    expect(marqueeHits(rects, { x: 50, y: 50, width: 100, height: 10 })).toEqual(['a']);
    expect(marqueeHits(rects, { x: -10, y: -10, width: 500, height: 50 })).toEqual(['a', 'b']);
    expect(boundsOf(rects)).toEqual({ x: 0, y: 0, width: 400, height: 100 });
    expect(boundsOf([])).toBeNull();
  });
});

describe('tidying a selection', () => {
  const scattered = [
    { key: 'right', x: 500, y: 12, width: 320, height: 200 },
    { key: 'left', x: 40, y: 0, width: 320, height: 320 },
    { key: 'below', x: 300, y: 600, width: 320, height: 180 },
  ];

  it('lines them up in a row, in reading order, tops level, 24 apart', () => {
    expect(tidyPositions(scattered, 'row')).toEqual({
      left: { x: 40, y: 0 },
      right: { x: 384, y: 0 },
      below: { x: 728, y: 0 },
    });
  });

  it('or stacks them in a column, left edges level', () => {
    expect(tidyPositions(scattered, 'column')).toEqual({
      left: { x: 40, y: 0 },
      right: { x: 40, y: 344 },
      below: { x: 40, y: 568 },
    });
  });
});
