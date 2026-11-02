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

/** Raw answers to a skill's text and list fields, before `readSkillValues` checks them. */
export type SkillAnswers = Record<string, string | string[]>;

/** Turns a skill's form answers into one ready-to-generate prompt per output image. */
export interface SkillPlanner {
  plan(skill: SkillDefinition, values: SkillValues, hasReference: boolean): Promise<SkillPlan>;
  /** Reads the one line typed in the composer into answers; choice fields stay the client's. */
  readBrief(skill: SkillDefinition, brief: string): Promise<SkillAnswers>;
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

/** Keeps only the text and list fields, cut to their limits, so a brief never fails on length. */
function fitAnswers(skill: SkillDefinition, raw: Record<string, unknown>): SkillAnswers {
  const answers: SkillAnswers = {};
  for (const field of skill.fields) {
    const value = raw[field.id];
    if (field.kind === 'text' && typeof value === 'string') {
      const text = clean(value).slice(0, field.maxLength);
      if (text.length > 0) answers[field.id] = text;
    } else if (field.kind === 'list') {
      const items = (Array.isArray(value) ? value : [value])
        .filter((item): item is string => typeof item === 'string')
        .map((item) => clean(item).slice(0, field.maxLength))
        .filter((item) => item.length > 0)
        .slice(0, field.maxItems);
      if (items.length > 0) answers[field.id] = items;
    }
  }
  return answers;
}

function isAnswered(answer: string | string[] | undefined): boolean {
  return answer !== undefined && answer.length > 0;
}

/**
 * Reads a brief without a chat model: the phrases between commas or 、 fill the required text
 * fields in order, and a list takes the phrases after them. A skill with no required text,
 * like restyling, gets the whole brief in its first text field.
 */
export function briefAnswers(skill: SkillDefinition, brief: string): SkillAnswers {
  const phrases = brief
    .split(/[，,、；;。\n]+/)
    .map(clean)
    .filter((phrase) => phrase.length > 0);
  const raw: Record<string, unknown> = {};
  if (!skill.fields.some((field) => field.kind === 'text' && field.required)) {
    const first = skill.fields.find((field) => field.kind === 'text');
    if (first !== undefined && phrases.length > 0) raw[first.id] = phrases.join('，');
    return fitAnswers(skill, raw);
  }
  for (const field of skill.fields) {
    if (phrases.length === 0) break;
    if (field.kind === 'text' && field.required) raw[field.id] = phrases.shift();
    else if (field.kind === 'list') raw[field.id] = phrases.splice(0, field.maxItems);
  }
  return fitAnswers(skill, raw);
}

/** The first required text or list field the brief left empty, if any. */
export function missingBriefField(
  skill: SkillDefinition,
  answers: SkillAnswers,
): SkillField | undefined {
  return skill.fields.find(
    (field) => field.required && field.kind !== 'choice' && !isAnswered(answers[field.id]),
  );
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
  '3. 表单里没填的信息（比如没写时间或品牌）不要写进画面，也不要为它预留文字位置。',
  '4. 用户上传了参考图时，写明保留参考图中主体的外观、颜色、形状和文字不变。',
  '5. 只输出一个 JSON 对象，键是图片 id，值是这张图的提示词，不要解释，不要 Markdown。',
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

const BRIEF_RULES = [
  '你把用户的一句话需求拆成表单字段。',
  '1. 只提取用户明确写出的信息，原话照抄，不改字、不补充、不翻译；没提到的字段不要输出。',
  '2. 列表字段输出字符串数组，每条一个要点。',
  '3. 只输出一个 JSON 对象，键是字段 id，不要解释，不要 Markdown。',
].join('\n');

function briefRequest(skill: SkillDefinition, brief: string): string {
  const fields = skill.fields.flatMap((field) => {
    if (field.kind === 'choice') return [];
    const shape =
      field.kind === 'list'
        ? `列表，最多 ${field.maxItems} 条，每条不超过 ${field.maxLength} 字`
        : `文字，不超过 ${field.maxLength} 字`;
    return [`- ${field.id}（${field.label}，${shape}${field.required ? '，必填' : ''}）`];
  });
  return [`技能：${skill.label}`, '字段：', ...fields, `用户描述：${brief}`].join('\n');
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

/** Asks the chat model for a JSON object answering `user` under the `system` rules. */
async function askChat(
  config: SkillPlannerConfig,
  temperature: number,
  system: string,
  user: string,
): Promise<Record<string, unknown>> {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const response = await fetchImpl(`${config.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers: chatApiHeaders(config.apiKey, 'nebulens-skill-plan'),
    body: JSON.stringify({
      model: config.model,
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
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
          planned = await askChat(
            config,
            0.7,
            `${PLANNER_RULES}\n本技能的设计要点：${skill.expertise}`,
            plannerRequest(skill, values, hasReference),
          );
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
    async readBrief(skill, brief) {
      const guessed = briefAnswers(skill, brief);
      if (config === undefined) return guessed;
      try {
        const answers = fitAnswers(
          skill,
          await askChat(config, 0, BRIEF_RULES, briefRequest(skill, brief)),
        );
        // A required field the model skipped still gets the plain reading, so a brief
        // that names the subject is never turned away.
        for (const field of skill.fields) {
          const guess = guessed[field.id];
          if (field.required && !isAnswered(answers[field.id]) && guess !== undefined) {
            answers[field.id] = guess;
          }
        }
        return answers;
      } catch (err) {
        logger.warn({ err, skillId: skill.id }, 'skill brief fell back to plain reading');
        return guessed;
      }
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
