import { useLayoutEffect, type RefObject } from 'react';

/** Breathing room between the last result and the top of the create bar. */
const FEED_GAP_PX = 40;
/** How close to the end of the page still counts as reading the latest result. */
const AT_BOTTOM_TOLERANCE_PX = 48;

/**
 * Keeps the result feed clear of the fixed create bar. The bar grows when team
 * recommendations or the AI insight bar appear, so the space it covers is measured
 * into `--studio-create-bar-reserve` on the console instead of a fixed padding, and
 * a user already at the bottom is scrolled along so the latest result stays visible.
 */
export function useCreateBarReserve(barRef: RefObject<HTMLElement | null>, active: boolean): void {
  useLayoutEffect(() => {
    const bar = barRef.current;
    const host = bar?.closest<HTMLElement>('.generation-console');
    if (!active || !bar || !host) return undefined;

    let reserve = 0;
    const measure = (): void => {
      const next = Math.ceil(window.innerHeight - bar.getBoundingClientRect().top + FEED_GAP_PX);
      if (next <= 0 || next === reserve) return;
      const atBottom =
        window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - AT_BOTTOM_TOLERANCE_PX;
      const grew = reserve > 0 ? next - reserve : 0;
      reserve = next;
      host.style.setProperty('--studio-create-bar-reserve', `${next}px`);
      if (atBottom && grew > 0) window.scrollBy({ top: grew });
    };

    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : undefined;
    observer?.observe(bar);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      host.style.removeProperty('--studio-create-bar-reserve');
    };
  }, [barRef, active]);
}
