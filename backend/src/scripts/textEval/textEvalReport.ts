import type { VisibleTextScore } from '../../utils/visibleText.js';

export interface TextEvalCase {
  id: string;
  category: string;
  aspectRatio: string;
  prompt: string;
  texts: string[];
}

export type TextEvalResult =
  | {
      caseId: string;
      category: string;
      variant: string;
      image: string;
      recognized: string;
      score: VisibleTextScore;
    }
  | { caseId: string; category: string; variant: string; error: string };

export interface TextEvalGroupSummary {
  variant: string;
  category: string;
  cases: number;
  failed: number;
  /** Character accuracy over every expected character in the group's scored cases. */
  accuracy: number;
  /** Share of scored cases whose every segment was rendered exactly. */
  allExactRate: number;
}

function summarizeGroup(
  variant: string,
  category: string,
  results: readonly TextEvalResult[],
): TextEvalGroupSummary {
  const scored = results.flatMap((result) => ('score' in result ? [result.score] : []));
  const segments = scored.flatMap((score) => score.segments);
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  const correct = segments.reduce((sum, segment) => sum + segment.length - segment.distance, 0);
  return {
    variant,
    category,
    cases: results.length,
    failed: results.length - scored.length,
    accuracy: total === 0 ? 0 : correct / total,
    allExactRate:
      scored.length === 0
        ? 0
        : scored.filter((score) => score.segments.every((segment) => segment.exact)).length /
          scored.length,
  };
}

/** One row per variant and category, followed by an `all` row per variant. */
export function summarizeTextEval(results: readonly TextEvalResult[]): TextEvalGroupSummary[] {
  const variants = [...new Set(results.map((result) => result.variant))];
  return variants.flatMap((variant) => {
    const ofVariant = results.filter((result) => result.variant === variant);
    const categories = [...new Set(ofVariant.map((result) => result.category))];
    return [
      ...categories.map((category) =>
        summarizeGroup(
          variant,
          category,
          ofVariant.filter((result) => result.category === category),
        ),
      ),
      summarizeGroup(variant, 'all', ofVariant),
    ];
  });
}

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;

export function formatTextEvalReport(
  meta: { model: string; resolution: string; startedAt: string },
  results: readonly TextEvalResult[],
): string {
  const rows = summarizeTextEval(results).map(
    (row) =>
      `| ${row.variant} | ${row.category} | ${row.cases} | ${row.failed} | ${percent(row.accuracy)} | ${percent(row.allExactRate)} |`,
  );
  const misses = results
    .flatMap((result) =>
      'score' in result
        ? result.score.segments
            .filter((segment) => !segment.exact)
            .map(
              (segment) =>
                `- ${result.variant} / ${result.caseId}: “${segment.text}” 错 ${segment.distance} 字`,
            )
        : [`- ${result.variant} / ${result.caseId}: 生成失败（${result.error}）`],
    )
    .slice(0, 40);
  return [
    `# 画面文字准确率测评`,
    '',
    `- 模型：${meta.model}`,
    `- 清晰度：${meta.resolution}`,
    `- 开始时间：${meta.startedAt}`,
    `- 识别：macOS Vision（识别误差会计入错误）`,
    '',
    '| 方案 | 分类 | 用例 | 失败 | 字符准确率 | 整图全对率 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '## 出错的文字（最多 40 条）',
    '',
    ...(misses.length > 0 ? misses : ['- 无']),
    '',
  ].join('\n');
}
