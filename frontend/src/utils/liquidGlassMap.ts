interface RefractionMapOptions {
  /** Corner radius of the glass, in CSS pixels. */
  radius: number;
  /** Width of the rim that bends light; at most the radius, so corners stay seamless. */
  bevel?: number;
  /** Share of the bend spent on a gentle whole-surface magnifying lens (0–1). */
  lens?: number;
}

/**
 * Displacement map for an SVG feDisplacementMap that makes a rounded rectangle
 * refract like thick glass: the rim bends what is behind it strongly toward the
 * centre (a convex bevel), and the whole surface magnifies a little. Red holds
 * the horizontal shift and green the vertical one, with 128 meaning no shift.
 */
export function buildRefractionMap(
  width: number,
  height: number,
  { radius, bevel = radius, lens = 0.25 }: RefractionMapOptions,
): Uint8ClampedArray<ArrayBuffer> {
  const map = new Uint8ClampedArray(width * height * 4);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const corner = Math.min(radius, halfWidth, halfHeight);
  const rim = Math.max(1, Math.min(bevel, corner));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = x + 0.5 - halfWidth;
      const py = y + 0.5 - halfHeight;
      // Signed distance to the rounded rectangle; depth is how far inside a pixel sits.
      const qx = Math.abs(px) - (halfWidth - corner);
      const qy = Math.abs(py) - (halfHeight - corner);
      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
      const depth = corner - outside - Math.min(Math.max(qx, qy), 0);

      // Outward normal of the nearest edge.
      let nx = 0;
      let ny = 0;
      if (qx > 0 && qy > 0) {
        nx = (qx / outside) * Math.sign(px);
        ny = (qy / outside) * Math.sign(py);
      } else if (qx > qy) {
        nx = Math.sign(px);
      } else {
        ny = Math.sign(py);
      }

      // A circular bevel profile: steep at the very edge, flat by the end of the rim.
      const u = Math.min(Math.max(1 - depth / rim, 0), 1);
      const bend = 1 - Math.sqrt(1 - u * u);
      const shiftX = -nx * bend * (1 - lens) - (px / halfWidth) * lens;
      const shiftY = -ny * bend * (1 - lens) - (py / halfHeight) * lens;

      const offset = (y * width + x) * 4;
      map[offset] = Math.round(128 + 127 * Math.max(-1, Math.min(1, shiftX)));
      map[offset + 1] = Math.round(128 + 127 * Math.max(-1, Math.min(1, shiftY)));
      map[offset + 2] = 128;
      map[offset + 3] = 255;
    }
  }
  return map;
}

/** The map as a PNG data URL for an SVG feImage. Needs a browser canvas. */
export function refractionMapDataUrl(
  width: number,
  height: number,
  options: RefractionMapOptions,
): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.putImageData(
    new ImageData(buildRefractionMap(width, height, options), width, height),
    0,
    0,
  );
  return canvas.toDataURL('image/png');
}
