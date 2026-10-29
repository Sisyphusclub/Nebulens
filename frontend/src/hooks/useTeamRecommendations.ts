import { useEffect, useState } from 'react';

import { fetchTeamRecommendations } from '@/services/api/historyApi';
import type { TeamRecommendation } from '@/types/image';

const DEBOUNCE_MS = 600;
/** Fewer characters than this rarely describe a need well enough to match on. */
const MIN_QUERY_CHARS = 4;

/**
 * Recommendations for what the user is typing, fetched once typing pauses. Only the latest
 * query's answer is kept, and failures leave the list empty instead of interrupting typing.
 */
export function useTeamRecommendations(query: string, enabled: boolean) {
  const [items, setItems] = useState<TeamRecommendation[]>([]);
  const trimmed = query.trim();
  const active = enabled && Array.from(trimmed.replace(/\s/gu, '')).length >= MIN_QUERY_CHARS;

  useEffect(() => {
    if (!active) {
      setItems([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchTeamRecommendations(trimmed, controller.signal)
        .then((next) => {
          if (!controller.signal.aborted) setItems(next);
        })
        .catch(() => {
          if (!controller.signal.aborted) setItems([]);
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, trimmed]);

  return { items };
}
