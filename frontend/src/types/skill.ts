import type { AspectChoice } from '@/types/image';

interface SkillFieldBase {
  id: string;
  label: string;
  required?: boolean;
  placeholder?: string;
}

export type SkillField =
  | (SkillFieldBase & { kind: 'text'; maxLength: number })
  | (SkillFieldBase & { kind: 'list'; maxLength: number; maxItems: number })
  | (SkillFieldBase & { kind: 'choice'; options: string[]; defaultValue: string });

/** A skill's form as the server describes it; how it plans prompts stays server-side. */
export interface SkillForm {
  id: string;
  label: string;
  description: string;
  reference: 'none' | 'optional' | 'required';
  referenceLabel?: string;
  fields: SkillField[];
  /** One image is generated per output, in this order. */
  outputs: Array<{ id: string; label: string }>;
}

export type SkillValues = Record<string, string | string[]>;

export interface PlannedSkillOutput {
  id: string;
  label: string;
  aspect: AspectChoice;
  prompt: string;
}

export interface SkillPlan {
  title: string;
  outputs: PlannedSkillOutput[];
}
