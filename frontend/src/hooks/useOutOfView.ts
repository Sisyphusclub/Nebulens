import { useEffect, useState, type RefObject } from 'react';

/**
 * Whether the element has scrolled out of the window. False until the browser says so, and
 * where it cannot tell.
 */
export function useOutOfView(target: RefObject<Element | null>): boolean {
  const [out, setOut] = useState(false);

  useEffect(() => {
    const element = target.current;
    if (element === null || typeof IntersectionObserver !== 'function') return undefined;
    const watch = new IntersectionObserver(([entry]) => {
      if (entry !== undefined) setOut(!entry.isIntersecting);
    });
    watch.observe(element);
    return () => watch.disconnect();
  }, [target]);

  return out;
}
