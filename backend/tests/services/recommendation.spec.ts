import { describe, expect, it } from 'vitest';

import {
  inferCategory,
  rankRecommendations,
  type RecommendationCandidate,
} from '../../src/services/recommendation.service.js';

function candidate(
  id: string,
  fields: Partial<Omit<RecommendationCandidate, 'id'>>,
): RecommendationCandidate {
  return { id, prompt: '', tags: [], createdAt: new Date('2026-10-01T00:00:00Z'), ...fields };
}

describe('inferCategory', () => {
  it.each([
    ['做一张奶茶新品海报', 'poster'],
    ['小红书封面，周末去哪儿', 'social'],
    ['耳机电商主图，白底', 'ecommerce'],
    ['公司年报的信息图', 'infographic'],
    ['极简品牌 LOGO 设计', 'logo'],
    ['雨后的城市街道', undefined],
  ])('reads the usage from “%s”', (query, expected) => {
    expect(inferCategory(query)).toBe(expected);
  });
});

describe('rankRecommendations', () => {
  const now = new Date('2026-10-28T00:00:00Z');
  const candidates = [
    candidate('tea-poster', {
      prompt: '奶茶新品上市海报，清新绿色',
      description: '奶茶新品海报',
      tags: ['奶茶', '新品', '清新'],
      category: 'poster',
    }),
    candidate('coffee-poster', {
      prompt: '咖啡店开业海报',
      tags: ['咖啡', '开业'],
      category: 'poster',
    }),
    candidate('city', {
      prompt: '雨夜城市街道，霓虹倒影',
      tags: ['城市', '夜景'],
      category: 'photo',
    }),
  ];

  it('puts the closest teammate work first and explains why', () => {
    const ranked = rankRecommendations('奶茶新品海报，夏日清新风格', candidates, { now, limit: 5 });

    expect(ranked.map((item) => item.id)).toEqual(['tea-poster', 'coffee-poster']);
    expect(ranked[0]?.reason).toBe('同为海报 · 标签相近：奶茶、新品、清新');
    expect(ranked[1]?.reason).toBe('同为海报');
  });

  it('drops unrelated work and respects the limit', () => {
    expect(rankRecommendations('奶茶新品海报', candidates, { now, limit: 1 })).toHaveLength(1);
    expect(rankRecommendations('宇宙飞船', candidates, { now, limit: 5 })).toEqual([]);
  });

  it('matches on prompt wording when there is no shared category or tag', () => {
    const ranked = rankRecommendations('霓虹倒影的街道', candidates, { now, limit: 5 });
    expect(ranked[0]).toMatchObject({ id: 'city', reason: '画面描述相近' });
  });
});
