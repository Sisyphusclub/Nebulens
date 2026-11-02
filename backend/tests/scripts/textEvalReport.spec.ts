import { describe, expect, it } from 'vitest';

import {
  formatTextEvalReport,
  summarizeTextEval,
  type TextEvalResult,
} from '../../src/scripts/textEval/textEvalReport.js';
import { scoreVisibleText } from '../../src/utils/visibleText.js';

const results: TextEvalResult[] = [
  {
    caseId: 'short-01',
    category: 'short',
    variant: 'raw',
    image: 'short-01.png',
    recognized: '新品上市',
    score: scoreVisibleText(['新品上市'], '新品上市'),
  },
  {
    caseId: 'long-01',
    category: 'long',
    variant: 'raw',
    image: 'long-01.png',
    recognized: '山柚观音冷泡系',
    score: scoreVisibleText(['山柚观音冷泡系列'], '山柚观音冷泡系'),
  },
  { caseId: 'long-02', category: 'long', variant: 'raw', error: 'timeout' },
];

describe('summarizeTextEval', () => {
  it('summarizes each category and the whole variant, excluding failed generations', () => {
    expect(summarizeTextEval(results)).toEqual([
      { variant: 'raw', category: 'short', cases: 1, failed: 0, accuracy: 1, allExactRate: 1 },
      {
        variant: 'raw',
        category: 'long',
        cases: 2,
        failed: 1,
        accuracy: 7 / 8,
        allExactRate: 0,
      },
      {
        variant: 'raw',
        category: 'all',
        cases: 3,
        failed: 1,
        accuracy: 11 / 12,
        allExactRate: 0.5,
      },
    ]);
  });
});

describe('formatTextEvalReport', () => {
  it('renders the summary table and lists wrong or failed text', () => {
    const report = formatTextEvalReport(
      { model: 'gpt-image-2', resolution: 'standard', startedAt: '2026-10-28T08:00:00.000Z' },
      results,
    );

    expect(report).toContain('| raw | all | 3 | 1 | 91.7% | 50.0% |');
    expect(report).toContain('- raw / long-01: “山柚观音冷泡系列” 错 1 字');
    expect(report).toContain('- raw / long-02: 生成失败（timeout）');
  });
});
