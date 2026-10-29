import { describe, expect, it } from 'vitest';

import {
  extractVisibleTexts,
  scoreVisibleText,
  structureVisibleTextPrompt,
} from '../../src/utils/visibleText.js';

describe('extractVisibleTexts', () => {
  it('collects quoted text in Chinese, corner and ASCII double quotes in order', () => {
    expect(
      extractVisibleTexts('海报标题写“山柚观音”，副标题「冷泡系列」，角标写 "NEW" 和『限定』'),
    ).toEqual(['山柚观音', '冷泡系列', 'NEW', '限定']);
  });

  it('trims, drops empty segments and keeps the first of duplicates', () => {
    expect(extractVisibleTexts('写“ 开业大吉 ”、“”、“开业大吉”')).toEqual(['开业大吉']);
  });

  it('ignores apostrophes and unmatched quotes', () => {
    expect(extractVisibleTexts("don't add text, just a “sunset")).toEqual([]);
  });
});

describe('scoreVisibleText', () => {
  it('scores an exact rendering as fully correct regardless of spacing and punctuation', () => {
    const score = scoreVisibleText(['一口清醒，半城入夏'], '一口清醒 半城入夏\n其他文字');
    expect(score.accuracy).toBe(1);
    expect(score.segments[0]).toMatchObject({ distance: 0, exact: true });
  });

  it('finds the closest substring and counts character edits', () => {
    const score = scoreVisibleText(['每日前100名赠限定杯套'], '门店活动\n每目前100名赠限定杯套');
    expect(score.segments[0]).toMatchObject({ length: 12, distance: 1, exact: false });
    expect(score.accuracy).toBeCloseTo(11 / 12);
  });

  it('weights the overall accuracy by segment length', () => {
    const score = scoreVisibleText(['新品上市', 'ABCDEFGH'], '新品上市 ABCD');
    // 4/4 correct for the first, 4/8 for the second: (4 + 4) / 12.
    expect(score.accuracy).toBeCloseTo(8 / 12);
    expect(score.exactRate).toBe(0.5);
  });

  it('matches Latin text case-insensitively and normalises full-width characters', () => {
    const score = scoreVisibleText(['Grand Opening 50%'], 'GRAND OPENING ５０％');
    expect(score.accuracy).toBe(1);
  });

  it('reports zero accuracy for text that is missing entirely', () => {
    const score = scoreVisibleText(['限时特惠'], '');
    expect(score.accuracy).toBe(0);
    expect(score.segments[0]?.distance).toBe(4);
  });
});

describe('text rendering evaluation cases', () => {
  it('lists exactly the quoted text of each prompt as its expected text', async () => {
    const { cases } = (
      await import('../../src/scripts/textEval/cases.json', {
        with: { type: 'json' },
      })
    ).default as { cases: Array<{ id: string; prompt: string; texts: string[] }> };

    expect(cases).toHaveLength(50);
    for (const testCase of cases) {
      expect({ id: testCase.id, texts: extractVisibleTexts(testCase.prompt) }).toEqual({
        id: testCase.id,
        texts: testCase.texts,
      });
    }
  });
});

describe('structureVisibleTextPrompt', () => {
  it('leaves prompts without quoted text unchanged', () => {
    const prompt = '雨后的未来都市街道，霓虹倒影，电影级广角构图';
    expect(structureVisibleTextPrompt(prompt)).toBe(prompt);
  });

  it('appends a numbered exact-text checklist in Chinese for Chinese prompts', () => {
    const structured = structureVisibleTextPrompt('奶茶海报，标题“新品上市”，价格“中杯16元”');

    expect(structured.startsWith('奶茶海报，标题“新品上市”，价格“中杯16元”\n\n')).toBe(true);
    expect(structured).toContain('逐字一致');
    expect(structured).toContain('字形端正、笔画完整清晰');
    expect(structured).toContain('数字与汉字之间保持正常间距');
    expect(structured).toContain('1. “新品上市”');
    expect(structured).toContain('2. “中杯16元”');
    expect(structured).not.toContain('较长');
  });

  it('marks long segments so the model may wrap at punctuation without splitting words', () => {
    const body = '选用高山铁观音茶底，搭配新鲜西柚果肉，冷萃十二小时，入口清爽回甘。';
    expect(structureVisibleTextPrompt(`说明卡，正文“${body}”`)).toContain(
      `1. “${body}”（较长，可在标点处换行，不要拆开词语）`,
    );
  });

  it('writes the checklist in English for prompts without Chinese characters', () => {
    const structured = structureVisibleTextPrompt('A coffee shop poster that says "Grand Opening"');

    expect(structured).toContain('exactly as written');
    expect(structured).toContain('evenly spaced');
    expect(structured).toContain('1. "Grand Opening"');
  });
});
