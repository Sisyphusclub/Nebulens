import type { TextCheckResult, TextCheckSegment } from '@/types/image';

const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['“', '”'],
  ['「', '」'],
  ['『', '』'],
  ['"', '"'],
];

/** Whether the prompt quotes text for the image, which is what the server's check looks for. */
export function promptQuotesText(prompt: string): boolean {
  return QUOTE_PAIRS.some(([open, close]) => {
    const start = prompt.indexOf(open);
    if (start === -1) return false;
    const end = prompt.indexOf(close, start + open.length);
    return end !== -1 && prompt.slice(start + open.length, end).trim().length > 0;
  });
}

/** Wrong or missing text, as opposed to correct text that is merely hard to read. */
function isMisspelled(segment: TextCheckSegment): boolean {
  return !segment.ok;
}

function isDeformed(segment: TextCheckSegment): boolean {
  return segment.ok && segment.clear === false;
}

export function hasMisspelledText(check: TextCheckResult): boolean {
  return check.segments.some(isMisspelled);
}

/** One line per wrong, missing or deformed segment, for tooltips and notices. */
export function describeTextIssues(check: TextCheckResult): string[] {
  return check.segments.flatMap((segment) => {
    if (isMisspelled(segment)) {
      return [
        segment.found === null
          ? `没有找到“${segment.text}”`
          : `“${segment.text}”被写成了“${segment.found}”`,
      ];
    }
    return isDeformed(segment) ? [`“${segment.text}”有变形或挤压`] : [];
  });
}

/** Every text-fix edit prompt starts with this, which tells them apart from ordinary prompts. */
const TEXT_FIX_PROMPT_PREFIX = '请只修改图中的文字';

/** Whether a prompt is a text-fix edit of an earlier image rather than a standalone request. */
export function isTextFixPrompt(prompt: string): boolean {
  return prompt.startsWith(TEXT_FIX_PROMPT_PREFIX);
}

const redraw = (text: string): string =>
  `把“${text}”重新清晰地画一遍，字形端正、笔画完整、字距正常`;

/**
 * An edit prompt that rewrites or redraws only the problem text on the reference image.
 * When nothing was flagged the user still saw a problem, so every segment is redrawn.
 */
export function buildTextFixPrompt(check: TextCheckResult): string {
  const flagged = check.segments.flatMap((segment) => {
    if (isMisspelled(segment)) {
      return [
        segment.found === null
          ? `在原本应有文字的位置补上“${segment.text}”`
          : `把“${segment.found}”改为“${segment.text}”`,
      ];
    }
    return isDeformed(segment) ? [redraw(segment.text)] : [];
  });
  const fixes =
    flagged.length > 0 ? flagged : check.segments.map((segment) => redraw(segment.text));
  return `${TEXT_FIX_PROMPT_PREFIX}，画面、构图、配色和字体风格保持不变：${fixes.join('；')}。`;
}
