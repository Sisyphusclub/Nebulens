import { useEffect, useState } from 'react';

import { fetchTeamRecommendations } from '@/services/api/historyApi';
import type { TeamRecommendation } from '@/types/image';

const DEBOUNCE_MS = 600;
/** Fewer characters than this rarely describe a need well enough to match on. */
const MIN_QUERY_CHARS = 4;

/**
 * Recommendations for what the user is typing, fetched once typing pauses. Only the latest
 * query's answer is kept, and failures leave the list empty instead of interrupting typing.
 * `active` says the query is long enough to search; `loading` covers the pause and request.
 */
export function useTeamRecommendations(query: string, enabled: boolean, limit?: number) {
  const [items, setItems] = useState<TeamRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
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
      const request =
        limit === undefined
          ? fetchTeamRecommendations(trimmed, controller.signal)
          : fetchTeamRecommendations(trimmed, controller.signal, limit);
      request
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
  }, [active, trimmed, limit]);

  return { items, active, loading };
}
