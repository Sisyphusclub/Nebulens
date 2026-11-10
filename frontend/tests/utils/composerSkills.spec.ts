import { describe, expect, it } from 'vitest';

import { briefForSkill, findLandingSkill } from '@/data/composerSkills';

const poster = findLandingSkill('poster')!;
const ecommerce = findLandingSkill('ecommerce')!;

describe('briefForSkill', () => {
  it('drops the opening that only names the kind of set, as a skill pill would', () => {
    expect(briefForSkill('做一套活动海报：周年庆典，全场第二件半价', poster)).toBe(
      '周年庆典，全场第二件半价',
    );
    expect(briefForSkill('帮我设计一套电商主图，山川绿茶，高山云雾', ecommerce)).toBe(
      '山川绿茶，高山云雾',
    );
    expect(briefForSkill('活动海报：周年庆典', poster)).toBe('周年庆典');
  });

  it('keeps a request whose opening is already the content', () => {
    expect(briefForSkill('给山川绿茶做一套淘宝主图', ecommerce)).toBe('给山川绿茶做一套淘宝主图');
    expect(briefForSkill('周年庆典的活动海报，全场第二件半价', poster)).toBe(
      '周年庆典的活动海报，全场第二件半价',
    );
  });

  it('leaves nothing when the request only names the set, so the skill asks for its subject', () => {
    expect(briefForSkill('做一套活动海报', poster)).toBe('');
  });
});
