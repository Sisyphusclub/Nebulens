import { useEffect, useState, type RefObject } from 'react';

export const LATEST_BATCH_COMPOSER_GAP = 24;

interface LatestBatchVisibilityOptions {
  /** Changes whenever the latest batch's identity or rendered size may have changed; null when there is no batch. */
  visibilityKey: string | null;
  latestBatchRef: RefObject<HTMLElement | null>;
  composerRef: RefObject<HTMLElement | null>;
  feedRef: RefObject<HTMLElement | null>;
}

/**
 * Reports whether the latest generation batch is hidden behind the floating composer
 * (or scrolled out of view), so the page can offer a "jump to latest" control.
 */
export function useLatestBatchVisibility({
  visibilityKey,
  latestBatchRef,
  composerRef,
  feedRef,
}: LatestBatchVisibilityOptions): boolean {
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    if (!visibilityKey) {
      setIsHidden(false);
      return undefined;
    }

    const updateVisibility = () => {
      const batchElement = latestBatchRef.current;
      const composerElement = composerRef.current;
      if (!batchElement || !composerElement) {
        setIsHidden(false);
        return;
      }

      const batchRect = batchElement.getBoundingClientRect();
      const composerRect = composerElement.getBoundingClientRect();
      if (batchRect.width === 0 && batchRect.height === 0) {
        setIsHidden(false);
        return;
      }

      const composerBoundary =
        composerRect.height > 0 && composerRect.top > 0
          ? Math.min(
              window.innerHeight - LATEST_BATCH_COMPOSER_GAP,
              composerRect.top - LATEST_BATCH_COMPOSER_GAP,
            )
          : window.innerHeight - LATEST_BATCH_COMPOSER_GAP;
      const visibleHeight = Math.max(
        0,
        Math.min(batchRect.bottom, composerBoundary) - Math.max(batchRect.top, 0),
      );
      const requiredVisibleHeight = Math.min(
        batchRect.height,
        Math.max(0, composerBoundary),
        Math.max(160, Math.min(280, composerBoundary * 0.4)),
      );
      const isFullyAboveComposer = batchRect.bottom <= composerBoundary;
      setIsHidden(!isFullyAboveComposer || visibleHeight < requiredVisibleHeight);
    };

    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    window.addEventListener('resize', updateVisibility);
    const resizeObserver =
      typeof ResizeObserver === 'function' ? new ResizeObserver(updateVisibility) : null;
    if (latestBatchRef.current) resizeObserver?.observe(latestBatchRef.current);
    if (composerRef.current) resizeObserver?.observe(composerRef.current);
    if (feedRef.current) resizeObserver?.observe(feedRef.current);

    return () => {
      window.removeEventListener('scroll', updateVisibility);
      window.removeEventListener('resize', updateVisibility);
      resizeObserver?.disconnect();
    };
  }, [visibilityKey, latestBatchRef, composerRef, feedRef]);

  return isHidden;
}
