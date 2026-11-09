/** Prompts run long, so a shared piece's card is titled by its first clause. */
const TITLE_LENGTH = 18;

/**
 * The card title for a shared piece: the prompt's first sentence, or its first clause when
 * that is still long, without a leading aspect ratio such as "3:4".
 */
export function promptTitle(prompt: string): string {
  const [sentence = ''] = prompt.split(/[。！？!?；;\n]/u);
  const [clause = ''] = sentence.split(/[，,、：:](?!\d)/u);
  const title = (sentence.length > TITLE_LENGTH ? clause : sentence)
    .replace(/^\s*\d+\s*[:：]\s*\d+\s*/u, '')
    .trim();
  return title === '' ? prompt.trim() : title;
}
