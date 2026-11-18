import { afterEach, describe, expect, it, vi } from 'vitest';

import { planFreely } from '@/services/api/skillsApi';

const OUTPUTS = [{ id: 'image-1', label: '主视觉', aspect: '3:4', prompt: '雨夜的未来城市' }];

function answer(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a planned run from the server', () => {
  it('keeps what the Agent understood when it is a list of words', async () => {
    answer({
      title: '雨夜城市',
      points: ['主题：雨夜的未来城市', 3, '数量：两张'],
      outputs: OUTPUTS,
    });

    await expect(planFreely('雨夜的未来城市，做两张', false)).resolves.toEqual({
      title: '雨夜城市',
      points: ['主题：雨夜的未来城市', '数量：两张'],
      outputs: OUTPUTS,
    });
  });

  it('leaves it out when there is nothing usable', async () => {
    answer({ title: '雨夜城市', points: 'fast', outputs: OUTPUTS });

    await expect(planFreely('雨夜的未来城市', false)).resolves.toEqual({
      title: '雨夜城市',
      outputs: OUTPUTS,
    });
  });
});
