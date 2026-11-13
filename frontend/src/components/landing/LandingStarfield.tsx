import { useEffect, useRef, useState, type RefObject } from 'react';

import { createStarfieldRenderer, lensWithin } from '@/utils/starfield';

/** How far the camera swings round the sky with the mouse at the sky's edge, in radians. */
const SWING = 0.42;
/** Seconds the camera takes to cover most of the way to where the mouse sends it. */
const EASE_SECONDS = 0.3;
/** This close to where it is going, the camera counts as there, and drawing stops. */
const AT_REST = 0.001;
/** A longer gap between frames (a stall) moves the camera as far as this much time would. */
const LONGEST_STEP = 0.1;
/** Sixty frames a second is plenty, also on a screen that refreshes faster. */
const SHORTEST_FRAME_MS = 1000 / 60 - 2;
/** Frames that average slower than this mean the GPU cannot keep up at this sharpness. */
const SLOW_FRAME_MS = 26;
/** How many frames are averaged before judging, and how long the page gets to settle first. */
const JUDGED_FRAMES = 45;
const SETTLE_MS = 1500;
/** Each time the GPU falls behind, the sky is drawn this much softer, down to half. */
const SOFTEN = 0.75;
const SOFTEST = 0.5;

interface NavigatorHints {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
}

/** Devices that would stutter drawing the sky as it moves get one still frame instead. */
function prefersStillBackdrop(): boolean {
  if (typeof navigator === 'undefined') return false;
  const hints = navigator as Navigator & NavigatorHints;
  if (hints.connection?.saveData) return true;
  if (hints.hardwareConcurrency && hints.hardwareConcurrency < 4) return true;
  return typeof hints.deviceMemory === 'number' && hints.deviceMemory < 4;
}

/**
 * The hero's night sky. The stars bend around the element `lens` points at, following it as
 * it moves or grows. The sky stands still, and is not drawn, until the mouse moves: then
 * the camera swings round it towards the mouse, and the stars slide past each other by
 * their depth. Where WebGL is missing the hero keeps its plain background.
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
    /** When the last frame of the current movement was drawn; null while the sky is still. */
    let last: number | null = null;
    let startedAt: number | null = null;
    /** Where the camera is on its way to the mouse: -1 to 1 across, and the same scale down. */
    let aimX = 0;
    let aimY = 0;
    let pointer: { x: number; y: number } | null = null;
    let measured: HTMLElement | null = null;
    let radius = 0;
    let quality = 1;
    let judgedTime = 0;
    let judgedFrames = 0;

    const paint = (now: number): void => {
      pending = 0;
      if (last !== null && now - last < SHORTEST_FRAME_MS) {
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
      let moving = false;
      if (animated) {
        startedAt ??= now;
        const gap = last === null ? 0 : (now - last) / 1000;
        // The page still loading around us is not a slow GPU, and neither is a stall.
        if (gap > 0 && gap < LONGEST_STEP && now - startedAt > SETTLE_MS) {
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
        // The mouse counts from the middle of the sky. Half the sky's width is a full swing,
        // across and down alike, and the camera goes no further than that.
        const half = box.width / 2;
        const swing = (offset: number): number =>
          pointer === null || half === 0 ? 0 : Math.min(Math.max(offset / half, -1), 1);
        const goalX = swing((pointer?.x ?? 0) - box.left - half);
        const goalY = swing((pointer?.y ?? 0) - box.top - box.height / 2);
        const ease = 1 - Math.exp(-Math.min(gap, LONGEST_STEP) / EASE_SECONDS);
        aimX += (goalX - aimX) * ease;
        aimY += (goalY - aimY) * ease;
        moving = Math.abs(goalX - aimX) > AT_REST || Math.abs(goalY - aimY) > AT_REST;
        if (!moving) {
          aimX = goalX;
          aimY = goalY;
        }
        last = moving ? now : null;
      }
      if (box.width > 0 && box.height > 0) {
        renderer.draw({
          width: box.width,
          height: box.height,
          pixelRatio: window.devicePixelRatio || 1,
          quality,
          lens: lensWithin(box, target?.getBoundingClientRect() ?? null, radius),
          yaw: aimX * SWING,
          pitch: aimY * SWING,
        });
        if (!shown) {
          shown = true;
          setReady(true);
        }
      }
      // Once the camera has caught up with the mouse there is nothing new to draw.
      if (moving && visible) pending = requestAnimationFrame(paint);
    };
    const request = (): void => {
      if (pending === 0 && !lost) pending = requestAnimationFrame(paint);
    };
    const pause = (): void => {
      cancelAnimationFrame(pending);
      pending = 0;
      // The time spent paused is not counted as one long frame.
      last = null;
    };

    const onPointerMove = (event: PointerEvent): void => {
      // A touch scrolls the page; it is not pointing at anything.
      if (event.pointerType === 'touch') return;
      pointer = { x: event.clientX, y: event.clientY };
      if (visible) request();
    };
    const onLost = (event: Event): void => {
      // Without this the browser never offers the context back.
      event.preventDefault();
      lost = true;
      pause();
    };
    const onRestored = (): void => setRestored((count) => count + 1);
    // A browser may drop what a hidden tab's canvas showed, and nothing else would draw
    // the sky again while it stands still: it is drawn once more when the tab comes back.
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
    }
    if (typeof ResizeObserver === 'function') {
      // The sky stands still, so the stars have to be told when the composer they bend
      // around grows or moves: either box changing size redraws them.
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
