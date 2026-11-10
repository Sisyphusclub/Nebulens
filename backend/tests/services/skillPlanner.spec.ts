import { describe, expect, it, vi } from 'vitest';

import {
  briefAnswers,
  createSkillPlanner,
  fallbackPrompt,
  missingBriefField,
  publicSkill,
  readSkillValues,
  skillNamedIn,
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
    expect(SKILLS).toHaveLength(14);
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
    expect(body.messages[0]?.content).toContain('表单里没填的信息');
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

describe('briefAnswers', () => {
  it('fills the required text, then the list, from the phrases between commas', () => {
    expect(briefAnswers(ecommerce, '山川明前绿茶，高山云雾、手工炒制；“明前”采摘')).toEqual({
      product: '山川明前绿茶',
      points: ['高山云雾', '手工炒制', '明前采摘'],
    });
    expect(briefAnswers(findSkill('logo')!, '山野咖啡, 精品咖啡馆, 温暖')).toEqual({
      name: '山野咖啡',
      industry: '精品咖啡馆',
    });
  });

  it('puts the whole brief in the first text field of a skill without required text', () => {
    expect(briefAnswers(findSkill('restyle')!, '保留人物，背景换成星空')).toEqual({
      extra: '保留人物，背景换成星空',
    });
  });

  it('cuts answers to the field limits and reports what is still missing', () => {
    const answers = briefAnswers(ecommerce, '一'.repeat(40));

    expect(answers.product).toHaveLength(30);
    expect(missingBriefField(ecommerce, answers)).toBeUndefined();
    expect(missingBriefField(ecommerce, briefAnswers(ecommerce, ' ，'))?.label).toBe('商品名称');
  });
});

describe('createSkillPlanner readBrief', () => {
  const config = {
    baseUrl: 'https://llm.test',
    apiKey: 'test-key',
    model: 'test-model',
    timeoutMs: 1000,
  };

  it('keeps the words the chat model picked out, within the field limits', async () => {
    const fetchImpl = vi.fn(async () =>
      chatResponse(
        JSON.stringify({
          product: '山川明前绿茶',
          points: '高山云雾',
          price: '到手价 ¥199',
          style: '赛博',
          unknown: 'x',
        }),
      ),
    );
    const planner = createSkillPlanner({ ...config, fetchImpl });

    const answers = await planner.readBrief(ecommerce, '山川明前绿茶，高山云雾，到手价 ¥199');

    expect(answers).toEqual({
      product: '山川明前绿茶',
      points: ['高山云雾'],
      price: '到手价 ¥199',
    });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      temperature: number;
      messages: Array<{ content: string }>;
    };
    expect(body.temperature).toBe(0);
    expect(body.messages[1]?.content).toContain('- product（商品名称，文字，不超过 30 字，必填）');
    expect(body.messages[1]?.content).not.toContain('style');
  });

  it('reads the brief plainly when the model skips the subject or fails', async () => {
    const skipping = createSkillPlanner({
      ...config,
      fetchImpl: vi.fn(async () => chatResponse('{"points": ["高山云雾"]}')),
    });
    expect(await skipping.readBrief(ecommerce, '绿茶，高山云雾')).toEqual({
      product: '绿茶',
      points: ['高山云雾'],
    });

    const failing = createSkillPlanner({
      ...config,
      fetchImpl: vi.fn(async () => chatResponse('', 500)),
    });
    expect(await failing.readBrief(ecommerce, '绿茶，高山云雾')).toEqual(
      briefAnswers(ecommerce, '绿茶，高山云雾'),
    );
  });
});

