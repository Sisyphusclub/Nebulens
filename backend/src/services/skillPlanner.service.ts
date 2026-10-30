import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logger.js';
import type {
  SkillDefinition,
  SkillField,
  SkillOutput,
  SkillValues,
} from '../skills/skillDefinitions.js';
import type { AspectRatio } from '../types/image.js';
import { chatApiHeaders } from '../utils/chatApiHeaders.js';
import { extractVisibleTexts } from '../utils/visibleText.js';

export interface PlannedOutput {
  id: string;
  label: string;
  aspect: AspectRatio | 'auto';
  prompt: string;
}

export interface SkillPlan {
  /** Session title for the run, e.g. "电商主图 · 山川明前绿茶". */
  title: string;
  outputs: PlannedOutput[];
}

/** Turns a skill's form answers into one ready-to-generate prompt per output image. */
export interface SkillPlanner {
  plan(skill: SkillDefinition, values: SkillValues, hasReference: boolean): Promise<SkillPlan>;
}

export interface SkillPlannerConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  fetchImpl?: typeof globalThis.fetch;
}

/** The form a client renders; the planner's guidance and briefs stay on the server. */
export function publicSkill(skill: SkillDefinition) {
  return {
    id: skill.id,
    label: skill.label,
    description: skill.description,
    reference: skill.reference,
    ...(skill.referenceLabel === undefined ? {} : { referenceLabel: skill.referenceLabel }),
    fields: skill.fields,
    outputs: skill.outputs.map((output) => ({ id: output.id, label: output.label })),
  };
}

