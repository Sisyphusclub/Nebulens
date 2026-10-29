import { describe, expect, it } from 'vitest';

import type { TextCheckResult } from '@/types/image';
import { buildTextFixPrompt, describeTextIssues, isTextFixPrompt } from '@/utils/textCheck';

const issues: TextCheckResult = {
  status: 'issues',
  segments: [
    { text: '新品上市', found: '新品上市', ok: true },
    { text: '中杯16元', found: '中杯15元', ok: false },
    { text: '大杯19元', found: null, ok: false },
  ],
};

describe('describeTextIssues', () => {
  it('lists each wrong or missing segment in plain words', () => {
    expect(describeTextIssues(issues)).toEqual([
      '“中杯16元”被写成了“中杯15元”',
      '没有找到“大杯19元”',
    ]);
  });
});

describe('buildTextFixPrompt', () => {
  it('asks to change only the wrong text and keep everything else', () => {
    const prompt = buildTextFixPrompt(issues);

    expect(prompt).toContain('只修改图中的文字');
    expect(prompt).toContain('把“中杯15元”改为“中杯16元”');
    expect(prompt).toContain('补上“大杯19元”');
    expect(prompt).not.toContain('新品上市');
  });
});

describe('legibility issues', () => {
  const deformed: TextCheckResult = {
    status: 'issues',
    segments: [
      { text: '周年庆典', found: '周年庆典', ok: true, clear: true },
      { text: '11月1日至11月7日', found: '11月1日至11月7日', ok: true, clear: false },
    ],
  };

  it('describes correctly spelled but deformed text', () => {
    expect(describeTextIssues(deformed)).toEqual(['“11月1日至11月7日”有变形或挤压']);
  });

  it('asks to redraw deformed text cleanly without changing it', () => {
    const prompt = buildTextFixPrompt(deformed);
    expect(prompt).toContain('把“11月1日至11月7日”重新清晰地画一遍');
    expect(prompt).not.toContain('周年庆典');
  });
});

describe('redrawing text that passed the check', () => {
  it('asks to redraw every segment when nothing was flagged', () => {
    const prompt = buildTextFixPrompt({
      status: 'passed',
      segments: [
        { text: '周年庆典', found: '周年庆典', ok: true, clear: true },
        { text: '11月7日', found: '11月7日', ok: true, clear: true },
      ],
    });
    expect(prompt).toContain('把“周年庆典”重新清晰地画一遍');
    expect(prompt).toContain('把“11月7日”重新清晰地画一遍');
  });
});

describe('isTextFixPrompt', () => {
  it('recognises the edit prompts built for fixing text, and nothing else', () => {
    const check: TextCheckResult = {
      status: 'issues',
      segments: [{ text: '中杯16元', found: '中杯15元', ok: false }],
    };
    expect(isTextFixPrompt(buildTextFixPrompt(check))).toBe(true);
    expect(isTextFixPrompt('奶茶价目牌，写“中杯16元”')).toBe(false);
  });
});
