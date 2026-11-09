import { useLayoutEffect, type RefObject } from 'react';

/** How close to the end of the page still counts as following the latest result. */
const FOLLOW_TOLERANCE_PX = 48;

function atPageEnd(): boolean {
  return (
    window.scrollY + window.innerHeight >=
    document.documentElement.scrollHeight - FOLLOW_TOLERANCE_PX
  );
}

/**
 * Keeps a reader who is following the latest result with it while it grows: the image
 * arriving, then the text check and the actions under it, would otherwise push its end down
 * behind the create bar. Someone who scrolled up to older work is left where they are.
 */
export function useFollowLatestResult(
  feedRef: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useLayoutEffect(() => {
    const feed = feedRef.current;
    if (!active || !feed || typeof ResizeObserver !== 'function') return undefined;

    let following = atPageEnd();
    let height = feed.getBoundingClientRect().height;
    const trackReader = (): void => {
      following = atPageEnd();
    };
    const observer = new ResizeObserver(() => {
      const next = feed.getBoundingClientRect().height;
      const grew = next - height;
      height = next;
      if (grew > 0 && following) window.scrollBy({ top: grew });
    });
    observer.observe(feed);
    window.addEventListener('scroll', trackReader, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', trackReader);
    };
  }, [feedRef, active]);
}