describe('enterprise skills', () => {
  const skill = (id: string) => findSkill(id)!;

  it('reads a one-line architecture brief and quotes every layer exactly', () => {
    const architecture = skill('architecture');
    const answers = briefAnswers(architecture, '产业数智平台，设备接入层、数据中台、智能应用');
    const values = readSkillValues(architecture, answers, false);
    const prompt = fallbackPrompt(architecture, architecture.outputs[0]!, values, false);

    expect(prompt).toContain('“产业数智平台”、“设备接入层”、“数据中台”、“智能应用”');
    expect(architecture.outputs.map((output) => output.aspect)).toEqual(['16:9', '4:3']);
  });

  it('builds a report contents page from its sections', () => {
    const report = skill('report');
    const values = readSkillValues(
      report,
      briefAnswers(report, '年度经营汇报，市场拓展、项目交付'),
      false,
    );
    const contents = report.outputs.find((output) => output.id === 'contents')!;

    expect(contents.texts?.(values)).toEqual(['目录', '市场拓展', '项目交付']);
  });

  it('keeps factory scenes free of text and the uploaded equipment unchanged', () => {
    const factory = skill('factory');
    const values = readSkillValues(factory, briefAnswers(factory, '六轴焊接机器人'), true);

    for (const output of factory.outputs) {
      const prompt = fallbackPrompt(factory, output, values, true);
      expect(prompt).toContain('画面中不要出现任何文字');
      expect(prompt).toContain('保持参考图中主体的外观');
      expect(prompt).toContain('智能工厂');
    }
  });

  it('asks for the capabilities a solution visual has to show', () => {
    const solution = skill('solution');
    expect(missingBriefField(solution, briefAnswers(solution, '柔性产线方案'))?.label).toBe(
      '核心能力',
    );
  });

  it('passes the chosen infographic layout to the prompt', () => {
    const infographic = skill('infographic');
    const values = readSkillValues(
      infographic,
      { title: '项目交付', steps: ['立项', '上线'], layout: '时间线里程碑' },
      false,
    );

    expect(fallbackPrompt(infographic, infographic.outputs[0]!, values, false)).toContain(
      '版式：时间线里程碑',
    );
  });
});

describe('creator skills', () => {
  it('quotes the storyboard shots and keeps the keyframe free of text', () => {
    const storyboard = findSkill('storyboard')!;
    const values = readSkillValues(
      storyboard,
      briefAnswers(storyboard, '雨夜重逢，车站远景、撑伞走近'),
      false,
    );
    const [board, keyframe] = storyboard.outputs;

    expect(fallbackPrompt(storyboard, board!, values, false)).toContain(
      '“雨夜重逢”、“车站远景”、“撑伞走近”',
    );
    expect(fallbackPrompt(storyboard, keyframe!, values, false)).toContain(
      '画面中不要出现任何文字',
    );
  });

  it('reads a character brief into identity and looks', () => {
    const character = findSkill('character')!;
    const answers = briefAnswers(character, '赛博朋克女黑客，银色短发');

    expect(answers).toMatchObject({ name: '赛博朋克女黑客', looks: '银色短发' });
    expect(character.outputs.map((output) => output.id)).toEqual([
      'turnaround',
      'portrait',
      'expressions',
    ]);
  });
});

describe('createSkillPlanner selectSkill', () => {
  const chatConfig = {
    baseUrl: 'https://llm.test',
    apiKey: 'test-key',
    model: 'test-model',
    timeoutMs: 1000,
  };

  it('takes a skill the request names without asking the model', async () => {
    const fetchImpl = vi.fn();
    const planner = createSkillPlanner({ ...chatConfig, fetchImpl });

    expect(await planner.selectSkill('给周年庆做一套活动海报', false)).toBe('poster');
    expect(fetchImpl).not.toHaveBeenCalled();
    // A skill that redraws an uploaded image is only named once there is one.
    expect(skillNamedIn('把这张图做风格重绘', false)).toBeNull();
    expect(skillNamedIn('把这张图做风格重绘', true)).toBe('restyle');
  });

  it('keeps the skill the chat model picks, from a list of every skill and its needs', async () => {
    const fetchImpl = vi.fn(async () => chatResponse('{"skillId": "ecommerce"}'));
    const planner = createSkillPlanner({ ...chatConfig, fetchImpl });

    expect(await planner.selectSkill('山川明前绿茶的淘宝首图，突出高山云雾', false)).toBe(
      'ecommerce',
    );
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      temperature: number;
      messages: Array<{ content: string }>;
    };
    expect(body.temperature).toBe(0);
    expect(body.messages[1]?.content).toContain('- ecommerce（电商主图）');
    expect(body.messages[1]?.content).toContain('必填：商品名称');
    expect(body.messages[1]?.content).toContain('需要参考图');
    expect(body.messages[1]?.content).toContain('已上传参考图：否');
  });

  it('answers null for unknown picks, image skills without an image, no model and failures', async () => {
    const answering = (content: string, status = 200) =>
      createSkillPlanner({
        ...chatConfig,
        fetchImpl: vi.fn(async () => chatResponse(content, status)),
      });

    expect(await answering('{"skillId": "nope"}').selectSkill('一张海边日落', false)).toBeNull();
    expect(await answering('{"skillId": null}').selectSkill('一张海边日落', false)).toBeNull();
    expect(
      await answering('{"skillId": "background"}').selectSkill('给这款香水换个海边背景', false),
    ).toBeNull();
    expect(
      await answering('{"skillId": "background"}').selectSkill('给这款香水换个海边背景', true),
    ).toBe('background');
    expect(await answering('', 500).selectSkill('一张海边日落', false)).toBeNull();
    expect(await createSkillPlanner().selectSkill('一张海边日落', false)).toBeNull();
  });
});

