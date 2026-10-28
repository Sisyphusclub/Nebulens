import { asc, eq, inArray, isNull, or } from 'drizzle-orm';

import { env } from '../config/env.js';
import { db } from '../db/drizzle.js';
import { imageRecords } from '../db/schema.js';
import { logger } from '../logger.js';
import { readOutput } from '../storage/localStorage.js';
import type { TextCheckResult } from '../types/imageAnalysis.js';
import {
  IMAGE_CATEGORIES,
  IMAGE_CATEGORY_LABELS,
  isImageCategory,
  type ImageCategory,
} from '../types/imageCategory.js';
import { extractVisibleTexts, scoreVisibleText } from '../utils/visibleText.js';

export interface VisionAnalysisRequest {
  image: Buffer;
  mime: string;
  /** Quoted prompt text the image should contain; empty skips the text check. */
  expectedTexts: readonly string[];
}

/** Returns the model's raw answer, which `parseImageAnalysis` turns into fields. */
export interface VisionClient {
  analyze(request: VisionAnalysisRequest): Promise<string>;
}

export interface VisionClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  fetchImpl?: typeof globalThis.fetch;
}

const CATEGORY_GUIDE = IMAGE_CATEGORIES.map(
  (category) => `${category}（${IMAGE_CATEGORY_LABELS[category]}）`,
).join('、');

function buildInstructions(expectedTexts: readonly string[]): string {
  const lines = [
    '你是图片资产管理助手。请观察图片，只输出一个 JSON 对象，不要输出其他内容。',
    `字段 category：从以下用途中选一个最合适的英文值：${CATEGORY_GUIDE}。`,
    '字段 description：一句不超过 40 字的中文描述，说明画面内容与用途。',
    '字段 tags：3 到 8 个简短中文标签，覆盖主体、风格、配色和用途。',
  ];
  if (expectedTexts.length > 0) {
    lines.push(
      '字段 texts：逐条核对下列应出现在图中的文字，每条输出 {"expected": 原文, "found": 图中实际写的文字}。',
      '竖排、书法、手写和艺术字也要认真辨认；图中写成繁体、形近字或缺字时，found 照实写出；完全找不到时 found 为 null。',
      ...expectedTexts.map((text, index) => `${index + 1}. ${text}`),
    );
  }
  return lines.join('\n');
}

export function createVisionClient(config: VisionClientConfig): VisionClient {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const url = `${config.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;
  return {
    async analyze(request) {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: buildInstructions(request.expectedTexts) },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${request.mime};base64,${request.image.toString('base64')}`,
                  },
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`Vision request failed with status ${response.status}`);
      }
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('Vision response has no text content');
      return content;
    },
  };
}

export interface ImageAnalysis {
  category?: ImageCategory;
  description?: string;
  tags?: string[];
  textCheck?: TextCheckResult;
}

function extractJsonObject(raw: string): Record<string, unknown> {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('Vision answer contains no JSON object');
  const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Vision answer is not a JSON object');
  }
  return parsed as Record<string, unknown>;
}

/** Validates the model's answer; every expected segment gets a verdict, found or not. */
export function parseImageAnalysis(raw: string, expectedTexts: readonly string[]): ImageAnalysis {
  const answer = extractJsonObject(raw);
  const analysis: ImageAnalysis = {};
  if (isImageCategory(answer['category'])) analysis.category = answer['category'];
  if (typeof answer['description'] === 'string' && answer['description'].trim() !== '') {
    analysis.description = answer['description'].trim().slice(0, 120);
  }
  if (Array.isArray(answer['tags'])) {
    analysis.tags = answer['tags']
      .filter((tag): tag is string => typeof tag === 'string' && tag.trim() !== '')
      .map((tag) => tag.trim().slice(0, 20))
      .slice(0, 8);
  }
  if (expectedTexts.length > 0) {
    const reported = Array.isArray(answer['texts']) ? answer['texts'] : [];
    const foundByText = new Map<string, string | null>();
    for (const item of reported) {
      if (typeof item !== 'object' || item === null) continue;
      const { expected, found } = item as Record<string, unknown>;
      if (typeof expected === 'string') {
        foundByText.set(expected, typeof found === 'string' ? found : null);
      }
    }
    const segments = expectedTexts.map((text) => {
      const found = foundByText.get(text) ?? null;
      const ok = found !== null && scoreVisibleText([text], found).segments[0]?.exact === true;
      return { text, found, ok };
    });
    analysis.textCheck = {
      status: segments.every((segment) => segment.ok) ? 'passed' : 'issues',
      segments,
    };
  }
  return analysis;
}

