/**
 * Helpers for text that a prompt asks to appear inside the generated image.
 * Shared by prompt structuring and by the OCR-based accuracy evaluation.
 */

const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['“', '”'],
  ['「', '」'],
  ['『', '』'],
  ['"', '"'],
];

/** Quoted segments in prompt order, trimmed and de-duplicated. Apostrophes are not quotes. */
export function extractVisibleTexts(prompt: string): string[] {
  const found: Array<{ index: number; text: string }> = [];
  for (const [open, close] of QUOTE_PAIRS) {
    let cursor = 0;
    while (cursor < prompt.length) {
      const start = prompt.indexOf(open, cursor);
      if (start === -1) break;
      const end = prompt.indexOf(close, start + open.length);
      if (end === -1) break;
      found.push({ index: start, text: prompt.slice(start + open.length, end).trim() });
      cursor = end + close.length;
    }
  }
  const texts: string[] = [];
  for (const { text } of found.sort((a, b) => a.index - b.index)) {
    if (text.length > 0 && !texts.includes(text)) texts.push(text);
  }
  return texts;
}

/** Compare form: full-width folded, lower-cased, without whitespace or punctuation. */
function normalize(text: string): string[] {
  return Array.from(
    text
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\p{P}\p{Z}\s]/gu, ''),
  );
}

/** Edit distance between `needle` and its closest substring of `haystack` (Sellers). */
function closestSubstringDistance(needle: string[], haystack: string[]): number {
  let previous: number[] = new Array<number>(haystack.length + 1).fill(0);
  for (let i = 1; i <= needle.length; i += 1) {
    const current: number[] = [i];
    for (let j = 1; j <= haystack.length; j += 1) {
      const substitution = (previous[j - 1] ?? 0) + (needle[i - 1] === haystack[j - 1] ? 0 : 1);
      current.push(Math.min(substitution, (previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1));
    }
    previous = current;
  }
  return Math.min(...previous);
}

export interface VisibleTextSegmentScore {
  text: string;
  length: number;
  distance: number;
  exact: boolean;
}

export interface VisibleTextScore {
  /** Correct characters over expected characters, weighted by segment length. */
  accuracy: number;
  /** Share of segments rendered without a single character error. */
  exactRate: number;
  segments: VisibleTextSegmentScore[];
}

/** Scores expected segments against recognized text, ignoring layout, spacing and punctuation. */
export function scoreVisibleText(
  expected: readonly string[],
  recognized: string,
): VisibleTextScore {
  const haystack = normalize(recognized);
  const segments = expected.map((text) => {
    const needle = normalize(text);
    const distance = Math.min(closestSubstringDistance(needle, haystack), needle.length);
    return { text, length: needle.length, distance, exact: distance === 0 };
  });
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  const correct = segments.reduce((sum, segment) => sum + segment.length - segment.distance, 0);
  return {
    accuracy: total === 0 ? 1 : correct / total,
    exactRate:
      segments.length === 0
        ? 1
        : segments.filter((segment) => segment.exact).length / segments.length,
    segments,
  };
}
