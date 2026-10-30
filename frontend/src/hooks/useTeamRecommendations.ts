import { useDescribedSearch } from '@/hooks/useDescribedSearch';
import { fetchTeamRecommendations } from '@/services/api/historyApi';
import type { TeamRecommendation } from '@/types/image';

/** Teammates' shared work for what the user is typing; see `useDescribedSearch`. */
export function useTeamRecommendations(query: string, enabled: boolean, limit?: number) {
  return useDescribedSearch<TeamRecommendation>(query, enabled, (text, signal) =>
    limit === undefined
      ? fetchTeamRecommendations(text, signal)
      : fetchTeamRecommendations(text, signal, limit),
  );
}
