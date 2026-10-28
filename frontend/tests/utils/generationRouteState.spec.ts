import { describe, expect, it } from 'vitest';

import { MAX_REFERENCE_IMAGES } from '@/types/image';
import { readInitialReferenceFiles, requestsAutoGeneration } from '@/utils/generationRouteState';

describe('requestsAutoGeneration', () => {
  it('only accepts an explicit autoGenerate flag', () => {
    expect(requestsAutoGeneration({ autoGenerate: true })).toBe(true);
    expect(requestsAutoGeneration({ autoGenerate: 'true' })).toBe(false);
    expect(requestsAutoGeneration({})).toBe(false);
    expect(requestsAutoGeneration(null)).toBe(false);
    expect(requestsAutoGeneration(undefined)).toBe(false);
  });
});

describe('readInitialReferenceFiles', () => {
  it('keeps only real files and caps them at the reference limit', () => {
    const files = Array.from(
      { length: MAX_REFERENCE_IMAGES + 1 },
      (_, index) => new File(['x'], `ref-${index}.png`, { type: 'image/png' }),
    );
    const attachments = [
      { file: 'not-a-file' },
      null,
      { name: 'missing file' },
      ...files.map((file) => ({ file })),
    ];

    expect(readInitialReferenceFiles({ attachments })).toEqual(
      files.slice(0, MAX_REFERENCE_IMAGES),
    );
  });

  it('returns nothing for missing or malformed state', () => {
    expect(readInitialReferenceFiles(null)).toEqual([]);
    expect(readInitialReferenceFiles({ attachments: 'nope' })).toEqual([]);
  });
});
