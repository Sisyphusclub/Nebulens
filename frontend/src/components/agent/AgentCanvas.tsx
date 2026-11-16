import {
  CircleAlert,
  Columns3,
  Download,
  Hand,
  Maximize,
  Maximize2,
  Minus,
  MousePointer2,
  Plus,
  Rows3,
  Trash2,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import { Button } from '@/components/ui/button';
import { IconTooltip } from '@/components/ui/icon-tooltip';
import type { PlacedNodes } from '@/hooks/useCanvasLayout';
import { IMAGE_MODEL_LABELS, type HistoryEntry, type ImageModel } from '@/types/image';
import {
  boundsOf,
  fitViewport,
  marqueeHits,
  normalizeRect,
  tidyPositions,
  toBoard,
  zoomAt,
  type BoardSlot,
  type KeyedRect,
  type Point,
  type Rect,
  type TidyDirection,
  type Viewport,
} from '@/utils/canvasLayout';
import type { FeedItem } from '@/utils/generationFeed';
import { splitGenerationError } from '@/utils/generationFeed';
import { thumbnailUrl } from '@/utils/thumbnail';

type Tool = 'select' | 'hand';

type Interaction =
  | { kind: 'pan'; origin: Point; viewport: Viewport }
  | {
      kind: 'drag';
      origin: Point;
      keys: readonly string[];
      moved: boolean;
      offset: Point;
      /** Pressed on a picture already in a larger selection: a plain click picks it alone. */
      collapseTo?: string;
    }
  | { kind: 'marquee'; origin: Point; base: readonly string[]; moved: boolean; hits: string };

/** Further than this, a press on a picture is a drag rather than a click. */
const DRAG_THRESHOLD = 3;
/** Above this zoom the full picture is drawn instead of its thumbnail. */
const FULL_IMAGE_ZOOM = 1.2;
/** Room kept between a picture brought into view and the edge of the free area. */
const REVEAL_MARGIN = 24;
/** Window pixels the floating chrome takes from the board's edges. */
const CHROME_LEFT = 64;
const CHROME_TOP = 76;
const CHROME_RIGHT = 16;
const CHROME_BOTTOM = 64;

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/** A mouse wheel moves in whole notches; a trackpad scrolls in small, smooth steps. */
function isMouseWheel(event: WheelEvent): boolean {
  return (
    event.deltaMode !== 0 ||
    (event.deltaX === 0 && Math.abs(event.deltaY) >= 50 && Number.isInteger(event.deltaY))
  );
}

/** Keeps a drag with the board when the pointer leaves it; not every engine supports it. */
function capturePointer(element: Element, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Without capture the drag still ends when the pointer is released over the board.
  }
}

function releasePointer(element: Element, pointerId: number): void {
  try {
    if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
  } catch {
    // Nothing was captured.
  }
}

/** Dots every 20 board units, spread out when zoomed so far out that they would blur. */
function gridStep(zoom: number): number {
  let step = 20 * zoom;
  while (step < 12) step *= 2;
  return step;
}

export interface CanvasFocus {
  keys: readonly string[];
  serial: number;
}

interface AgentCanvasProps {
  /** The session on the board; a new one is fitted into view once it has pictures. */
  sessionKey: string | null;
  slots: readonly BoardSlot[];
  positions: Readonly<Record<string, Point>>;
  /** Pictures just given a place, brought into view when they land outside it. */
  placed: PlacedNodes;
  /** Pictures to fit the view to, such as the ones a request made. */
  focus: CanvasFocus | null;
  selection: readonly string[];
  onSelectionChange: (keys: string[]) => void;
  onMove: (updates: Readonly<Record<string, Point>>) => void;
  onOpen: (entry: HistoryEntry) => void;
  onDownload: (entries: readonly HistoryEntry[]) => void;
  onDelete: (entry: HistoryEntry) => void;
  onRetry: (item: FeedItem) => void;
  /** Window pixels the conversation covers on the left and at the foot of the board. */
  insetLeft: number;
  insetBottom: number;
  empty: ReactNode;
}

