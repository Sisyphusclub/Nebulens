import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import { reconcilePositions, type LastPlaced, type Point } from '@/utils/canvasLayout';
import type { FeedItem } from '@/utils/generationFeed';
import { isRecord } from '@/utils/narrowing';

export const CANVAS_LAYOUT_STORAGE_KEY = 'nebulens.canvas-layout.v1';

type Positions = Readonly<Record<string, Point>>;

function isPoint(value: unknown): value is Point {
  return (
    isRecord(value) &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y)
  );
}

function readLayouts(): Record<string, Positions> {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(CANVAS_LAYOUT_STORAGE_KEY) ?? '{}',
    );
    if (!isRecord(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([sessionId, positions]) =>
        isRecord(positions)
          ? [
              [
                sessionId,
                Object.fromEntries(
                  Object.entries(positions).flatMap(([key, point]) =>
                    isPoint(point) ? [[key, { x: point.x, y: point.y }]] : [],
                  ),
                ),
              ],
            ]
          : [],
      ),
    );
  } catch {
    return {};
  }
}

function saveLayout(sessionId: string, positions: Positions): void {
  try {
    window.localStorage.setItem(
      CANVAS_LAYOUT_STORAGE_KEY,
      JSON.stringify({ ...readLayouts(), [sessionId]: positions }),
    );
  } catch {
    // The board keeps its places for as long as the page is open.
  }
}

/** Pictures given a place just now; the serial tells one batch of them from the next. */
export interface PlacedNodes {
  keys: readonly string[];
  serial: number;
}

/**
 * Where each picture of a session sits on the canvas, kept in this browser per session.
 * New pictures are placed as the feed brings them: one request's pictures in a row, the
 * next request's on a row underneath. Nothing is placed until the feed shows the session
 * it belongs to, so a session never takes another's pictures.
 */
export function useCanvasLayout({
  sessionId,
  feed,
  run,
  enabled,
}: {
  sessionId: string | null;
  feed: readonly FeedItem[];
  /** The request new pictures belong to. */
  run: string | null;
  /** False while the feed may still hold another session's pictures. */
  enabled: boolean;
}) {
  const [positions, setPositions] = useState<Positions>({});
  const [placed, setPlaced] = useState<PlacedNodes>({ keys: [], serial: 0 });
  const state = useRef<{
    sessionId: string | null | undefined;
    previous: readonly FeedItem[];
    lastPlaced: LastPlaced | null;
    positions: Positions;
  }>({ sessionId: undefined, previous: [], lastPlaced: null, positions: {} });

  useLayoutEffect(() => {
    const current = state.current;
    if (current.sessionId !== sessionId) {
      current.sessionId = sessionId;
      current.previous = [];
      current.lastPlaced = null;
      current.positions = sessionId === null ? {} : (readLayouts()[sessionId] ?? {});
      setPositions(current.positions);
    }
    if (!enabled || sessionId === null) return;
    const result = reconcilePositions({
      previous: current.previous,
      next: feed,
      positions: current.positions,
      lastPlaced: current.lastPlaced,
      run,
    });
    current.previous = feed;
    current.lastPlaced = result.lastPlaced;
    if (result.positions !== current.positions) {
      current.positions = result.positions;
      setPositions(result.positions);
      saveLayout(sessionId, result.positions);
    }
    if (result.placed.length > 0) {
      setPlaced((last) => ({ keys: result.placed, serial: last.serial + 1 }));
    }
  }, [enabled, feed, run, sessionId]);

  /** Moves pictures to new places, as after a drag or tidying. */
  const move = useCallback((updates: Readonly<Record<string, Point>>) => {
    const current = state.current;
    if (current.sessionId === null || current.sessionId === undefined) return;
    current.positions = { ...current.positions, ...updates };
    setPositions(current.positions);
    saveLayout(current.sessionId, current.positions);
  }, []);

  return { positions, placed, move };
}
