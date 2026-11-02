import { describe, expect, it } from 'vitest';

import { buildRefractionMap } from '@/utils/liquidGlassMap';

const WIDTH = 600;
const HEIGHT = 140;

function pixel(map: Uint8ClampedArray, x: number, y: number) {
  const offset = (y * WIDTH + x) * 4;
  return {
    r: map[offset] ?? 0,
    g: map[offset + 1] ?? 0,
    b: map[offset + 2] ?? 0,
    a: map[offset + 3] ?? 0,
  };
}

describe('buildRefractionMap', () => {
  const map = buildRefractionMap(WIDTH, HEIGHT, { radius: 28 });
  const midY = HEIGHT / 2;
  const midX = WIDTH / 2;

  it('covers every pixel with an opaque displacement value', () => {
    expect(map).toHaveLength(WIDTH * HEIGHT * 4);
    expect(pixel(map, 10, 10).a).toBe(255);
    expect(pixel(map, 10, 10).b).toBe(128);
  });

  it('leaves the centre of the glass undistorted', () => {
    const centre = pixel(map, midX, midY);
    expect(Math.abs(centre.r - 128)).toBeLessThanOrEqual(1);
    expect(Math.abs(centre.g - 128)).toBeLessThanOrEqual(1);
  });

  it('bends light strongly at the rim, sampling from inside the glass', () => {
    // Left and right edges shift horizontally toward the centre.
    expect(pixel(map, 0, midY).r).toBeGreaterThan(220);
    expect(pixel(map, WIDTH - 1, midY).r).toBeLessThan(36);
    expect(Math.abs(pixel(map, 0, midY).g - 128)).toBeLessThanOrEqual(2);
    // Top and bottom edges shift vertically toward the centre.
    expect(pixel(map, midX, 0).g).toBeGreaterThan(220);
    expect(pixel(map, midX, HEIGHT - 1).g).toBeLessThan(36);
  });

  it('fades the rim bend out inside the bevel, leaving only a gentle lens', () => {
    const insideBevel = pixel(map, 40, midY).r - 128;
    const atRim = pixel(map, 0, midY).r - 128;
    expect(insideBevel).toBeGreaterThan(0);
    expect(insideBevel).toBeLessThan(atRim / 3);
  });
});
