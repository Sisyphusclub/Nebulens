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

/** Segments longer than this many characters may wrap; the model is told where it may break. */
const LONG_SEGMENT_LENGTH = 24;
const CJK_RE = /\p{Script=Han}/u;

/**
 * Appends an exact-text checklist for the prompt's quoted text, leaving the user's wording intact.
 * Prompts without quoted text are returned unchanged.
 */
export function structureVisibleTextPrompt(prompt: string): string {
  const texts = extractVisibleTexts(prompt);
  if (texts.length === 0) return prompt;
  const chinese = CJK_RE.test(prompt);
  const lines = texts.map((text, index) => {
    const quoted = chinese ? `“${text}”` : `"${text}"`;
    const isLong = Array.from(text).length > LONG_SEGMENT_LENGTH;
    const note = !isLong
      ? ''
      : chinese
        ? '（较长，可在标点处换行，不要拆开词语）'
        : ' (long: you may wrap at punctuation, never inside a word)';
    return `${index + 1}. ${quoted}${note}`;
  });
  const instruction = chinese
    ? '画面文字要求：图中出现的文字必须与下列内容逐字一致，不增字、不漏字、不改字，不用形近字或繁体字替换，引号本身不要画出来。'
    : 'Text requirements: render each line below exactly as written, letter for letter, with no added, missing or substituted characters. Do not draw the quotation marks.';
  return `${prompt}\n\n${instruction}\n${lines.join('\n')}`;
}
