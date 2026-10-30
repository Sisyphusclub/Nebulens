import { describe, expect, it, vi } from 'vitest';

import {
  createSkillPlanner,
  fallbackPrompt,
  publicSkill,
  readSkillValues,
} from '../../src/services/skillPlanner.service.js';
import { findSkill, SKILLS } from '../../src/skills/skillDefinitions.js';

const ecommerce = findSkill('ecommerce')!;

function chatResponse(content: string, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('readSkillValues', () => {
  it('trims answers, strips quotes, drops blank list items and defaults choices', () => {
    const values = readSkillValues(
      ecommerce,
      { product: '  “山川”明前绿茶 ', points: ['高山云雾', '  ', '明前采摘'], unknown: 'x' },
      false,
    );

    expect(values.text('product')).toBe('山川明前绿茶');
    expect(values.list('points')).toEqual(['高山云雾', '明前采摘']);
    expect(values.text('style')).toBe('简约白底');
    expect(values.text('price')).toBe('');
  });

  it('rejects missing required answers, long lists, unknown choices and a missing reference', () => {
    expect(() => readSkillValues(ecommerce, {}, false)).toThrow('请填写商品名称。');
    expect(() =>
      readSkillValues(ecommerce, { product: '绿茶', points: ['一', '二', '三', '四'] }, false),
    ).toThrow('卖点最多填 3 条。');
    expect(() => readSkillValues(ecommerce, { product: '绿茶', style: '赛博' }, false)).toThrow(
      '风格只能从给出的选项中选择。',
    );
    expect(() => readSkillValues(findSkill('background')!, { scene: '海边' }, false)).toThrow(
      '请先上传商品图。',
    );
  });
});

describe('publicSkill', () => {
  it('exposes the form and output names but not the planner guidance', () => {
    const skill = publicSkill(ecommerce);

    expect(skill.outputs).toEqual([
      { id: 'main', label: '主图' },
      { id: 'scene', label: '场景图' },
      { id: 'points', label: '卖点图' },
    ]);
    expect(JSON.stringify(skill)).not.toContain(ecommerce.expertise);
    expect(SKILLS).toHaveLength(8);
  });
});

describe('fallbackPrompt', () => {
  it('quotes the required text and keeps the reference subject unchanged', () => {
    const values = readSkillValues(
      ecommerce,
      { product: '绿茶', price: '到手价 ¥199', badge: '限时特惠' },
      true,
    );
    const [main, scene] = ecommerce.outputs;

    const mainPrompt = fallbackPrompt(ecommerce, main!, values, true);
    expect(mainPrompt).toContain('“限时特惠”、“到手价 ¥199”');
    expect(mainPrompt).toContain('商品名称：绿茶');
    expect(mainPrompt).toContain('保持参考图中主体的外观');
    expect(fallbackPrompt(ecommerce, scene!, values, false)).toContain('画面中不要出现任何文字');
  });
});

describe('createSkillPlanner', () => {
  it('uses the templates without a chat model and resolves each output shape', async () => {
    const social = findSkill('social')!;
    const values = readSkillValues(social, { title: '周末去哪儿', platform: '抖音' }, false);

    const plan = await createSkillPlanner().plan(social, values, false);

    expect(plan.title).toBe('社媒封面 · 周末去哪儿');
    expect(plan.outputs.map((output) => [output.id, output.aspect])).toEqual([
      ['photo', '9:16'],
      ['illustration', '9:16'],
      ['bold', '9:16'],
    ]);
    expect(plan.outputs[0]?.prompt).toContain('“周末去哪儿”');
  });

  it('keeps planned prompts that preserve the text and replaces the ones that do not', async () => {
    const values = readSkillValues(
      ecommerce,
      { product: '绿茶', points: ['高山云雾'], price: '¥199' },
      false,
    );
    const fetchImpl = vi.fn(async () =>
      chatResponse(
        '```json\n' +
          JSON.stringify({
            main: '白色背景上的绿茶礼盒居中摆放，柔和棚拍光，右下角写着“¥199”。',
            scene: '清晨茶室木桌上的绿茶礼盒，窗外竹影，画面写着“新品上市”。',
            points: '绿茶礼盒在左侧，右侧列出卖点，排版简洁，但漏掉了文字。',
          }) +
          '\n```',
      ),
    );
    const planner = createSkillPlanner({
      baseUrl: 'https://llm.test/',
      apiKey: 'test-key',
      model: 'test-model',
      timeoutMs: 1000,
      fetchImpl,
    });

    const plan = await planner.plan(ecommerce, values, false);

    expect(plan.outputs[0]?.prompt).toBe(
      '白色背景上的绿茶礼盒居中摆放，柔和棚拍光，右下角写着“¥199”。',
    );
    // Quoting text nobody asked for, or dropping required text, falls back to the template.
    expect(plan.outputs[1]?.prompt).toBe(
      fallbackPrompt(ecommerce, ecommerce.outputs[1]!, values, false),
    );
    expect(plan.outputs[2]?.prompt).toContain('“高山云雾”');

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://llm.test/v1/chat/completions');
    expect(new Headers(init.headers).get('x-opencode-session')).toBe('nebulens-skill-plan');
    const body = JSON.parse(String(init.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.messages[0]?.content).toContain(ecommerce.expertise);
    expect(body.messages[1]?.content).toContain('- 商品名称：绿茶');
    expect(body.messages[1]?.content).toContain('必须出现的文字：“¥199”');
  });

  it('falls back to the templates when the chat model fails', async () => {
    const values = readSkillValues(ecommerce, { product: '绿茶' }, false);
    const planner = createSkillPlanner({
      baseUrl: 'https://llm.test',
      apiKey: 'test-key',
      model: 'test-model',
      timeoutMs: 1000,
      fetchImpl: vi.fn(async () => chatResponse('', 500)),
    });

    const plan = await planner.plan(ecommerce, values, false);

    expect(plan.outputs.map((output) => output.prompt)).toEqual(
      ecommerce.outputs.map((output) => fallbackPrompt(ecommerce, output, values, false)),
    );
  });
});
