import { useEffect } from 'react';

/**
 * Has the browser ask before the page unloads while `active`. A reload or closed tab ends the
 * request, and the server then drops images it was still making.
 */
export function useLeaveWarning(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers only ask when this is set; the text itself is never shown.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);
}
