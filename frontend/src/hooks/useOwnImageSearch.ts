import { useDescribedSearch } from '@/hooks/useDescribedSearch';
import { fetchOwnImageMatches } from '@/services/api/historyApi';

/** The recommendations API's ceiling, so a search shows everything relevant it finds. */
const SEARCH_LIMIT = 12;

/** The user's own images for a described need, best first; see `useDescribedSearch`. */
export function useOwnImageSearch(query: string, enabled: boolean) {
  return useDescribedSearch<{ id: string; reason: string }>(query, enabled, (text, signal) =>
    fetchOwnImageMatches(text, signal, SEARCH_LIMIT),
  );
}
