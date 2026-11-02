import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../../src/errors/AppError.js';
import {
  createPromptEnhancer,
  finalizeEnhancedPrompt,
} from '../../src/services/promptEnhance.service.js';

function chatResponse(content: string, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('finalizeEnhancedPrompt', () => {
  it('strips code fences and a leading label from the model answer', () => {
    const raw = '```\n润色后的提示词：清晨薄雾中的玻璃山居，被松林环绕\n```';
    expect(finalizeEnhancedPrompt('玻璃山居', raw)).toBe('清晨薄雾中的玻璃山居，被松林环绕');
  });

  it('keeps an answer that preserves every quoted text exactly', () => {
    const original = '奶茶海报，标题“夏日限定”';
    const raw = '清新绿色调的奶茶新品海报，顶部大标题“夏日限定”，冰块与水珠点缀，柔和自然光';
    expect(finalizeEnhancedPrompt(original, raw)).toBe(raw);
  });

  it('rejects an answer that changes or drops quoted text', () => {
    const original = '奶茶海报，标题“夏日限定”';
    expect(() => finalizeEnhancedPrompt(original, '奶茶海报，标题“夏季限定”')).toThrow(AppError);
    expect(() => finalizeEnhancedPrompt(original, '一张奶茶海报')).toThrow(/引号/);
  });

  it('rejects an empty or over-long answer', () => {
    expect(() => finalizeEnhancedPrompt('猫', '   ')).toThrow(AppError);
    expect(() => finalizeEnhancedPrompt('猫', '猫'.repeat(2001))).toThrow(AppError);
  });
});

describe('createPromptEnhancer', () => {
  it('asks the chat model to rewrite the prompt and returns the cleaned answer', async () => {
    const fetchImpl = vi.fn(async () => chatResponse('提示词：雨后霓虹街道，电影级广角构图'));
    const enhancer = createPromptEnhancer({
      baseUrl: 'https://llm.test/',
      apiKey: 'test-key',
      model: 'test-model',
      timeoutMs: 1000,
      fetchImpl,
    });

    await expect(enhancer.enhance('雨后街道')).resolves.toBe('雨后霓虹街道，电影级广角构图');

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://llm.test/v1/chat/completions');
    expect(init.headers).toMatchObject({
      authorization: 'Bearer test-key',
      'user-agent': 'nebulens/1.0',
      'x-opencode-session': 'nebulens-prompt-enhance',
    });
    const body = JSON.parse(String(init.body)) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe('test-model');
    expect(body.messages[0]?.role).toBe('system');
    expect(body.messages[0]?.content).toContain('引号');
    expect(body.messages[1]).toEqual({ role: 'user', content: '雨后街道' });
  });

  it('reports upstream failures as a provider error', async () => {
    const enhancer = createPromptEnhancer({
      baseUrl: 'https://llm.test',
      apiKey: 'test-key',
      model: 'test-model',
      timeoutMs: 1000,
      fetchImpl: vi.fn(async () => chatResponse('', 500)),
    });

    await expect(enhancer.enhance('猫')).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      status: 502,
    });
  });
});
