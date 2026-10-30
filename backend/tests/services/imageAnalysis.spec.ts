import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { db } from '../../src/db/drizzle.js';
import { imageRecords, user } from '../../src/db/schema.js';
import { insertImageRecords } from '../../src/services/history.service.js';
import {
  analyzeImageRecord,
  createAnalysisQueue,
  createVisionClient,
  listRecordsNeedingAnalysis,
  parseImageAnalysis,
  type VisionClient,
} from '../../src/services/imageAnalysis.service.js';
import { saveOutput } from '../../src/storage/localStorage.js';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16),
]);

describe('parseImageAnalysis', () => {
  it('reads a fenced JSON answer and checks every expected segment', () => {
    const raw = [
      '```json',
      JSON.stringify({
        category: 'poster',
        description: '奶茶新品海报',
        tags: ['奶茶', '新品', '  ', 42],
        texts: [
          { expected: '新品上市', found: '新品上市' },
          { expected: '中杯16元', found: '中杯15元' },
        ],
      }),
      '```',
    ].join('\n');

    expect(parseImageAnalysis(raw, ['新品上市', '中杯16元', '大杯19元'])).toEqual({
      category: 'poster',
      description: '奶茶新品海报',
      tags: ['奶茶', '新品'],
      textCheck: {
        status: 'issues',
        segments: [
          { text: '新品上市', found: '新品上市', ok: true, clear: true },
          { text: '中杯16元', found: '中杯15元', ok: false, clear: true },
          { text: '大杯19元', found: null, ok: false, clear: false },
        ],
      },
    });
  });

  it('ignores an unknown category and skips the text check without expected text', () => {
    const parsed = parseImageAnalysis(
      JSON.stringify({ category: 'banner', description: '城市夜景', tags: ['夜景'] }),
      [],
    );
    expect(parsed).toEqual({ description: '城市夜景', tags: ['夜景'] });
  });

  it('treats spacing and punctuation differences as a pass', () => {
    const parsed = parseImageAnalysis(
      JSON.stringify({ texts: [{ expected: '一口清醒，半城入夏', found: '一口清醒 半城入夏' }] }),
      ['一口清醒，半城入夏'],
    );
    expect(parsed.textCheck?.status).toBe('passed');
  });

  it('throws when the answer is not JSON', () => {
    expect(() => parseImageAnalysis('抱歉，我无法查看图片', [])).toThrow();
  });
});

describe('createVisionClient', () => {
  it('sends the image and instructions to an OpenAI-compatible chat endpoint', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ choices: [{ message: { content: '{"tags":["海报"]}' } }] }),
    );
    const client = createVisionClient({
      baseUrl: 'https://vision.example.com/',
      apiKey: 'sk-vision',
      model: 'vision-mini',
      timeoutMs: 1000,
      fetchImpl,
    });

    const answer = await client.analyze({
      image: PNG,
      mime: 'image/png',
      expectedTexts: ['新品上市'],
    });

    expect(answer).toBe('{"tags":["海报"]}');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://vision.example.com/v1/chat/completions');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer sk-vision');
    expect(new Headers(init.headers).get('user-agent')).toBe('nebulens/1.0');
    expect(new Headers(init.headers).get('x-opencode-session')).toBe('nebulens-image-analysis');
    const body = JSON.parse(String(init.body)) as {
      model: string;
      messages: Array<{ content: unknown }>;
    };
    expect(body.model).toBe('vision-mini');
    const serialized = JSON.stringify(body.messages);
    expect(serialized).toContain(`data:image/png;base64,${PNG.toString('base64')}`);
    expect(serialized).toContain('新品上市');
  });

  it('fails with the upstream status when the request is rejected', async () => {
    const client = createVisionClient({
      baseUrl: 'https://vision.example.com',
      apiKey: 'sk-vision',
      model: 'vision-mini',
      timeoutMs: 1000,
      fetchImpl: vi.fn(async () => new Response('nope', { status: 401 })),
    });
    await expect(
      client.analyze({ image: PNG, mime: 'image/png', expectedTexts: [] }),
    ).rejects.toThrow(/401/);
  });
});

