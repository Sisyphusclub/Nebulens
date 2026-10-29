import { useEffect, useState } from 'react';

import { fetchTeamHistory } from '@/services/api/historyApi';
import type { TeamImageRecord } from '@/types/image';
import { isTextFixPrompt } from '@/utils/textCheck';

/** Two rows of the showcase grid. */
const SHOWCASE_SIZE = 8;

/**
 * The team's newest shared work for the Discover page. The library needs a signed-in
 * user, and a failed load just hides the showcase rather than interrupting the page.
 */
export function useTeamShowcase(enabled: boolean): TeamImageRecord[] {
  const [records, setRecords] = useState<TeamImageRecord[]>([]);

  useEffect(() => {
    if (!enabled) {
      setRecords([]);
      return undefined;
    }
    let cancelled = false;
    fetchTeamHistory()
      .then((page) => {
        if (cancelled) return;
        // A text-fix edit only makes sense on its source image, so it is no model to copy.
        const showcase = page.records.filter((record) => !isTextFixPrompt(record.prompt));
        setRecords(showcase.slice(0, SHOWCASE_SIZE));
      })
      .catch(() => {
        if (!cancelled) setRecords([]);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return records;
}
