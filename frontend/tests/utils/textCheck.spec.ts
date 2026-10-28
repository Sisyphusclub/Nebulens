import { describe, expect, it } from 'vitest';

import type { TextCheckResult } from '@/types/image';
import { buildTextFixPrompt, describeTextIssues } from '@/utils/textCheck';

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
