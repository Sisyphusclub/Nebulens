import { useCallback, useEffect, useRef, useState } from 'react';

import type { GenerationSettingsSnapshot, HistoryEntry } from '@/types/image';
import type { FeedItem } from '@/utils/generationFeed';
import type { SkillRunRequest } from '@/utils/skillRun';

type SkillJob =
  | { kind: 'generate'; label: string; settings: GenerationSettingsSnapshot }
  | { kind: 'fix'; batchId: string; entryId: string };

interface UseSkillRunOptions {
  /** True while any generation, ours or the user's, is in flight. */
  isGenerating: boolean;
  feed: readonly FeedItem[];
  /** Resolves to the saved batch id, or undefined when the generation failed. */
  runGeneration: (settings: GenerationSettingsSnapshot) => Promise<string | undefined>;
  fixText: (item: FeedItem, entry: HistoryEntry) => Promise<void>;
  notify: (message: string, tone?: 'success' | 'error') => void;
}

/**
 * Runs a skill's images one after another, since the page generates one batch at a
 * time, then quality-checks them: once the vision model has read an image, wrong
 * text is redrawn once automatically.
 */
export function useSkillRun({
  isGenerating,
  feed,
  runGeneration,
  fixText,
  notify,
}: UseSkillRunOptions) {
  const [queue, setQueue] = useState<SkillJob[]>([]);
  const [running, setRunning] = useState(false);
  /**
   * Skill images waiting for their text check, by batch id, with the output name. State,
   * not a ref, so an image whose check landed before it was registered is still seen.
   */
  const [awaitingCheck, setAwaitingCheck] = useState<ReadonlyMap<string, string>>(new Map());
  const latest = useRef({ feed, runGeneration, fixText, notify });
  latest.current = { feed, runGeneration, fixText, notify };

  const start = useCallback((request: SkillRunRequest) => {
    setQueue((current) => [
      ...current,
      ...request.steps.map(
        (step): SkillJob => ({ kind: 'generate', label: step.label, settings: step.settings }),
      ),
    ]);
    latest.current.notify(
      `「${request.skillLabel}」会依次生成 ${request.steps.length} 张图，并自动检查文字。`,
    );
  }, []);

  /** Drops the images not yet started; the one in flight is stopped by the caller. */
  const cancel = useCallback(() => setQueue([]), []);

  useEffect(() => {
    if (running || isGenerating || queue.length === 0) return;
    const [job, ...rest] = queue;
    if (job === undefined) return;
    setQueue(rest);
    setRunning(true);
    void (async () => {
      try {
        if (job.kind === 'generate') {
          const batchId = await latest.current.runGeneration(job.settings);
          if (batchId !== undefined) {
            setAwaitingCheck((current) => new Map(current).set(batchId, job.label));
          }
        } else {
          const item = latest.current.feed.find((candidate) => candidate.id === job.batchId);
          const entry = item?.entries.find((candidate) => candidate.record.id === job.entryId);
          if (item !== undefined && entry !== undefined) await latest.current.fixText(item, entry);
        }
      } finally {
        setRunning(false);
      }
    })();
  }, [isGenerating, queue, running]);

  useEffect(() => {
    const checked = [...awaitingCheck].flatMap(([batchId, label]) => {
      const item = feed.find((candidate) => candidate.id === batchId);
      // A fresh image carries no status until history is re-fetched, so only a finished
      // check counts; images that are never analyzed simply stay unchecked.
      const finished = item?.entries.every(
        (entry) =>
          entry.record.analysisStatus === 'done' || entry.record.analysisStatus === 'failed',
      );
      return item !== undefined && finished === true ? [{ batchId, label, item }] : [];
    });
    if (checked.length === 0) return;
    setAwaitingCheck((current) => {
      const next = new Map(current);
      for (const { batchId } of checked) next.delete(batchId);
      return next;
    });
    const fixes: SkillJob[] = [];
    for (const { batchId, label, item } of checked) {
      const wrong = item.entries.filter((entry) => entry.record.textCheck?.status === 'issues');
      if (wrong.length === 0) continue;
      latest.current.notify(`「${label}」的文字有误，正在自动重画。`);
      fixes.push(
        ...wrong.map((entry): SkillJob => ({ kind: 'fix', batchId, entryId: entry.record.id })),
      );
    }
    if (fixes.length > 0) setQueue((current) => [...current, ...fixes]);
  }, [awaitingCheck, feed]);

  return { start, cancel, isRunning: running || queue.length > 0 };
}
