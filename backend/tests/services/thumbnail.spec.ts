import { stat } from 'node:fs/promises';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import type { AppError } from '../../src/errors/AppError.js';
import {
  getThumbnail,
  isThumbnailWidth,
  removeThumbnails,
  thumbnailPath,
} from '../../src/services/thumbnail.service.js';
import { saveOutput } from '../../src/storage/localStorage.js';

async function savePng(width: number, height: number): Promise<string> {
  const png = await sharp({
    create: { width, height, channels: 3, background: { r: 180, g: 40, b: 30 } },
  })
    .png()
    .toBuffer();
  return (await saveOutput(png, 'png')).filename;
}

describe('thumbnails', () => {
  it('accepts only the widths the card grids use', () => {
    expect(isThumbnailWidth(320)).toBe(true);
    expect(isThumbnailWidth(640)).toBe(true);
    expect(isThumbnailWidth(500)).toBe(false);
  });

  it('renders a small WebP of the requested width and keeps the aspect ratio', async () => {
    const filename = await savePng(1024, 1536);

    const thumbnail = await getThumbnail(filename, 640);
    const meta = await sharp(thumbnail).metadata();

    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(960);
  });

  it('never enlarges an image smaller than the requested width', async () => {
    const filename = await savePng(200, 100);

    const meta = await sharp(await getThumbnail(filename, 640)).metadata();

    expect(meta.width).toBe(200);
  });

  it('caches each thumbnail on disk and reuses it', async () => {
    const filename = await savePng(800, 800);

    await getThumbnail(filename, 320);
    const first = await stat(thumbnailPath(filename, 320));
    await getThumbnail(filename, 320);
    const second = await stat(thumbnailPath(filename, 320));

    expect(second.mtimeMs).toBe(first.mtimeMs);
  });

  it('removes cached thumbnails with their output', async () => {
    const filename = await savePng(800, 800);
    await getThumbnail(filename, 320);

    await removeThumbnails(filename);

    await expect(stat(thumbnailPath(filename, 320))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('reports a missing output as not found', async () => {
    await expect(
      getThumbnail('00000000-0000-4000-8000-000000000000.png', 320),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 } satisfies Partial<AppError>);
  });
});
