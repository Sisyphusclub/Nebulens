import { afterEach, describe, expect, it, vi } from 'vitest';

import { closestAspectRatio, resolveAspectChoice } from '@/utils/imageAspect';

describe('imageAspect', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [3000, 1000, '3:1'],
    [2560, 1080, '21:9'],
    [2000, 1000, '2:1'],
    [1024, 1024, '1:1'],
    [800, 1000, '4:5'],
    [750, 1000, '3:4'],
    [1200, 900, '4:3'],
    [1280, 1024, '5:4'],
    [1600, 1000, '16:10'],
    [1920, 1080, '16:9'],
    [1080, 1920, '9:16'],
    [1000, 1600, '10:16'],
    [900, 1950, '9:19.5'],
    [1000, 2000, '1:2'],
    [1000, 3000, '1:3'],
    [800, 1200, '2:3'],
    [1500, 1000, '3:2'],
  ] as const)('maps %sx%s to %s', (width, height, expected) => {
    expect(closestAspectRatio(width, height)).toBe(expected);
  });

  it('falls back to 1:1 without a readable reference image', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('unreadable')));

    await expect(resolveAspectChoice('auto', [new File(['invalid'], 'invalid.png')])).resolves.toBe(
      '1:1',
    );
    await expect(resolveAspectChoice('auto')).resolves.toBe('1:1');
  });

  it('uses the first readable reference image in upload order', async () => {
    const createBitmap = vi
      .fn()
      .mockRejectedValueOnce(new Error('unreadable'))
      .mockResolvedValueOnce({ width: 750, height: 1000, close: vi.fn() });
    vi.stubGlobal('createImageBitmap', createBitmap);

    await expect(
      resolveAspectChoice('auto', [
        new File(['invalid'], 'invalid.png'),
        new File(['image'], 'image.png'),
      ]),
    ).resolves.toBe('3:4');
    expect(createBitmap).toHaveBeenCalledTimes(2);
  });

  it('keeps an explicit aspect ratio without inspecting the reference', async () => {
    const createBitmap = vi.fn();
    vi.stubGlobal('createImageBitmap', createBitmap);

    await expect(resolveAspectChoice('3:2', [new File(['image'], 'image.png')])).resolves.toBe(
      '3:2',
    );
    expect(createBitmap).not.toHaveBeenCalled();
  });
});
