import type { TextCheckResult } from '@/types/image';

/** One line per wrong or missing segment, for tooltips and notices. */
export function describeTextIssues(check: TextCheckResult): string[] {
  return check.segments
    .filter((segment) => !segment.ok)
    .map((segment) =>
      segment.found === null
        ? `没有找到“${segment.text}”`
        : `“${segment.text}”被写成了“${segment.found}”`,
    );
}

/** An edit prompt that rewrites only the wrong text on the reference image. */
export function buildTextFixPrompt(check: TextCheckResult): string {
  const fixes = check.segments
    .filter((segment) => !segment.ok)
    .map((segment) =>
      segment.found === null
        ? `在原本应有文字的位置补上“${segment.text}”`
        : `把“${segment.found}”改为“${segment.text}”`,
    );
  return `请只修改图中的文字，画面、构图、配色和字体风格保持不变：${fixes.join('；')}。`;
}