/** Quotes mark the text to draw, so they are stripped from what users type. */
function clean(text: string): string {
  return text
    .replace(/[“”"「」『』]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function invalid(message: string): AppError {
  return new AppError('BAD_REQUEST', message, 400);
}

function readField(field: SkillField, value: unknown): string | string[] {
  if (field.kind === 'list') {
    const items = (Array.isArray(value) ? value : [])
      .filter((item): item is string => typeof item === 'string')
      .map(clean)
      .filter((item) => item.length > 0);
    if (field.required && items.length === 0) throw invalid(`请填写${field.label}。`);
    if (items.length > field.maxItems) throw invalid(`${field.label}最多填 ${field.maxItems} 条。`);
    if (items.some((item) => item.length > field.maxLength)) {
      throw invalid(`${field.label}每条不超过 ${field.maxLength} 个字。`);
    }
    return items;
  }
  if (field.kind === 'choice') {
    if (value === undefined || value === '') return field.defaultValue;
    if (typeof value !== 'string' || !field.options.includes(value)) {
      throw invalid(`${field.label}只能从给出的选项中选择。`);
    }
    return value;
  }
  const text = typeof value === 'string' ? clean(value) : '';
  if (field.required && text.length === 0) throw invalid(`请填写${field.label}。`);
  if (text.length > field.maxLength)
    throw invalid(`${field.label}不超过 ${field.maxLength} 个字。`);
  return text;
}

/** Validates form answers against the skill's fields; unknown keys are ignored. */
export function readSkillValues(
  skill: SkillDefinition,
  raw: unknown,
  hasReference: boolean,
): SkillValues {
  if (skill.reference === 'required' && !hasReference) {
    throw invalid(`请先上传${skill.referenceLabel ?? '参考图'}。`);
  }
  const input = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const answers = new Map<string, string | string[]>();
  for (const field of skill.fields) answers.set(field.id, readField(field, input[field.id]));
  return {
    text: (fieldId) => {
      const value = answers.get(fieldId);
      return typeof value === 'string' ? value : '';
    },
    list: (fieldId) => {
      const value = answers.get(fieldId);
      return Array.isArray(value) ? value : [];
    },
  };
}

function answerText(field: SkillField, values: SkillValues): string {
  return field.kind === 'list' ? values.list(field.id).join('、') : values.text(field.id);
}

function outputAspect(output: SkillOutput, values: SkillValues): AspectRatio | 'auto' {
  return typeof output.aspect === 'function' ? output.aspect(values) : output.aspect;
}

function quoted(texts: readonly string[]): string {
  return texts.map((text) => `“${text}”`).join('、');
}

/** The prompt used when no chat model is set up or its answer cannot be trusted. */
export function fallbackPrompt(
  skill: SkillDefinition,
  output: SkillOutput,
  values: SkillValues,
  hasReference: boolean,
): string {
  const texts = output.texts?.(values) ?? [];
  const details = skill.fields.flatMap((field) => {
    const answer = answerText(field, values);
    return answer.length > 0 && !texts.includes(answer) ? [`${field.label}：${answer}`] : [];
  });
  return `${[
    output.brief,
    details.join('；'),
    hasReference ? '保持参考图中主体的外观、颜色、形状和文字完全不变' : '',
    texts.length > 0
      ? `画面中清晰准确地写出${quoted(texts)}，不要出现其他文字`
      : '画面中不要出现任何文字',
  ]
    .filter((part) => part.length > 0)
    .join('。')}。`;
}

const PLANNER_RULES = [
  '你是资深商业视觉设计师，把用户填写的需求表单写成给 AI 绘图模型用的中文提示词，每张图一段。',
  '1. 每段 80 到 200 字，写清主体、场景、构图与视角、光线、色调和风格质感，并体现这张图的用途。',
  '2. “必须出现的文字”要放在中文引号“”里原样写进提示词，一个字都不能改，并说明它在画面中的位置和字体风格；不要新增其他要出现在画面中的文字，也不要给其他内容加引号。没有列出文字的图，写明画面中不要出现文字。',
  '3. 用户上传了参考图时，写明保留参考图中主体的外观、颜色、形状和文字不变。',
  '4. 只输出一个 JSON 对象，键是图片 id，值是这张图的提示词，不要解释，不要 Markdown。',
].join('\n');

function plannerRequest(
  skill: SkillDefinition,
  values: SkillValues,
  hasReference: boolean,
): string {
  const answers = skill.fields.flatMap((field) => {
    const answer = answerText(field, values);
    return answer.length > 0 ? [`- ${field.label}：${answer}`] : [];
  });
  const outputs = skill.outputs.map((output) => {
    const aspect = outputAspect(output, values);
    const texts = output.texts?.(values) ?? [];
    const textNote = texts.length > 0 ? `必须出现的文字：${quoted(texts)}` : '不要文字。';
    return `- ${output.id}（${output.label}，${aspect === 'auto' ? '与参考图同比例' : aspect}）：${output.brief}。${textNote}`;
  });
  return [
    `技能：${skill.label}`,
    '表单：',
    ...answers,
    `参考图：${hasReference ? '已上传' : '未上传'}`,
    '需要的图片：',
    ...outputs,
  ].join('\n');
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('Planner answer has no JSON object');
  const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Planner answer is not a JSON object');
  }
  return parsed as Record<string, unknown>;
}

/**
 * A planned prompt is used only if it keeps every required text exactly and quotes
 * nothing else, since the text check compares the image against the quoted text.
 */
function acceptPlannedPrompt(candidate: unknown, texts: readonly string[]): string | undefined {
  if (typeof candidate !== 'string') return undefined;
  const prompt = candidate.trim();
  if (prompt.length < 10 || prompt.length > 2000) return undefined;
  if (!texts.every((text) => prompt.includes(text))) return undefined;
  const extras = extractVisibleTexts(prompt).filter(
    (segment) => !texts.some((text) => segment.includes(text)),
  );
  return extras.length === 0 ? prompt : undefined;
}

async function askPlanner(
  config: SkillPlannerConfig,
  skill: SkillDefinition,
  values: SkillValues,
  hasReference: boolean,
): Promise<Record<string, unknown>> {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const response = await fetchImpl(`${config.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers: chatApiHeaders(config.apiKey, 'nebulens-skill-plan'),
    body: JSON.stringify({
      model: config.model,
      temperature: 0.7,
      messages: [
        { role: 'system', content: `${PLANNER_RULES}\n本技能的设计要点：${skill.expertise}` },
        { role: 'user', content: plannerRequest(skill, values, hasReference) },
      ],
    }),
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (!response.ok) throw new Error(`Planner request failed with status ${response.status}`);
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('Planner response has no text content');
  return parseJsonObject(content);
}

/** Without a config every prompt comes from the skill's template. */
export function createSkillPlanner(config?: SkillPlannerConfig): SkillPlanner {
  return {
    async plan(skill, values, hasReference) {
      let planned: Record<string, unknown> = {};
      if (config !== undefined) {
        try {
          planned = await askPlanner(config, skill, values, hasReference);
        } catch (err) {
          logger.warn({ err, skillId: skill.id }, 'skill planner fell back to templates');
        }
      }
      return {
        title: `${skill.label} · ${skill.subject(values)}`,
        outputs: skill.outputs.map((output) => ({
          id: output.id,
          label: output.label,
          aspect: outputAspect(output, values),
          prompt:
            acceptPlannedPrompt(planned[output.id], output.texts?.(values) ?? []) ??
            fallbackPrompt(skill, output, values, hasReference),
        })),
      };
    },
  };
}

/** Planning reuses the chat model configured for image analysis and prompt polishing. */
export function createSkillPlannerFromEnv(): SkillPlanner {
  if (env.VISION_API_KEY === undefined || env.VISION_MODEL === undefined) {
    return createSkillPlanner();
  }
  return createSkillPlanner({
    baseUrl: env.VISION_API_BASE_URL,
    apiKey: env.VISION_API_KEY,
    model: env.VISION_MODEL,
    timeoutMs: env.VISION_API_TIMEOUT_MS,
  });
}