/**
 * An endless board the Agent's pictures are laid out on. Wheel or pinch to zoom about the
 * pointer, drag with the hand tool, the space bar held or the middle button to pan. Click,
 * shift-click or drag a marquee to select, and drag a selection to move it. The selection
 * is the reference the next request is sent with.
 */
export function AgentCanvas({
  sessionKey,
  slots,
  positions,
  placed,
  focus,
  selection,
  onSelectionChange,
  onMove,
  onOpen,
  onDownload,
  onDelete,
  onRetry,
  insetLeft,
  insetBottom,
  empty,
}: AgentCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewportState] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  /**
   * The view as last set, ahead of the render that shows it: effects that run in the same
   * commit as a fit must see the fitted view, or they would move the board back.
   */
  const viewportRef = useRef(viewport);
  const setViewport = useCallback((next: Viewport | ((current: Viewport) => Viewport)) => {
    const value = typeof next === 'function' ? next(viewportRef.current) : next;
    viewportRef.current = value;
    setViewportState(value);
  }, []);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [tool, setTool] = useState<Tool>('select');
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const [drag, setDrag] = useState<{ keys: readonly string[]; offset: Point } | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const interaction = useRef<Interaction | null>(null);
  const hovered = useRef(false);
  const fittedSession = useRef<string | null | undefined>(undefined);

  const nodes = useMemo(
    () =>
      slots.flatMap((slot) => {
        const point = positions[slot.key];
        return point === undefined
          ? []
          : [{ slot, rect: { key: slot.key, ...point, ...slot.size } }];
      }),
    [positions, slots],
  );
  const rects = useMemo<KeyedRect[]>(() => nodes.map((node) => node.rect), [nodes]);
  const selectionSet = useMemo(() => new Set(selection), [selection]);
  const selectedNodes = useMemo(
    () => nodes.filter((node) => selectionSet.has(node.slot.key)),
    [nodes, selectionSet],
  );
  const selectedEntries = useMemo(
    () => selectedNodes.flatMap((node) => (node.slot.kind === 'image' ? [node.slot.entry] : [])),
    [selectedNodes],
  );

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (element === null) return;
    const measure = (): void => {
      const box = element.getBoundingClientRect();
      setSize((current) =>
        current.width === box.width && current.height === box.height
          ? current
          : { width: box.width, height: box.height },
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /**
   * The part of the board nothing floats over: right of the conversation and the tool rail,
   * under the account buttons and above the view controls.
   */
  const area = useMemo(() => {
    const x = insetLeft + CHROME_LEFT;
    return {
      x,
      y: CHROME_TOP,
      width: Math.max(1, size.width - x - CHROME_RIGHT),
      height: Math.max(1, size.height - insetBottom - CHROME_TOP - CHROME_BOTTOM),
    };
  }, [insetBottom, insetLeft, size.height, size.width]);

  const fitTo = useCallback(
    (bounds: Rect | null) => {
      const fitted = fitViewport(bounds, area);
      setViewport({ ...fitted, x: fitted.x + area.x, y: fitted.y + area.y });
    },
    [area, setViewport],
  );

  // A session is fitted into view once its pictures have places and the board its size.
  useLayoutEffect(() => {
    if (fittedSession.current === sessionKey || rects.length === 0 || size.width === 0) return;
    fittedSession.current = sessionKey;
    fitTo(boundsOf(rects));
  }, [fitTo, rects, sessionKey, size.width]);

  // New pictures that land outside the view are brought into it at the zoom in use, moving
  // the board no further than needed, so what was in view stays as much in view as it can.
  useEffect(() => {
    if (placed.keys.length === 0 || fittedSession.current !== sessionKey) return;
    const bounds = boundsOf(rects.filter((rect) => placed.keys.includes(rect.key)));
    if (bounds === null) return;
    const current = viewportRef.current;
    const width = bounds.width * current.zoom;
    const height = bounds.height * current.zoom;
    if (width > area.width - 2 * REVEAL_MARGIN || height > area.height - 2 * REVEAL_MARGIN) {
      fitTo(bounds);
      return;
    }
    const left = current.x + bounds.x * current.zoom;
    const top = current.y + bounds.y * current.zoom;
    const shift = (start: number, size: number, from: number, to: number): number =>
      start < from + REVEAL_MARGIN
        ? from + REVEAL_MARGIN - start
        : start + size > to - REVEAL_MARGIN
          ? to - REVEAL_MARGIN - (start + size)
          : 0;
    const dx = shift(left, width, area.x, area.x + area.width);
    const dy = shift(top, height, area.y, area.y + area.height);
    if (dx === 0 && dy === 0) return;
    setViewport({ ...current, x: current.x + dx, y: current.y + dy });
    // Only a new set of placed pictures moves the view, not every change to the board.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed.serial]);

  useEffect(() => {
    if (focus === null) return;
    const bounds = boundsOf(rects.filter((rect) => focus.keys.includes(rect.key)));
    if (bounds !== null) fitTo(bounds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.serial]);

  const zoomAbout = useCallback(
    (factor: number, point?: Point) => {
      setViewport((current) =>
        zoomAt(
          current,
          point ?? { x: area.x + area.width / 2, y: area.y + area.height / 2 },
          factor,
        ),
      );
    },
    [area, setViewport],
  );

  const zoomTo = useCallback(
    (zoom: number) => zoomAbout(zoom / viewportRef.current.zoom),
    [zoomAbout],
  );

  const fitAll = useCallback(() => fitTo(boundsOf(rects)), [fitTo, rects]);

  // Wheel and pinch zoom about the pointer; a trackpad's two-finger scroll pans.
  useEffect(() => {
    const element = containerRef.current;
    if (element === null) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const box = element.getBoundingClientRect();
      const point = { x: event.clientX - box.left, y: event.clientY - box.top };
      if (event.ctrlKey || event.metaKey || isMouseWheel(event)) {
        const speed = event.ctrlKey ? 0.01 : 0.0015;
        setViewport((current) => zoomAt(current, point, Math.exp(-event.deltaY * speed)));
      } else {
        setViewport((current) => ({
          ...current,
          x: current.x - event.deltaX,
          y: current.y - event.deltaY,
        }));
      }
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [setViewport]);

  const singleEntry =
    selectedEntries.length === 1 && selection.length === 1 ? selectedEntries[0] : undefined;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isEditable(event.target)) return;
      const element = containerRef.current;
      const active = hovered.current || (element?.contains(document.activeElement) ?? false);
      if (!active) return;
      const modifier = event.metaKey || event.ctrlKey;
      if (event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat) setSpaceHeld(true);
        return;
      }
      if (modifier && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        onSelectionChange(rects.map((rect) => rect.key));
      } else if (modifier && event.key === '0') {
        event.preventDefault();
        zoomTo(1);
      } else if (modifier && (event.key === '=' || event.key === '+')) {
        event.preventDefault();
        zoomAbout(1.25);
      } else if (modifier && event.key === '-') {
        event.preventDefault();
        zoomAbout(0.8);
      } else if (modifier || event.altKey) {
        return;
      } else if (event.shiftKey && event.code === 'Digit1') {
        event.preventDefault();
        fitAll();
      } else if (event.key.toLowerCase() === 'v') {
        setTool('select');
      } else if (event.key.toLowerCase() === 'h') {
        setTool('hand');
      } else if (event.key === 'Escape') {
        onSelectionChange([]);
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && singleEntry) {
        event.preventDefault();
        onDelete(singleEntry);
      }
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space') setSpaceHeld(false);
    };
    const onBlur = (): void => setSpaceHeld(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [fitAll, onDelete, onSelectionChange, rects, singleEntry, zoomAbout, zoomTo]);

  const localPoint = (event: ReactPointerEvent<HTMLElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 && event.button !== 1) return;
    const target = event.target as Element;
    if (target.closest('[data-canvas-chrome], [data-node-action]')) return;
    const point = localPoint(event);
    const element = event.currentTarget;
    if (event.button === 1 || tool === 'hand' || spaceHeld) {
      event.preventDefault();
      interaction.current = { kind: 'pan', origin: point, viewport: viewportRef.current };
      capturePointer(element, event.pointerId);
      setPanning(true);
      return;
    }
    const key = target.closest<HTMLElement>('[data-node-key]')?.dataset.nodeKey;
    if (key !== undefined) {
      const additive = event.shiftKey || event.metaKey || event.ctrlKey;
      const alreadySelected = selectionSet.has(key);
      const next = additive
        ? alreadySelected
          ? selection.filter((candidate) => candidate !== key)
          : [...selection, key]
        : alreadySelected
          ? [...selection]
          : [key];
      if (additive || !alreadySelected) onSelectionChange(next);
      if (next.includes(key)) {
        interaction.current = {
          kind: 'drag',
          origin: point,
          keys: next,
          moved: false,
          offset: { x: 0, y: 0 },
          ...(!additive && alreadySelected && selection.length > 1 ? { collapseTo: key } : {}),
        };
        capturePointer(element, event.pointerId);
      }
      return;
    }
    interaction.current = {
      kind: 'marquee',
      origin: point,
      base: event.shiftKey ? [...selection] : [],
      moved: false,
      hits: '',
    };
    capturePointer(element, event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const current = interaction.current;
    if (current === null) return;
    const point = localPoint(event);
    const dx = point.x - current.origin.x;
    const dy = point.y - current.origin.y;
    if (current.kind === 'pan') {
      setViewport({ ...current.viewport, x: current.viewport.x + dx, y: current.viewport.y + dy });
      return;
    }
    if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    current.moved = true;
    const zoom = viewportRef.current.zoom;
    if (current.kind === 'drag') {
      current.offset = { x: dx / zoom, y: dy / zoom };
      setDrag({ keys: current.keys, offset: current.offset });
      return;
    }
    const screen = normalizeRect({
      x: current.origin.x,
      y: current.origin.y,
      width: dx,
      height: dy,
    });
    setMarquee(screen);
    const corner = toBoard(viewportRef.current, screen);
    const hits = marqueeHits(rects, {
      ...corner,
      width: screen.width / zoom,
      height: screen.height / zoom,
    });
    const next = [...new Set([...current.base, ...hits])];
    const signature = next.join('\n');
    if (signature !== current.hits) {
      current.hits = signature;
      onSelectionChange(next);
    }
  };

  const endInteraction = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const current = interaction.current;
    interaction.current = null;
    releasePointer(event.currentTarget, event.pointerId);
    if (current === null) return;
    if (current.kind === 'pan') {
      setPanning(false);
      return;
    }
    if (current.kind === 'drag') {
      setDrag(null);
      if (current.moved) {
        onMove(
          Object.fromEntries(
            current.keys.flatMap((key) => {
              const point = positions[key];
              return point === undefined
                ? []
                : [[key, { x: point.x + current.offset.x, y: point.y + current.offset.y }]];
            }),
          ),
        );
      } else if (current.collapseTo !== undefined) {
        onSelectionChange([current.collapseTo]);
      }
      return;
    }
    setMarquee(null);
    if (!current.moved && current.base.length === 0) onSelectionChange([]);
  };

  /** Enter or space on a focused picture selects it, as a click does. */
  const selectFromKeyboard = (key: string, event: ReactMouseEvent<HTMLButtonElement>): void => {
    if (event.detail !== 0) return;
    onSelectionChange(
      event.shiftKey
        ? selectionSet.has(key)
          ? selection.filter((candidate) => candidate !== key)
          : [...selection, key]
        : [key],
    );
  };

  const tidy = (direction: TidyDirection): void => {
    onMove(
      tidyPositions(
        selectedNodes.map((node) => node.rect),
        direction,
      ),
    );
  };

  const selectionBounds = drag || marquee ? null : boundsOf(selectedNodes.map((node) => node.rect));
  const toolbarStyle: CSSProperties | undefined =
    selectionBounds === null
      ? undefined
      : (() => {
          const centre =
            viewport.x + (selectionBounds.x + selectionBounds.width / 2) * viewport.zoom;
          const top = viewport.y + selectionBounds.y * viewport.zoom;
          const below = viewport.y + (selectionBounds.y + selectionBounds.height) * viewport.zoom;
          const above = top - 52 >= 12;
          return {
            left: Math.min(
              Math.max(centre, area.x + 120),
              Math.max(area.x + 120, size.width - 120),
            ),
            top: above ? top - 12 : below + 12,
            transform: above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
          };
        })();
  const step = gridStep(viewport.zoom);
  const effectiveTool: Tool = spaceHeld ? 'hand' : tool;

  return (
    <div
      ref={containerRef}
      className="agent-canvas"
      role="region"
      aria-label="画布"
      data-tool={effectiveTool}
      data-panning={panning ? 'true' : undefined}
      style={{
        backgroundSize: `${step}px ${step}px`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endInteraction}
      onPointerCancel={endInteraction}
      onPointerEnter={() => {
        hovered.current = true;
      }}
      onPointerLeave={() => {
        hovered.current = false;
      }}
    >
      <div
        className="agent-canvas__world"
        style={{
          transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
        }}
      >
        {nodes.map(({ slot, rect }) => {
          const selected = selectionSet.has(slot.key);
          const offset = drag?.keys.includes(slot.key) ? drag.offset : null;
          const style: CSSProperties = {
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            ...(offset === null
              ? {}
              : { transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }),
          };
          if (slot.kind === 'image') {
            return (
              <Button
                key={slot.key}
                type="button"
                variant="ghost"
                className="agent-node agent-node--image"
                data-node-key={slot.key}
                data-selected={selected ? 'true' : undefined}
                aria-pressed={selected}
                aria-label={`画布图片：${slot.entry.record.prompt}`}
                style={style}
                onClick={(event) => selectFromKeyboard(slot.key, event)}
                onDoubleClick={() => onOpen(slot.entry)}
              >
                <img
                  src={
                    viewport.zoom > FULL_IMAGE_ZOOM
                      ? slot.entry.imageUrl
                      : thumbnailUrl(slot.entry.imageUrl, 640)
                  }
                  alt=""
                  draggable={false}
                  decoding="async"
                />
              </Button>
            );
          }
          if (slot.kind === 'pending') {
            const model = slot.item.settings.model;
            return (
              <div
                key={slot.key}
                className="agent-node agent-node--pending"
                data-node-key={slot.key}
                data-selected={selected ? 'true' : undefined}
                role="img"
                aria-label="正在生成的图片"
                style={style}
              >
                <span className="agent-node__shimmer" aria-hidden="true" />
                <span className="agent-node__status">
                  正在生成 · {IMAGE_MODEL_LABELS[model as ImageModel] ?? model}
                </span>
              </div>
            );
          }
          return (
            <div
              key={slot.key}
              className="agent-node agent-node--error"
              data-node-key={slot.key}
              data-selected={selected ? 'true' : undefined}
              role="group"
              aria-label="生成失败的图片"
              style={style}
            >
              <CircleAlert aria-hidden="true" />
              <strong>生成失败</strong>
              <span>{splitGenerationError(slot.item.error ?? '').message}</span>
              <Button
                type="button"
                variant="secondary"
                size="compact"
                data-node-action="retry"
                onClick={() => onRetry(slot.item)}
              >
                重试
              </Button>
            </div>
          );
        })}
      </div>

      {marquee === null ? null : (
        <div
          className="agent-canvas__marquee"
          aria-hidden="true"
          style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }}
        />
      )}

      {slots.length === 0 ? (
        <div className="agent-canvas__empty" style={{ left: area.x, bottom: insetBottom }}>
          {empty}
        </div>
      ) : null}

      {toolbarStyle === undefined ? null : (
        <div
          className="agent-canvas__selection"
          role="toolbar"
          aria-label="选中的图片"
          data-canvas-chrome
          style={toolbarStyle}
        >
          {selection.length > 1 ? (
            <>
              <span className="agent-canvas__selection-count">已选 {selection.length} 项</span>
              <IconTooltip label="横向排列">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="横向排列"
                  onClick={() => tidy('row')}
                >
                  <Columns3 aria-hidden="true" />
                </Button>
              </IconTooltip>
              <IconTooltip label="纵向排列">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="纵向排列"
                  onClick={() => tidy('column')}
                >
                  <Rows3 aria-hidden="true" />
                </Button>
              </IconTooltip>
            </>
          ) : null}
          {singleEntry === undefined ? null : (
            <IconTooltip label="查看详情">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="查看详情"
                onClick={() => onOpen(singleEntry)}
              >
                <Maximize2 aria-hidden="true" />
              </Button>
            </IconTooltip>
          )}
          {selectedEntries.length > 0 ? (
            <IconTooltip
              label={selectedEntries.length > 1 ? `下载 ${selectedEntries.length} 张` : '下载'}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={
                  selectedEntries.length > 1 ? `下载 ${selectedEntries.length} 张` : '下载'
                }
                onClick={() => onDownload(selectedEntries)}
              >
                <Download aria-hidden="true" />
              </Button>
            </IconTooltip>
          ) : null}
          {singleEntry === undefined ? null : (
            <IconTooltip label="删除">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="删除"
                onClick={() => onDelete(singleEntry)}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </IconTooltip>
          )}
        </div>
      )}

      <div
        className="agent-canvas__rail"
        role="toolbar"
        aria-label="画布工具"
        aria-orientation="vertical"
        data-canvas-chrome
        style={{ left: insetLeft + 12 }}
      >
        <IconTooltip label="选择（V）" side="right">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="选择"
            aria-pressed={effectiveTool === 'select'}
            onClick={() => setTool('select')}
          >
            <MousePointer2 aria-hidden="true" />
          </Button>
        </IconTooltip>
        <IconTooltip label="抓手（H，或按住空格）" side="right">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="抓手"
            aria-pressed={effectiveTool === 'hand'}
            onClick={() => setTool('hand')}
          >
            <Hand aria-hidden="true" />
          </Button>
        </IconTooltip>
      </div>

      <div
        className="agent-canvas__controls"
        role="toolbar"
        aria-label="视图"
        data-canvas-chrome
        style={{ bottom: insetBottom + 12 }}
      >
        <IconTooltip label="缩小">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="缩小"
            onClick={() => zoomAbout(0.8)}
          >
            <Minus aria-hidden="true" />
          </Button>
        </IconTooltip>
        <IconTooltip label="缩放到 100%">
          <Button
            type="button"
            variant="ghost"
            size="compact"
            className="agent-canvas__zoom"
            aria-label={`缩放 ${Math.round(viewport.zoom * 100)}%，点按回到 100%`}
            onClick={() => zoomTo(1)}
          >
            {Math.round(viewport.zoom * 100)}%
          </Button>
        </IconTooltip>
        <IconTooltip label="放大">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="放大"
            onClick={() => zoomAbout(1.25)}
          >
            <Plus aria-hidden="true" />
          </Button>
        </IconTooltip>
        <IconTooltip label="显示全部（Shift+1）">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="显示全部"
            disabled={rects.length === 0}
            onClick={fitAll}
          >
            <Maximize aria-hidden="true" />
          </Button>
        </IconTooltip>
      </div>
    </div>
  );
}
