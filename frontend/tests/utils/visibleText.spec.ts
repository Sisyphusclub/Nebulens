import { describe, expect, it } from 'vitest';

import { extractVisibleTexts, isTextDense } from '@/utils/visibleText';

describe('extractVisibleTexts', () => {
  it('collects quoted text in prompt order, ignoring apostrophes and duplicates', () => {
    expect(
      extractVisibleTexts('标题“新品上市”，角标「限定」，写 "NEW"，再写“新品上市”，don\'t'),
    ).toEqual(['新品上市', '限定', 'NEW']);
  });
});

describe('isTextDense', () => {
  it('flags prompts with many text segments or many characters to render', () => {
    expect(
      isTextDense('主标题“周年庆典”，副标题“全场第二件半价”，底部写“活动时间 11月1日至11月7日”'),
    ).toBe(true);
    expect(isTextDense('正文写“选用高山铁观音茶底，搭配新鲜西柚果肉，冷萃十二小时”')).toBe(true);
  });

  it('leaves short titles and prompts without text alone', () => {
    expect(isTextDense('奶茶海报，标题“新品上市”')).toBe(false);
    expect(isTextDense('雨后的城市街道，霓虹倒影')).toBe(false);
  });
});
