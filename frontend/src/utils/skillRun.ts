import type { GenerationSettingsSnapshot } from '@/types/image';
import { isRecord } from '@/utils/narrowing';

export interface SkillRunStep {
  /** The output's name, e.g. "主图", used in notices. */
  label: string;
  settings: GenerationSettingsSnapshot;
}

/** A planned skill run handed from the homepage to the generate page. */
export interface SkillRunRequest {
  skillLabel: string;
  steps: SkillRunStep[];
}

/** Reads a skill run from navigation state; anything malformed is ignored. */
export function readSkillRun(state: unknown): SkillRunRequest | null {
  if (!isRecord(state) || !isRecord(state.skillRun)) return null;
  const { skillLabel, steps } = state.skillRun;
  if (typeof skillLabel !== 'string' || !Array.isArray(steps) || steps.length === 0) return null;
  const valid = steps.every(
    (step) =>
      isRecord(step) &&
      typeof step.label === 'string' &&
      isRecord(step.settings) &&
      typeof step.settings.prompt === 'string',
  );
  return valid ? { skillLabel, steps: steps as SkillRunStep[] } : null;
}
