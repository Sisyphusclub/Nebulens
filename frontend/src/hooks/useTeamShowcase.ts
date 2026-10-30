import { useEffect, useState } from 'react';

import { fetchTeamHistory } from '@/services/api/historyApi';
import type { TeamImageRecord } from '@/types/image';
import { isTextFixPrompt } from '@/utils/textCheck';

/** About three rows of the full-width masonry. */
const SHOWCASE_SIZE = 18;

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
        // A text-fix edit only makes sense on its source image, so it is no model to copy,
        // and repeats of one prompt would fill the wall with near-identical work.
        const seenPrompts = new Set<string>();
        const showcase = page.records.filter((record) => {
          if (isTextFixPrompt(record.prompt) || seenPrompts.has(record.prompt)) return false;
          seenPrompts.add(record.prompt);
          return true;
        });
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
