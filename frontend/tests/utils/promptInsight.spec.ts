import { describe, expect, it } from 'vitest';

import { analyzePrompt, inferCategory } from '@/utils/promptInsight';

describe('inferCategory', () => {
  it.each([
    ['做一张奶茶新品海报', 'poster'],
    ['小红书封面，周末去哪儿', 'social'],
    ['耳机电商主图，白底', 'ecommerce'],
    ['极简品牌 LOGO 设计', 'logo'],
    ['雨后的城市街道', undefined],
  ])('reads the usage from “%s”', (prompt, expected) => {
    expect(inferCategory(prompt)).toBe(expected);
  });
});

describe('analyzePrompt', () => {
  it('collects the usage, the text to render and whether it is dense', () => {
    expect(
      analyzePrompt(
        '门店活动海报，主标题“周年庆典”，副标题“全场第二件半价”，底部写“11月1日至11月7日”',
      ),
    ).toEqual({
      category: 'poster',
      texts: ['周年庆典', '全场第二件半价', '11月1日至11月7日'],
      dense: true,
    });
  });

  it('reports nothing special for a plain description', () => {
    expect(analyzePrompt('雨后的城市街道，霓虹倒影')).toEqual({ texts: [], dense: false });
  });
});