async function seedRecord(input: { prompt: string; category?: 'logo' }): Promise<string> {
  const userId = `analysis-${randomUUID()}`;
  const now = new Date();
  db.insert(user)
    .values({
      id: userId,
      name: userId,
      email: `${userId}@test.local`,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const saved = await saveOutput(PNG, 'png');
  insertImageRecords([
    {
      id: saved.filename,
      batchId: randomUUID(),
      userId,
      prompt: input.prompt,
      model: 'gpt-image-2',
      filename: saved.filename,
      mime: 'image/png',
      width: 1024,
      height: 1024,
      count: 1,
      resolution: 'standard',
      isPublic: false,
      isShared: true,
      ...(input.category === undefined ? {} : { category: input.category }),
      analysisStatus: 'pending',
      createdAt: now,
    },
  ]);
  return saved.filename;
}

function readRecord(id: string) {
  return db.select().from(imageRecords).where(eq(imageRecords.id, id)).get();
}

function fakeClient(answer: string | Error): VisionClient & { analyze: ReturnType<typeof vi.fn> } {
  return {
    analyze: vi.fn(async () => {
      if (answer instanceof Error) throw answer;
      return answer;
    }),
  };
}

describe('analyzeImageRecord', () => {
  it('stores the description, tags, inferred category and text check', async () => {
    const id = await seedRecord({ prompt: '奶茶海报，标题“新品上市”' });
    const client = fakeClient(
      JSON.stringify({
        category: 'poster',
        description: '奶茶海报',
        tags: ['奶茶'],
        texts: [{ expected: '新品上市', found: '新品上市' }],
      }),
    );

    await analyzeImageRecord(id, client);

    expect(client.analyze).toHaveBeenCalledWith(
      expect.objectContaining({ mime: 'image/png', expectedTexts: ['新品上市'] }),
    );
    const row = readRecord(id);
    expect(row).toMatchObject({
      analysisStatus: 'done',
      category: 'poster',
      categorySource: 'ai',
      description: '奶茶海报',
    });
    expect(JSON.parse(row?.tags ?? 'null')).toEqual(['奶茶']);
    expect(JSON.parse(row?.textCheck ?? 'null')).toMatchObject({ status: 'passed' });
  });

  it('keeps a category the owner chose', async () => {
    const id = await seedRecord({ prompt: '品牌标志', category: 'logo' });
    await analyzeImageRecord(id, fakeClient(JSON.stringify({ category: 'poster', tags: [] })));
    expect(readRecord(id)).toMatchObject({ category: 'logo', categorySource: 'user' });
  });

  it('marks the record failed when the vision call fails', async () => {
    const id = await seedRecord({ prompt: '城市夜景' });
    await analyzeImageRecord(id, fakeClient(new Error('upstream 500')));
    expect(readRecord(id)?.analysisStatus).toBe('failed');
  });
});

describe('createAnalysisQueue', () => {
  it('analyzes queued records with bounded concurrency', async () => {
    const ids = await Promise.all([1, 2, 3].map(() => seedRecord({ prompt: '队列' })));
    let active = 0;
    let peak = 0;
    const client: VisionClient = {
      analyze: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return JSON.stringify({ tags: ['队列'] });
      },
    };
    const queue = createAnalysisQueue(client, 2);

    queue.enqueue(ids);
    await queue.idle();

    expect(peak).toBe(2);
    expect(ids.map((id) => readRecord(id)?.analysisStatus)).toEqual(['done', 'done', 'done']);
  });
});

describe('listRecordsNeedingAnalysis', () => {
  it('returns pending records and failed ones only when asked', async () => {
    const pendingId = await seedRecord({ prompt: '待补分析' });
    const failedId = await seedRecord({ prompt: '分析失败' });
    db.update(imageRecords)
      .set({ analysisStatus: 'failed' })
      .where(eq(imageRecords.id, failedId))
      .run();

    const withoutFailed = listRecordsNeedingAnalysis({ includeFailed: false, limit: 10_000 });
    const withFailed = listRecordsNeedingAnalysis({ includeFailed: true, limit: 10_000 });

    expect(withoutFailed).toContain(pendingId);
    expect(withoutFailed).not.toContain(failedId);
    expect(withFailed).toEqual(expect.arrayContaining([pendingId, failedId]));
  });
});

describe('parseImageAnalysis legibility', () => {
  it('flags correctly spelled text that the model saw as deformed or cramped', () => {
    const parsed = parseImageAnalysis(
      JSON.stringify({
        texts: [
          { expected: '周年庆典', found: '周年庆典', clear: true },
          { expected: '11月1日至11月7日', found: '11月1日至11月7日', clear: false },
        ],
      }),
      ['周年庆典', '11月1日至11月7日'],
    );

    expect(parsed.textCheck).toEqual({
      status: 'issues',
      segments: [
        { text: '周年庆典', found: '周年庆典', ok: true, clear: true },
        { text: '11月1日至11月7日', found: '11月1日至11月7日', ok: true, clear: false },
      ],
    });
  });

  it('treats a missing legibility verdict as clear', () => {
    const parsed = parseImageAnalysis(
      JSON.stringify({ texts: [{ expected: '新品', found: '新品' }] }),
      ['新品'],
    );
    expect(parsed.textCheck).toEqual({
      status: 'passed',
      segments: [{ text: '新品', found: '新品', ok: true, clear: true }],
    });
  });
});
