import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { readReferenceIds, useGenerationSettings } from '@/hooks/useGenerationSettings';
import { DEFAULT_IMAGE_MODEL, MAX_REFERENCE_IMAGES } from '@/types/image';

describe('useGenerationSettings', () => {
  it('initialises from search params and falls back on invalid values', () => {
    const { result } = renderHook(() =>
      useGenerationSettings(
        new URLSearchParams('model=gpt-image-2&count=99&resolution=2k&aspect=16:9&isPublic=true'),
      ),
    );

    expect(result.current.model).toBe('gpt-image-2');
    expect(result.current.count).toBe(1);
    expect(result.current.resolution).toBe('2k');
    expect(result.current.aspect).toBe('16:9');
    // Discover publishing is retired, so a legacy isPublic=true link has no effect.
    expect(result.current).not.toHaveProperty('isPublic');
  });

  it('re-syncs when the search params change', () => {
    const { result, rerender } = renderHook(({ params }) => useGenerationSettings(params), {
      initialProps: { params: new URLSearchParams('count=2') },
    });
    expect(result.current.count).toBe(2);

    rerender({ params: new URLSearchParams('count=3&model=gemini-3-pro-image') });

    expect(result.current.count).toBe(3);
    expect(result.current.model).toBe('gemini-3-pro-image');
  });

  it('applies a snapshot and builds one back, omitting quality for unsupported models', async () => {
    // Stable params, as useSearchParams provides between navigations.
    const params = new URLSearchParams();
    const { result } = renderHook(() => useGenerationSettings(params));
    expect(result.current.model).toBe(DEFAULT_IMAGE_MODEL);

    act(() => {
      result.current.applySnapshot({
        prompt: 'ignored',
        model: 'gpt-image-2',
        count: 2,
        aspectRatio: '3:2',
        resolution: '4k',
        quality: 'high',
        isPublic: true,
        referenceIds: [],
      });
    });

    const snapshot = await result.current.buildSnapshot('  雨夜建筑  ', ['ref-1'], []);
    expect(snapshot).toEqual({
      prompt: '雨夜建筑',
      model: 'gpt-image-2',
      count: 2,
      aspectRatio: '3:2',
      resolution: '4k',
      isPublic: false,
      referenceIds: ['ref-1'],
    });
  });
});

describe('readReferenceIds', () => {
  it('trims, de-duplicates and caps reference ids', () => {
    const params = new URLSearchParams();
    [
      'a',
      ' a ',
      '',
      ...Array.from({ length: MAX_REFERENCE_IMAGES + 2 }, (_, i) => `r${i}`),
    ].forEach((id) => params.append('referenceId', id));

    const ids = readReferenceIds(params);
    expect(ids[0]).toBe('a');
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeLessThanOrEqual(MAX_REFERENCE_IMAGES);
  });
});
