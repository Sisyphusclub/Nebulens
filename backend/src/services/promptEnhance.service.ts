import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { extractVisibleTexts } from '../utils/visibleText.js';

/** Rewrites a short description into a fuller image prompt. */
export interface PromptEnhancer {
  enhance(prompt: string): Promise<string>;
}

export interface PromptEnhancerConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  fetchImpl?: typeof globalThis.fetch;
}

/** Same ceiling as the generate endpoint, so a polished prompt can always be submitted. */
const MAX_PROMPT_LENGTH = 2000;

const INSTRUCTIONS = [
  '你是 AI 绘图提示词润色助手。把用户的简短描述改写成一段适合图像生成模型的中文提示词。',
  '1. 保留用户的原意和全部关键信息，不要改变主体、用途和画面比例要求。',
  '2. 补充主体细节、场景环境、构图与视角、光线、色调和风格质感，整体控制在 80 到 200 字。',
  '3. 用户用引号（“”「」『』或英文双引号）写出的内容是要出现在画面中的文字，必须放在同样的引号里原样保留，一个字都不能改；不要新增其他要出现在画面中的文字。',
  '4. 只输出润色后的提示词本身，不要标题、解释、序号或 Markdown。',
].join('\n');

/**
 * Cleans the model's answer and checks it is safe to use: every quoted text the
 * user asked to appear in the image must survive unchanged, since the text
 * check compares the image against exactly those quotes.
 */
export function finalizeEnhancedPrompt(original: string, raw: string): string {
  const prompt = raw
    .trim()
    .replace(/^```[^\n]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim()
    .replace(/^(?:润色后的)?提示词[:：]\s*/, '')
    .trim();

  if (prompt.length === 0) {
    throw new AppError('PROVIDER_EMPTY_RESULT', '润色没有返回内容，请稍后重试。', 502);
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new AppError('PROVIDER_ERROR', '润色结果过长，已保留原提示词。', 502);
  }
  const lost = extractVisibleTexts(original).filter((text) => !prompt.includes(text));
  if (lost.length > 0) {
    throw new AppError('PROVIDER_ERROR', '润色结果改动了引号中的文字，已保留原提示词。', 502);
  }
  return prompt;
}

export function createPromptEnhancer(config: PromptEnhancerConfig): PromptEnhancer {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const url = `${config.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;
  return {
    async enhance(prompt) {
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: config.model,
            temperature: 0.7,
            messages: [
              { role: 'system', content: INSTRUCTIONS },
              { role: 'user', content: prompt },
            ],
          }),
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'TimeoutError') {
          throw new AppError('PROVIDER_TIMEOUT', '润色超时，请稍后重试。', 504, err);
        }
        throw new AppError('PROVIDER_ERROR', '提示词润色失败，请稍后重试。', 502, err);
      }
      if (!response.ok) {
        throw new AppError('PROVIDER_ERROR', '提示词润色失败，请稍后重试。', 502, undefined, {
          upstreamStatus: response.status,
        });
      }
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      return finalizeEnhancedPrompt(prompt, typeof content === 'string' ? content : '');
    },
  };
}

/** Polishing reuses the chat model configured for image analysis. */
export function createPromptEnhancerFromEnv(): PromptEnhancer | undefined {
  if (env.VISION_API_KEY === undefined || env.VISION_MODEL === undefined) return undefined;
  return createPromptEnhancer({
    baseUrl: env.VISION_API_BASE_URL,
    apiKey: env.VISION_API_KEY,
    model: env.VISION_MODEL,
    timeoutMs: env.VISION_API_TIMEOUT_MS,
  });
}