/** Analyzes one stored image and records the outcome; failures mark the record, never throw. */
export async function analyzeImageRecord(id: string, client: VisionClient): Promise<void> {
  const row = db.select().from(imageRecords).where(eq(imageRecords.id, id)).get();
  if (row === undefined) return;
  const expectedTexts = extractVisibleTexts(row.prompt);
  try {
    const raw = await client.analyze({
      image: await readOutput(row.filename),
      mime: row.mime,
      expectedTexts,
    });
    const analysis = parseImageAnalysis(raw, expectedTexts);
    const inferCategory = row.categorySource !== 'user' && analysis.category !== undefined;
    db.update(imageRecords)
      .set({
        analysisStatus: 'done',
        description: analysis.description ?? null,
        tags: analysis.tags === undefined ? null : JSON.stringify(analysis.tags),
        textCheck: analysis.textCheck === undefined ? null : JSON.stringify(analysis.textCheck),
        ...(inferCategory ? { category: analysis.category, categorySource: 'ai' } : {}),
      })
      .where(eq(imageRecords.id, id))
      .run();
  } catch (err) {
    logger.warn({ id, err }, 'image analysis: failed');
    db.update(imageRecords).set({ analysisStatus: 'failed' }).where(eq(imageRecords.id, id)).run();
  }
}

export interface AnalysisQueue {
  enqueue(ids: readonly string[]): void;
  /** Resolves once every queued record has been analyzed. */
  idle(): Promise<void>;
}

/** In-process queue; records left pending by a restart are picked up by the backfill script. */
export function createAnalysisQueue(client: VisionClient, concurrency = 2): AnalysisQueue {
  const waiting: string[] = [];
  let running = 0;
  let idleWaiters: Array<() => void> = [];

  const pump = (): void => {
    while (running < concurrency && waiting.length > 0) {
      const id = waiting.shift();
      if (id === undefined) break;
      running += 1;
      void analyzeImageRecord(id, client).finally(() => {
        running -= 1;
        pump();
      });
    }
    if (running === 0 && waiting.length === 0) {
      const waiters = idleWaiters;
      idleWaiters = [];
      waiters.forEach((resolve) => resolve());
    }
  };

  return {
    enqueue(ids) {
      waiting.push(...ids);
      pump();
    },
    idle() {
      if (running === 0 && waiting.length === 0) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.push(resolve));
    },
  };
}

/** The configured analysis queue, or undefined when no vision model is set up. */
export function createAnalysisQueueFromEnv(): AnalysisQueue | undefined {
  if (env.VISION_API_KEY === undefined || env.VISION_MODEL === undefined) return undefined;
  return createAnalysisQueue(
    createVisionClient({
      baseUrl: env.VISION_API_BASE_URL,
      apiKey: env.VISION_API_KEY,
      model: env.VISION_MODEL,
      timeoutMs: env.VISION_API_TIMEOUT_MS,
    }),
  );
}

/** Oldest first: records never analyzed, left pending by a restart, and optionally failed ones. */
export function listRecordsNeedingAnalysis(input: {
  includeFailed: boolean;
  limit: number;
}): string[] {
  const statuses = input.includeFailed ? ['pending', 'failed'] : ['pending'];
  return db
    .select({ id: imageRecords.id })
    .from(imageRecords)
    .where(or(isNull(imageRecords.analysisStatus), inArray(imageRecords.analysisStatus, statuses)))
    .orderBy(asc(imageRecords.createdAt))
    .limit(input.limit)
    .all()
    .map((row) => row.id);
}
