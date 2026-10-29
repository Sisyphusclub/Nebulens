/** Quote pairs that mark text to render; mirrors the backend's prompt structuring. */
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

const DENSE_SEGMENTS = 3;
const DENSE_CHARACTERS = 20;

/** Enough text that, at standard resolution, small lines tend to come out deformed. */
export function isTextDense(prompt: string): boolean {
  const texts = extractVisibleTexts(prompt);
  const characters = texts.reduce(
    (sum, text) => sum + Array.from(text.replace(/\s/gu, '')).length,
    0,
  );
  return texts.length >= DENSE_SEGMENTS || characters >= DENSE_CHARACTERS;
}
