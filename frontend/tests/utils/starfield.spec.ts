import { describe, expect, it } from 'vitest';

import {
  bufferScale,
  lensWithin,
  orbitCamera,
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

describe('orbitCamera', () => {
  const dot = (a: readonly number[], b: readonly number[]): number =>
    a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);

  it('faces the sky head on at rest, with x to the right and y down', () => {
    expect(orbitCamera(0, 0)).toEqual({ eye: [0, 0, 1], right: [1, 0, 0], down: [0, 1, 0] });
  });

  it('swings round the middle of the sky at a fixed distance', () => {
    const { eye } = orbitCamera(0.4, -0.25);

    expect(Math.hypot(...eye)).toBeCloseTo(1, 12);
    // To the right for a positive turn, and up for a negative lean.
    expect(eye[0]).toBeGreaterThan(0);
    expect(eye[1]).toBeLessThan(0);
    expect(eye[2]).toBeGreaterThan(0);
  });

  it('keeps its axes square to each other and to the line of sight', () => {
    const { eye, right, down } = orbitCamera(-0.37, 0.21);

    expect(Math.hypot(...right)).toBeCloseTo(1, 12);
    expect(Math.hypot(...down)).toBeCloseTo(1, 12);
    expect(dot(right, down)).toBeCloseTo(0, 12);
    expect(dot(right, eye)).toBeCloseTo(0, 12);
    expect(dot(down, eye)).toBeCloseTo(0, 12);
    // Still the right way up.
    expect(right[0]).toBeGreaterThan(0);
    expect(down[1]).toBeGreaterThan(0);
  });
});

describe('starfield shader', () => {
  it('declares every uniform the renderer sets', () => {
    for (const name of STARFIELD_UNIFORMS) {
      expect(STARFIELD_FRAGMENT_SHADER).toMatch(new RegExp(`uniform \\w+ ${name};`));
    }
  });
});
