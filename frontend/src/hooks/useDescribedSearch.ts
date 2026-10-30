import { useEffect, useRef, useState } from 'react';

const DEBOUNCE_MS = 600;
/** Fewer characters than this rarely describe a need well enough to match on. */
const MIN_QUERY_CHARS = 4;

/**
 * Results for a described need, fetched once typing pauses. Only the latest query's
 * answer is kept, and failures leave the list empty instead of interrupting typing.
 * `active` says the query is long enough to search; `loading` covers the pause and request.
 */
export function useDescribedSearch<T>(
  query: string,
  enabled: boolean,
  search: (query: string, signal: AbortSignal) => Promise<T[]>,
): { items: T[]; active: boolean; loading: boolean } {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef(search);
  useEffect(() => {
    searchRef.current = search;
  }, [search]);
  const trimmed = query.trim();
  const active = enabled && Array.from(trimmed.replace(/\s/gu, '')).length >= MIN_QUERY_CHARS;

  useEffect(() => {
    if (!active) {
      setItems([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchRef
        .current(trimmed, controller.signal)
        .then((next) => {
          if (!controller.signal.aborted) setItems(next);
        })
        .catch(() => {
          if (!controller.signal.aborted) setItems([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, trimmed]);

  return { items, active, loading };
}
