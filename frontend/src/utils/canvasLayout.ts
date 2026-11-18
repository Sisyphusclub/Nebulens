import { ASPECT_RATIO_CONFIGS, type AspectRatio, type HistoryEntry } from '@/types/image';
import type { FeedItem } from '@/utils/generationFeed';

/** Every picture on the board is this wide, in board units, at its own proportions. */
export const NODE_WIDTH = 320;
/** The space the board leaves between the pictures it places, and that tidying leaves. */
export const NODE_GAP = 24;
/**
 * The space above a new request's first row: its pictures are framed as a set, with the
 * set's name over the frame, and frames need room between them.
 */
export const RUN_GAP = 120;
/** How far a set's frame reaches past its pictures. */
export const FRAME_PADDING = 16;
/** A run of pictures wraps to a new row after this many. */
export const ROW_LIMIT = 4;
/** A picture taller or wider than this is cut to it, so a strip cannot run off the board. */
const TALLEST = 2.5;
const WIDEST = 0.4;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
/** Room left round the pictures when the view is fitted to them. */
const FIT_PADDING = 80;

export interface Point {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}
export interface Rect extends Point, Size {}
export interface KeyedRect extends Rect {
  key: string;
}
/** Where the board's origin is drawn in the window, and how large. */
export interface Viewport extends Point {
  zoom: number;
}

export function nodeSize(width: number, height: number): Size {
  const shape = width > 0 && height > 0 ? height / width : 1;
  return {
    width: NODE_WIDTH,
    height: Math.round(Math.min(Math.max(shape, WIDEST), TALLEST) * NODE_WIDTH),
  };
}

/** A picture still being made is drawn at the proportions that were asked for. */
export function placeholderSize(aspectRatio: AspectRatio): Size {
  return nodeSize(ASPECT_RATIO_CONFIGS[aspectRatio]?.ratio ?? 1, 1);
}

/** A placeholder or failure card has no picture id yet, so it is named after its batch. */
export function slotKey(itemId: string, index: number): string {
  return `${itemId}#${index}`;
}

/** One thing drawn on the board: a picture, a picture being made, or a batch that failed. */
export type BoardSlot =
  | { key: string; kind: 'image'; size: Size; item: FeedItem; entry: HistoryEntry }
  | { key: string; kind: 'pending' | 'error'; size: Size; item: FeedItem };

