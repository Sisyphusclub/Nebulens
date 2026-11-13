import { useEffect, useRef, useState, type RefObject } from 'react';

import { createStarfieldRenderer, lensWithin } from '@/utils/starfield';

/** The sky slides this many pixels a second on its own, so the stars always flow. */
const DRIFT_X = 7;
const DRIFT_Y = 1.6;
/** The share of the mouse's distance from the middle of the sky that the nearest stars move. */
const PARALLAX = 0.26;
/** Seconds the stars take to cover most of the way to where the mouse sends them. */
const EASE_SECONDS = 0.4;
/** A longer gap between frames (a hidden tab, a stall) counts as this much time at most. */
const LONGEST_STEP = 0.1;
/** Sixty frames a second is plenty for a slow sky, also on a screen that refreshes faster. */
const SHORTEST_FRAME_MS = 1000 / 60 - 2;
/** Frames that average slower than this mean the GPU cannot keep up at this sharpness. */
const SLOW_FRAME_MS = 26;
/** How many frames are averaged before judging, and how long the page gets to settle first. */
const JUDGED_FRAMES = 45;
const SETTLE_SECONDS = 1.5;
/** Each time the GPU falls behind, the sky is drawn this much softer, down to half. */
const SOFTEN = 0.75;
const SOFTEST = 0.5;

interface NavigatorHints {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
}

/** Devices that would stutter drawing the sky every frame get one still frame instead. */
function prefersStillBackdrop(): boolean {
  if (typeof navigator === 'undefined') return false;
  const hints = navigator as Navigator & NavigatorHints;
  if (hints.connection?.saveData) return true;
  if (hints.hardwareConcurrency && hints.hardwareConcurrency < 4) return true;
  return typeof hints.deviceMemory === 'number' && hints.deviceMemory < 4;
}

/**
 * The hero's night sky. The stars bend around the element `lens` points at, following it as
 * it moves or grows; they drift slowly and slide against the mouse. Where WebGL is missing
 * the hero keeps its plain background.
 */
export function LandingStarfield({
  lens,
  reducedMotion,
}: {
  lens: RefObject<HTMLElement | null>;
  reducedMotion: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [still] = useState(prefersStillBackdrop);
  const [ready, setReady] = useState(false);
  /** Counts the times the browser handed a lost GPU context back: each starts a new canvas. */
  const [restored, setRestored] = useState(0);
  const animated = !reducedMotion && !still;

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return undefined;
    // The canvas belongs to this run alone: a context that has been given back cannot draw
    // again, so a later run must not find the same canvas.
    const canvas = document.createElement('canvas');
    const renderer = createStarfieldRenderer(canvas);
    if (renderer === null) return undefined;
    host.append(canvas);

    let pending = 0;
    let visible = true;
    let lost = false;
    let shown = false;
    let last: number | null = null;
    let time = 0;
    let driftX = 0;
    let driftY = 0;
    let easedX = 0;
    let easedY = 0;
    let pointer: { x: number; y: number } | null = null;
    let measured: HTMLElement | null = null;
    let radius = 0;
    let quality = 1;
    let judgedTime = 0;
    let judgedFrames = 0;

    const paint = (now: number): void => {
      pending = 0;
      if (animated && last !== null && now - last < SHORTEST_FRAME_MS) {
        pending = requestAnimationFrame(paint);
        return;
      }
      const box = host.getBoundingClientRect();
      const target = lens.current;
      if (target !== measured) {
        measured = target;
        radius =
          target === null
            ? 0
            : Number.parseFloat(getComputedStyle(target).borderTopLeftRadius) || 0;
      }
      if (animated) {
        const gap = last === null ? 0 : (now - last) / 1000;
        const elapsed = Math.min(gap, LONGEST_STEP);
        last = now;
        time += elapsed;
        // A pause is not a slow frame, and neither is the page still loading around us.
        if (gap > 0 && gap < LONGEST_STEP && time > SETTLE_SECONDS) {
          judgedTime += gap;
          judgedFrames += 1;
          if (judgedFrames === JUDGED_FRAMES) {
            if ((judgedTime * 1000) / judgedFrames > SLOW_FRAME_MS) {
              quality = Math.max(quality * SOFTEN, SOFTEST);
            }
            judgedTime = 0;
            judgedFrames = 0;
          }
        }
        driftX += DRIFT_X * elapsed;
        driftY += DRIFT_Y * elapsed;
        // The mouse counts from the middle of the sky, and no further than its edges.
        const reachX = box.width / 2;
        const reachY = box.height / 2;
        const targetX =
          pointer === null
            ? 0
            : Math.min(Math.max(pointer.x - box.left - reachX, -reachX), reachX) * PARALLAX;
        const targetY =
          pointer === null
            ? 0
            : Math.min(Math.max(pointer.y - box.top - reachY, -reachY), reachY) * PARALLAX;
        const ease = 1 - Math.exp(-elapsed / EASE_SECONDS);
        easedX += (targetX - easedX) * ease;
        easedY += (targetY - easedY) * ease;
      }
      if (box.width > 0 && box.height > 0) {
        renderer.draw({
          width: box.width,
          height: box.height,
          pixelRatio: window.devicePixelRatio || 1,
          quality,
          lens: lensWithin(box, target?.getBoundingClientRect() ?? null, radius),
          shiftX: driftX + easedX,
          shiftY: driftY + easedY,
          time,
        });
        if (!shown) {
          shown = true;
          setReady(true);
        }
      }
      if (animated && visible) pending = requestAnimationFrame(paint);
    };
    const request = (): void => {
      if (pending === 0 && !lost) pending = requestAnimationFrame(paint);
    };
    const pause = (): void => {
      cancelAnimationFrame(pending);
      pending = 0;
      // The time spent paused is not replayed as one long step.
      last = null;
    };

    const onPointerMove = (event: PointerEvent): void => {
      // A touch scrolls the page; it is not pointing at anything.
      if (event.pointerType === 'touch') return;
      pointer = { x: event.clientX, y: event.clientY };
    };
    const onLost = (event: Event): void => {
      // Without this the browser never offers the context back.
      event.preventDefault();
      lost = true;
      pause();
    };
    const onRestored = (): void => setRestored((count) => count + 1);
    // A browser may drop what a hidden tab's canvas showed; nothing would draw the still
    // frame again, so it is drawn once more when the tab comes back.
    const onShown = (): void => {
      if (!document.hidden) request();
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    document.addEventListener('visibilitychange', onShown);

    let scrollWatch: IntersectionObserver | null = null;
    let sizeWatch: ResizeObserver | null = null;
    if (animated) {
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      if (typeof IntersectionObserver === 'function') {
        // Nothing is drawn while the hero is scrolled away.
        scrollWatch = new IntersectionObserver(([entry]) => {
          visible = entry?.isIntersecting ?? true;
          if (visible) request();
          else pause();
        });
        scrollWatch.observe(host);
      }
    } else if (typeof ResizeObserver === 'function') {
      // The still frame is drawn again only when the sky or the composer changes size.
      sizeWatch = new ResizeObserver(request);
      sizeWatch.observe(host);
      if (lens.current !== null) sizeWatch.observe(lens.current);
    }
    request();

    return () => {
      pause();
      scrollWatch?.disconnect();
      sizeWatch?.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      document.removeEventListener('visibilitychange', onShown);
      renderer.dispose();
      canvas.remove();
      setReady(false);
    };
  }, [animated, lens, restored]);

  return (
    <div ref={hostRef} className="home-backdrop__stars" data-ready={ready} aria-hidden="true" />
  );
}
