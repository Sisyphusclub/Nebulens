import { describe, expect, it } from 'vitest';

import {
  ASPECT_RATIOS,
  ASPECT_RATIO_CONFIGS,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_SIDE,
  MIN_IMAGE_PIXELS,
  getSizeByRatio,
  normalizeSize,
  snapTo16,
} from '../../src/types/image.js';

describe('GPT-Image-2.5 image sizes', () => {
  it('provides the original ratios plus four extended presets within physical limits', () => {
    expect(ASPECT_RATIOS).toHaveLength(11);

    for (const ratio of ASPECT_RATIOS) {
      const config = ASPECT_RATIO_CONFIGS[ratio];
      expect(config.key).toBe(ratio);

      for (const tier of ['standard', 'high_res'] as const) {
        const sizeStr = getSizeByRatio(ratio, tier);
        const [width, height] = sizeStr.split('x').map(Number) as [number, number];
        expect(width % 16).toBe(0);
        expect(height % 16).toBe(0);
        expect(width).toBeLessThanOrEqual(MAX_IMAGE_SIDE);
        expect(height).toBeLessThanOrEqual(MAX_IMAGE_SIDE);
        expect(width * height).toBeGreaterThanOrEqual(MIN_IMAGE_PIXELS);
        expect(width * height).toBeLessThanOrEqual(MAX_IMAGE_PIXELS);
        expect(width / height).toBeGreaterThanOrEqual(1 / 3);
        expect(width / height).toBeLessThanOrEqual(3);
      }
    }
  });

  it('snaps arbitrary dimensions to the nearest multiple of 16', () => {
    expect(snapTo16(1080)).toBe(1088);
    expect(snapTo16(1081)).toBe(1088);
    expect(normalizeSize(1919.5, 1081)).toEqual({
      width: 1920,
      height: 1088,
      sizeStr: '1920x1088',
    });
  });

  it('rejects invalid ratios, side lengths, pixel counts, and unknown presets', () => {
    expect(() => normalizeSize(1024, 3088)).toThrow(/ratio/);
    expect(() => normalizeSize(3856, 1920)).toThrow(/3840/);
    expect(() => normalizeSize(256, 256)).toThrow(/pixel count/);
    expect(() => normalizeSize(3840, 3840)).toThrow(/pixel count/);
    expect(() => getSizeByRatio('7:5')).toThrow(/Unsupported aspect ratio/);
    expect(() => getSizeByRatio('1:1', 'ultra' as never)).toThrow(/size tier/);
  });

  it('returns the requested API size strings', () => {
    expect(getSizeByRatio('1:1')).toBe('1024x1024');
    expect(getSizeByRatio('16:9')).toBe('1792x1024');
    expect(getSizeByRatio('3:1')).toBe('2304x768');
    expect(getSizeByRatio('5:4', 'high_res')).toBe('2000x1600');
    expect(getSizeByRatio('1:3', 'high_res')).toBe('1280x3840');
  });
});
