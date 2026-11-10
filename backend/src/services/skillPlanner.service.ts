import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logger.js';
import {
  findSkill,
  SKILLS,
  type SkillDefinition,
  type SkillField,
  type SkillOutput,
  type SkillValues,
} from '../skills/skillDefinitions.js';
import { ASPECT_RATIOS, type AspectRatio } from '../types/image.js';
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
  /**
   * Picks the skill that fits a one-line request typed in Agent mode, or null when none
   * does and the request goes to `planFreely`.
   */
  selectSkill(brief: string, hasReference: boolean): Promise<string | null>;
  /**
   * Agent mode when no skill fits: the text model breaks the request into one to four images
   * and writes each one's prompt. Throws when there is no text model or it fails.
   */
  planFreely(brief: string, hasReference: boolean): Promise<SkillPlan>;
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

const SELECT_RULES = [
  '你是图像创作工作台的调度员：用户只说了一句需求，你从给出的技能里挑最合适的一个。',
  '1. 技能会一次生成一组配套图片；需求明确是某个技能的用途、并写出了它的必填信息时才选它。',
  '2. 只描述一个画面、或哪个技能都对不上时，不选技能。',
  '3. 标着「需要参考图」的技能，只有用户已上传参考图时才能选。',
  '4. 只输出一个 JSON 对象：{"skillId": "技能 id"}，不选时输出 {"skillId": null}，不要解释。',
].join('\n');

const FREE_PLAN_RULES = [
  '你是图像创作工作台的创作规划师：把用户的一句话需求拆成 1 到 4 张图，并为每张写好能直接生成的提示词。',
  '1. 用户说了几张就出几张，最多 4 张；只要一个画面时出 1 张；要一组或一套但没说数量时出 3 张。',
  '2. 每张的 prompt 用中文写完整画面：主体、场景、构图、光线、色彩和风格，80 到 200 字。',
  '3. 画面里要出现的文字只用用户的原话，放在中文双引号里；用户没给文字时，画面里不要出现文字。',
  '4. 已上传参考图时，每张都写明参考上传的图片，保持图里的主体不变。',
  `5. aspect 从这些比例里选：${ASPECT_RATIOS.join('、')}，按用途选，如竖版海报 3:4、横幅 16:9、方图 1:1。`,
  '6. label 是这张图的简短名称，不超过 8 个字；title 是这组图的标题，不超过 16 个字。',
  '7. 只输出一个 JSON 对象：{"title": "…", "images": [{"label": "…", "aspect": "3:4", "prompt": "…"}]}，不要解释。',
].join('\n');

const FREE_PLAN_MAX_IMAGES = 4;
const TEXT_MODEL_UNAVAILABLE =
  'Agent 需要文本模型来规划画面，当前没有配置。可以先用图片生成，或从技能库选一个技能。';
const FREE_PLAN_FAILED = 'Agent 这次没能规划好画面，请稍后重试。';

function freePlanRequest(brief: string, hasReference: boolean): string {
  return [`已上传参考图：${hasReference ? '是' : '否'}`, `用户需求：${brief}`].join('\n');
}

function isAspectRatio(value: unknown): value is AspectRatio {
  return typeof value === 'string' && (ASPECT_RATIOS as readonly string[]).includes(value);
}

/** The usable images in the model's answer, in order; null when none is usable. */
function readFreePlan(answer: Record<string, unknown>, brief: string): SkillPlan | null {
  const images = Array.isArray(answer.images) ? answer.images : [];
  const outputs: PlannedOutput[] = [];
  for (const image of images) {
    if (outputs.length === FREE_PLAN_MAX_IMAGES) break;
    if (typeof image !== 'object' || image === null) continue;
    const { label, aspect, prompt } = image as Record<string, unknown>;
    const text = typeof prompt === 'string' ? prompt.trim() : '';
    if (text.length < 10 || text.length > 2000) continue;
    const number = outputs.length + 1;
    const name = typeof label === 'string' ? label.trim().slice(0, 12) : '';
    outputs.push({
      id: `image-${number}`,
      label: name || `第 ${number} 张`,
      aspect: isAspectRatio(aspect) ? aspect : 'auto',
      prompt: text,
    });
  }
  if (outputs.length === 0) return null;
  const title = typeof answer.title === 'string' ? answer.title.trim().slice(0, 20) : '';
  return { title: title || brief.trim().slice(0, 20), outputs };
}

/** A skill that needs an uploaded image is only usable once there is one. */
function usableSkill(skill: SkillDefinition, hasReference: boolean): boolean {
  return skill.reference !== 'required' || hasReference;
}

/** The skill a request names outright, such as "做一套电商主图"; no chat model needed. */
export function skillNamedIn(brief: string, hasReference: boolean): string | null {
  const skill = SKILLS.find((candidate) => brief.includes(candidate.label));
  return skill !== undefined && usableSkill(skill, hasReference) ? skill.id : null;
}

function selectRequest(brief: string, hasReference: boolean): string {
  const skills = SKILLS.map((skill) => {
    const required = skill.fields
      .filter((field) => field.required && field.kind !== 'choice')
      .map((field) => field.label);
    const notes = [
      skill.description,
      ...(required.length > 0 ? [`必填：${required.join('、')}`] : []),
      ...(skill.reference === 'required' ? ['需要参考图'] : []),
    ];
    return `- ${skill.id}（${skill.label}）：${notes.join('；')}`;
  });
  return [
    '技能：',
    ...skills,
    `已上传参考图：${hasReference ? '是' : '否'}`,
    `用户需求：${brief}`,
  ].join('\n');
}

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
    async selectSkill(brief, hasReference) {
      // A request that names a skill needs no model, and without one nothing else is guessed.
      const named = skillNamedIn(brief, hasReference);
      if (named !== null || config === undefined) return named;
      try {
        const answer = await askChat(config, 0, SELECT_RULES, selectRequest(brief, hasReference));
        const skill = typeof answer.skillId === 'string' ? findSkill(answer.skillId) : undefined;
        return skill !== undefined && usableSkill(skill, hasReference) ? skill.id : null;
      } catch (err) {
        logger.warn({ err }, 'skill selection failed; the request is planned freely');
        return null;
      }
    },
    async planFreely(brief, hasReference) {
      if (config === undefined) {
        throw new AppError('TEXT_MODEL_UNAVAILABLE', TEXT_MODEL_UNAVAILABLE, 503);
      }
      let answer: Record<string, unknown>;
      try {
        answer = await askChat(config, 0.7, FREE_PLAN_RULES, freePlanRequest(brief, hasReference));
      } catch (err) {
        logger.warn({ err }, 'free plan request failed');
        throw new AppError('PROVIDER_ERROR', FREE_PLAN_FAILED, 502, err);
      }
      const plan = readFreePlan(answer, brief);
      if (plan === null) throw new AppError('PROVIDER_ERROR', FREE_PLAN_FAILED, 502);
      return plan;
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
