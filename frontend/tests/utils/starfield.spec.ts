import { describe, expect, it } from 'vitest';

import {
  bufferScale,
  lensWithin,
  STARFIELD_FRAGMENT_SHADER,
  STARFIELD_UNIFORMS,
} from '@/utils/starfield';

describe('lensWithin', () => {
  it('places the lens by its centre, measured from the canvas rather than the window', () => {
    // The page is scrolled 120px and the canvas starts after a 280px sidebar.
    const canvas = { left: 280, top: -120, width: 1160, height: 640 };
    const composer = { left: 300, top: 160, width: 1120, height: 210 };

    expect(lensWithin(canvas, composer, 20)).toEqual({
      x: 580,
      y: 385,
      halfWidth: 560,
      halfHeight: 105,
      radius: 20,
    });
  });

  it('has no lens until the composer has a size', () => {
    const canvas = { left: 0, top: 0, width: 1160, height: 640 };

    expect(lensWithin(canvas, { left: 0, top: 0, width: 0, height: 0 }, 20)).toBeNull();
    expect(lensWithin(canvas, null, 20)).toBeNull();
  });

  it('never rounds a corner past half of the box', () => {
    const canvas = { left: 0, top: 0, width: 400, height: 600 };

    expect(lensWithin(canvas, { left: 20, top: 100, width: 360, height: 48 }, 40)?.radius).toBe(24);
  });
});

describe('bufferScale', () => {
  it('draws at the screen density on an ordinary retina window', () => {
    expect(bufferScale(1160, 640, 2)).toBe(2);
    expect(bufferScale(1600, 660, 1)).toBe(1);
  });

  it('never draws more than two device pixels per pixel', () => {
    expect(bufferScale(390, 560, 3)).toBe(2);
  });

  it('gives up sharpness before it gives up frame rate on a very wide retina window', () => {
    const scale = bufferScale(2280, 700, 2);

    expect(scale).toBeLessThan(2);
    expect(2280 * 700 * scale * scale).toBeLessThanOrEqual(4_000_000);
  });

  it('draws softer still when asked for less than full quality', () => {
    expect(bufferScale(1160, 640, 2, 0.75)).toBe(1.5);
    expect(bufferScale(1600, 660, 1, 0.5)).toBe(0.5);
  });
});

describe('starfield shader', () => {
  it('declares every uniform the renderer sets', () => {
    for (const name of STARFIELD_UNIFORMS) {
      expect(STARFIELD_FRAGMENT_SHADER).toMatch(new RegExp(`uniform \\w+ ${name};`));
    }
  });
});
