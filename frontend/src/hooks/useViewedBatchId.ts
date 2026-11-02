import { useEffect, useState } from 'react';

/** Where in the viewport a batch counts as the one being looked at. */
const VIEW_ANCHOR = 0.45;

function batchAtAnchor(): string | null {
  const anchor = window.innerHeight * VIEW_ANCHOR;
  let closest: string | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  document.querySelectorAll<HTMLElement>('[data-generation-batch]').forEach((element) => {
    const { top, bottom } = element.getBoundingClientRect();
    const distance = anchor < top ? top - anchor : anchor > bottom ? anchor - bottom : 0;
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = element.dataset.generationBatch ?? null;
    }
  });
  return closest;
}

/**
 * The generation batch at the reading position, updated at most once a frame while the page
 * scrolls. `refreshKey` re-reads it when batches are added or removed without a scroll.
 */
export function useViewedBatchId(refreshKey: unknown): string | null {
  const [viewedBatchId, setViewedBatchId] = useState<string | null>(null);

  useEffect(() => {
    let frame: number | null = null;
    const update = () => {
      frame = null;
      setViewedBatchId(batchAtAnchor());
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [refreshKey]);

  return viewedBatchId;
}

const JUMP_SETTLE_MS = 160;

/**
 * Gives up a jump target once the page has arrived, or as soon as the reader scrolls by hand,
 * so the rail goes back to following the reading position.
 */
export function useReleaseJumpTarget(targetId: string | null, release: () => void): void {
  useEffect(() => {
    if (targetId === null) return undefined;
    let timer: number | null = null;
    const settle = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(release, JUMP_SETTLE_MS);
    };
    window.addEventListener('scroll', settle, { passive: true });
    window.addEventListener('wheel', release, { passive: true });
    window.addEventListener('touchmove', release, { passive: true });
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener('scroll', settle);
      window.removeEventListener('wheel', release);
      window.removeEventListener('touchmove', release);
    };
  }, [release, targetId]);
}