describe('createSkillPlanner planFreely', () => {
  const chatConfig = {
    baseUrl: 'https://llm.test',
    apiKey: 'test-key',
    model: 'test-model',
    timeoutMs: 1000,
  };

  it('turns the chat model answer into at most four planned images', async () => {
    const images = Array.from({ length: 5 }, (_, index) => ({
      label: `第${index + 1}张`,
      aspect: index === 0 ? '3:4' : 'banana',
      prompt: `雨夜的未来城市，第 ${index + 1} 个构图，霓虹倒影`,
    }));
    const fetchImpl = vi.fn(async () =>
      chatResponse(JSON.stringify({ title: '雨夜城市', images })),
    );
    const planner = createSkillPlanner({ ...chatConfig, fetchImpl });

    const plan = await planner.planFreely('雨夜的未来城市，做一组', true);

    expect(plan.title).toBe('雨夜城市');
    expect(plan.outputs).toHaveLength(4);
    expect(plan.outputs[0]).toEqual({
      id: 'image-1',
      label: '第1张',
      aspect: '3:4',
      prompt: '雨夜的未来城市，第 1 个构图，霓虹倒影',
    });
    expect(plan.outputs[1]?.aspect).toBe('auto');
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { messages: Array<{ content: string }> };
    expect(body.messages[1]?.content).toContain('已上传参考图：是');
    expect(body.messages[1]?.content).toContain('用户需求：雨夜的未来城市，做一组');
  });

  it('drops unusable images and names the set after the request without a title', async () => {
    const fetchImpl = vi.fn(async () =>
      chatResponse(
        JSON.stringify({
          images: [{ prompt: '短' }, { label: ' ', prompt: '晨雾中的灯塔，胶片质感，冷色调' }],
        }),
      ),
    );

    const plan = await createSkillPlanner({ ...chatConfig, fetchImpl }).planFreely(
      '晨雾中的灯塔',
      false,
    );

    expect(plan).toEqual({
      title: '晨雾中的灯塔',
      outputs: [
        {
          id: 'image-1',
          label: '第 1 张',
          aspect: 'auto',
          prompt: '晨雾中的灯塔，胶片质感，冷色调',
        },
      ],
    });
  });

  it('says Agent needs a text model without one, and that planning failed when the model did', async () => {
    await expect(createSkillPlanner().planFreely('雨夜', false)).rejects.toMatchObject({
      code: 'TEXT_MODEL_UNAVAILABLE',
      status: 503,
    });
    const failing = createSkillPlanner({
      ...chatConfig,
      fetchImpl: vi.fn(async () => chatResponse('', 500)),
    });
    await expect(failing.planFreely('雨夜', false)).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      status: 502,
    });
    const empty = createSkillPlanner({
      ...chatConfig,
      fetchImpl: vi.fn(async () => chatResponse('{"images": []}')),
    });
    await expect(empty.planFreely('雨夜', false)).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      status: 502,
    });
  });
});
