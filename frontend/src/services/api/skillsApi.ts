import { isAspectChoice } from '@/types/image';
import type { SkillField, SkillForm, SkillPlan, SkillValues } from '@/types/skill';
import { isRecord } from '@/utils/narrowing';

import {
  ImageApiError,
  authedFetch,
  buildApiError,
  buildApiUrl,
  parseJsonResponse,
  publicFetch,
} from './httpClient';

function isSkillField(value: unknown): value is SkillField {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.label !== 'string') {
    return false;
  }
  if (value.kind === 'text') return typeof value.maxLength === 'number';
  if (value.kind === 'list') {
    return typeof value.maxLength === 'number' && typeof value.maxItems === 'number';
  }
  return (
    value.kind === 'choice' &&
    Array.isArray(value.options) &&
    value.options.every((option) => typeof option === 'string') &&
    typeof value.defaultValue === 'string'
  );
}

function isSkillForm(value: unknown): value is SkillForm {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    typeof value.description === 'string' &&
    (value.reference === 'none' ||
      value.reference === 'optional' ||
      value.reference === 'required') &&
    Array.isArray(value.fields) &&
    value.fields.every(isSkillField) &&
    Array.isArray(value.outputs) &&
    value.outputs.every(
      (output) =>
        isRecord(output) && typeof output.id === 'string' && typeof output.label === 'string',
    )
  );
}

/** Every skill's form; public, so skill mode works before signing in. */
export async function fetchSkillForms(): Promise<SkillForm[]> {
  const response = await publicFetch(buildApiUrl('/api/skills'));
  const payload = await parseJsonResponse(response);
  if (!response.ok) throw buildApiError(response.status, payload);
  if (!isRecord(payload) || !Array.isArray(payload.skills) || !payload.skills.every(isSkillForm)) {
    throw new ImageApiError(response.status, 'INVALID_RESPONSE', '技能接口返回了无法识别的响应。');
  }
  return payload.skills;
}

export interface SkillPlanRequest {
  /** The line typed after the skill in the composer; the server reads the answers from it. */
  brief: string;
  /** The skill's choices, such as its style. */
  values: SkillValues;
  hasReference: boolean;
}

/** Has the server write one ready-to-generate prompt per output image of the skill. */
export async function planSkill(skillId: string, request: SkillPlanRequest): Promise<SkillPlan> {
  const response = await authedFetch(
    buildApiUrl(`/api/skills/${encodeURIComponent(skillId)}/plan`),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    },
  );
  const payload = await parseJsonResponse(response);
  if (!response.ok) throw buildApiError(response.status, payload);
  if (
    !isRecord(payload) ||
    typeof payload.title !== 'string' ||
    !Array.isArray(payload.outputs) ||
    !payload.outputs.every(
      (output) =>
        isRecord(output) &&
        typeof output.id === 'string' &&
        typeof output.label === 'string' &&
        typeof output.prompt === 'string' &&
        typeof output.aspect === 'string' &&
        isAspectChoice(output.aspect),
    )
  ) {
    throw new ImageApiError(response.status, 'INVALID_RESPONSE', '技能接口返回了无法识别的响应。');
  }
  return payload as unknown as SkillPlan;
}

/**
 * Agent mode: asks the server which skill fits a request typed in the composer. Null
 * means none does, and the request is generated as a plain image.
 */
export async function selectSkillForBrief(
  brief: string,
  hasReference: boolean,
): Promise<string | null> {
  const response = await authedFetch(buildApiUrl('/api/skills/select'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ brief, hasReference }),
  });
  const payload = await parseJsonResponse(response);
  if (!response.ok) throw buildApiError(response.status, payload);
  if (!isRecord(payload) || !(payload.skillId === null || typeof payload.skillId === 'string')) {
    throw new ImageApiError(response.status, 'INVALID_RESPONSE', '技能接口返回了无法识别的响应。');
  }
  return payload.skillId;
}