export function boardSlots(feed: readonly FeedItem[]): BoardSlot[] {
  return feed.flatMap((item): BoardSlot[] => {
    if (item.entries.length > 0) {
      return item.entries.map((entry) => ({
        key: entry.record.id,
        kind: 'image',
        size: nodeSize(entry.record.width, entry.record.height),
        item,
        entry,
      }));
    }
    const size = placeholderSize(item.settings.aspectRatio);
    if (item.error !== undefined) return [{ key: slotKey(item.id, 0), kind: 'error', size, item }];
    return Array.from({ length: Math.max(1, item.settings.count) }, (_, index) => ({
      key: slotKey(item.id, index),
      kind: 'pending',
      size,
      item,
    }));
  });
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** A rectangle dragged from either corner, with its width and height made positive. */
export function normalizeRect(rect: Rect): Rect {
  return {
    x: Math.min(rect.x, rect.x + rect.width),
    y: Math.min(rect.y, rect.y + rect.height),
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}

/**
 * Where a new picture goes: to the right of the one placed before it in the same run, or
 * under its row once the row holds four; otherwise, and whenever that spot is taken, on a
 * fresh row under everything, from the board's left edge. A new run starts further down,
 * leaving room for its set's frame and name.
 */
export function placeNode(rects: readonly Rect[], size: Size, after?: Rect): Point {
  if (rects.length === 0) return { x: 0, y: 0 };
  const fresh = (gap = NODE_GAP): Point => ({
    x: Math.min(...rects.map((rect) => rect.x)),
    y: Math.max(...rects.map((rect) => rect.y + rect.height)) + gap,
  });
  if (after === undefined) return fresh(RUN_GAP);
  const row = rects.filter((rect) => rect.y === after.y);
  const candidate: Point =
    row.length >= ROW_LIMIT
      ? {
          x: Math.min(...row.map((rect) => rect.x)),
          y: Math.max(...row.map((rect) => rect.y + rect.height)) + NODE_GAP,
        }
      : { x: after.x + after.width + NODE_GAP, y: after.y };
  const box = { ...candidate, ...size };
  return rects.some((rect) => overlaps(rect, box)) ? fresh() : candidate;
}

/** The last picture given a place, and the run it was placed in. */
export interface LastPlaced {
  key: string;
  run: string | null;
}

export interface ReconcileInput {
  /** The feed the positions were last reconciled with. */
  previous: readonly FeedItem[];
  next: readonly FeedItem[];
  positions: Readonly<Record<string, Point>>;
  lastPlaced: LastPlaced | null;
  /** The request the new pictures belong to; one request's pictures share a row. */
  run: string | null;
}

export interface ReconcileResult {
  /** The same object when nothing needed a place, so a caller can skip saving. */
  positions: Readonly<Record<string, Point>>;
  /** What was given a place just now, in the order it was placed. */
  placed: string[];
  lastPlaced: LastPlaced | null;
}

/**
 * Gives every picture in the feed a place on the board. A finished batch takes the places
 * its placeholders held, since the feed swaps a batch in where its placeholder was. Places
 * of pictures the feed no longer shows are kept: the feed can be briefly empty while the
 * history loads, and a board that forgot its places then would be laid out afresh.
 */
export function reconcilePositions({
  previous,
  next,
  positions,
  lastPlaced,
  run,
}: ReconcileInput): ReconcileResult {
  let written: Record<string, Point> | null = null;
  const read = (): Readonly<Record<string, Point>> => written ?? positions;
  const write = (key: string, point: Point): void => {
    written ??= { ...positions };
    written[key] = point;
  };
  const remove = (key: string): void => {
    written ??= { ...positions };
    delete written[key];
  };
  let last = lastPlaced;

  const previousIds = new Set(previous.map((item) => item.id));
  const nextIds = new Set(next.map((item) => item.id));
  next.forEach((item, index) => {
    if (previousIds.has(item.id) || item.entries.length === 0) return;
    const placeholder = previous[index];
    if (
      placeholder === undefined ||
      nextIds.has(placeholder.id) ||
      placeholder.entries.length > 0
    ) {
      return;
    }
    item.entries.forEach((entry, entryIndex) => {
      const key = slotKey(placeholder.id, entryIndex);
      const point = read()[key];
      if (point === undefined || read()[entry.record.id] !== undefined) return;
      write(entry.record.id, point);
      remove(key);
      if (last?.key === key) last = { key: entry.record.id, run: last.run };
    });
  });

  const slots = boardSlots(next);
  const rects: Rect[] = [];
  const rectByKey = new Map<string, Rect>();
  for (const slot of slots) {
    const point = read()[slot.key];
    if (point === undefined) continue;
    const rect = { ...point, ...slot.size };
    rects.push(rect);
    rectByKey.set(slot.key, rect);
  }
  const placed: string[] = [];
  for (const slot of slots) {
    if (rectByKey.has(slot.key)) continue;
    const after = last !== null && last.run === run ? rectByKey.get(last.key) : undefined;
    const point = placeNode(rects, slot.size, after);
    write(slot.key, point);
    const rect = { ...point, ...slot.size };
    rects.push(rect);
    rectByKey.set(slot.key, rect);
    placed.push(slot.key);
    last = { key: slot.key, run };
  }
  return { positions: read(), placed, lastPlaced: last };
}

export function boundsOf(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** The view that shows all of `bounds`, centred in the window and never larger than 100%. */
export function fitViewport(bounds: Rect | null, view: Size): Viewport {
  if (bounds === null || bounds.width <= 0 || bounds.height <= 0) return { x: 0, y: 0, zoom: 1 };
  const zoom = clampZoom(
    Math.min(
      1,
      (view.width - 2 * FIT_PADDING) / bounds.width,
      (view.height - 2 * FIT_PADDING) / bounds.height,
    ),
  );
  return {
    x: (view.width - bounds.width * zoom) / 2 - bounds.x * zoom,
    y: (view.height - bounds.height * zoom) / 2 - bounds.y * zoom,
    zoom,
  };
}

/** Zooms by `factor`, keeping the board point under `point` (window units) where it is. */
export function zoomAt(viewport: Viewport, point: Point, factor: number): Viewport {
  const zoom = clampZoom(viewport.zoom * factor);
  const worldX = (point.x - viewport.x) / viewport.zoom;
  const worldY = (point.y - viewport.y) / viewport.zoom;
  return { x: point.x - worldX * zoom, y: point.y - worldY * zoom, zoom };
}

/** The board point under a window point. */
export function toBoard(viewport: Viewport, point: Point): Point {
  return { x: (point.x - viewport.x) / viewport.zoom, y: (point.y - viewport.y) / viewport.zoom };
}

/** What a marquee dragged over the board touches, in board order. */
export function marqueeHits(rects: readonly KeyedRect[], marquee: Rect): string[] {
  const box = normalizeRect(marquee);
  return rects.filter((rect) => overlaps(rect, box)).map((rect) => rect.key);
}

/**
 * The order a reader takes a set of pictures in: row by row from the top, each row from
 * the left. A picture whose top is above the middle of a row's first picture is in that row.
 */
export function readingOrder<T extends Rect>(rects: readonly T[]): T[] {
  const byTop = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: T[][] = [];
  for (const rect of byTop) {
    const line = lines.at(-1);
    const first = line?.[0];
    if (line !== undefined && first !== undefined && rect.y < first.y + first.height / 2) {
      line.push(rect);
    } else {
      lines.push([rect]);
    }
  }
  return lines.flatMap((line) => line.sort((a, b) => a.x - b.x));
}

export type TidyDirection = 'row' | 'column';

/**
 * Lines a selection up from its top-left corner, in reading order and 24 apart: in a row
 * with their tops level, or in a column with their left edges level.
 */
export function tidyPositions(
  rects: readonly KeyedRect[],
  direction: TidyDirection,
): Record<string, Point> {
  const bounds = boundsOf(rects);
  if (bounds === null) return {};
  const result: Record<string, Point> = {};
  let cursor = direction === 'row' ? bounds.x : bounds.y;
  for (const rect of readingOrder(rects)) {
    if (direction === 'row') {
      result[rect.key] = { x: cursor, y: bounds.y };
      cursor += rect.width + NODE_GAP;
    } else {
      result[rect.key] = { x: bounds.x, y: cursor };
      cursor += rect.height + NODE_GAP;
    }
  }
  return result;
}

/**
 * Makes room for sets on a board laid out before sets were framed, where one sits a single
 * picture gap under whatever is above it: its frame then runs into the one above and its
 * name lies under those pictures. Such a set moves down until it has the room a new set is
 * given, and everything below moves with it, so the board keeps its arrangement. Pictures
 * beside one another, or put over one another, are left as they are.
 *
 * Returns the new places of what moved, or null when nothing did.
 */
export function spreadGroups(
  rects: readonly KeyedRect[],
  groups: readonly (readonly string[])[],
): Record<string, Point> | null {
  const groupOf = new Map<string, number>();
  groups.forEach((keys, index) => keys.forEach((key) => groupOf.set(key, index)));
  // A set is one block; a picture in no set is a block of its own.
  const members = new Map<string, KeyedRect[]>();
  for (const rect of rects) {
    const group = groupOf.get(rect.key);
    const id = group === undefined ? `picture:${rect.key}` : `set:${group}`;
    members.set(id, [...(members.get(id) ?? []), rect]);
  }
  const blocks = [...members.entries()]
    .flatMap(([id, items]) => {
      const bounds = boundsOf(items);
      return bounds === null ? [] : [{ framed: id.startsWith('set:'), items, bounds }];
    })
    .sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);

  const moved: Record<string, Point> = {};
  const settled: Rect[] = [];
  let shift = 0;
  for (const block of blocks) {
    const top = block.bounds.y + shift;
    if (block.framed) {
      const left = block.bounds.x - FRAME_PADDING;
      const right = block.bounds.x + block.bounds.width + FRAME_PADDING;
      // What is above the set and in its way; a block level with it is beside it.
      const floors = settled
        .filter(
          (other) =>
            other.x < right && left < other.x + other.width && other.y + other.height <= top,
        )
        .map((other) => other.y + other.height);
      if (floors.length > 0) shift += Math.max(0, RUN_GAP - (top - Math.max(...floors)));
    }
    settled.push({ ...block.bounds, y: block.bounds.y + shift });
    if (shift > 0) {
      for (const rect of block.items) moved[rect.key] = { x: rect.x, y: rect.y + shift };
    }
  }
  return Object.keys(moved).length > 0 ? moved : null;
}
