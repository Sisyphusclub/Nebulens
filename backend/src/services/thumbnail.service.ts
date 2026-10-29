import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { readOutput } from '../storage/localStorage.js';

/**
 * Widths the card grids ask for: 320 for small thumbnails, 640 for grid cards
 * (about 300px wide on a 2x screen). A fixed set keeps the cache from growing
 * one file per arbitrary width.
 */
export const THUMBNAIL_WIDTHS = [320, 640] as const;
export type ThumbnailWidth = (typeof THUMBNAIL_WIDTHS)[number];

const WEBP_QUALITY = 78;

export function isThumbnailWidth(value: number): value is ThumbnailWidth {
  return (THUMBNAIL_WIDTHS as readonly number[]).includes(value);
}

/** Cached thumbnails live beside the outputs, in a folder the orphan report skips. */
function thumbnailRoot(): string {
  return path.resolve(env.OUTPUT_DIR, 'thumbnails');
}

export function thumbnailPath(filename: string, width: ThumbnailWidth): string {
  return path.join(thumbnailRoot(), `${path.parse(filename).name}-w${width}.webp`);
}

/** Renders in progress, so concurrent requests for one thumbnail share the work. */
const pending = new Map<string, Promise<Buffer>>();

async function render(filename: string, width: ThumbnailWidth, target: string): Promise<Buffer> {
  let original: Buffer;
  try {
    original = await readOutput(filename);
  } catch (err) {
    throw new AppError('NOT_FOUND', `Output not found: ${filename}`, 404, err, { filename });
  }
  const thumbnail = await sharp(original)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  await mkdir(path.dirname(target), { recursive: true });
  // Write then rename, so a concurrent reader never sees a half-written file.
  const partial = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(partial, thumbnail);
  await rename(partial, target);
  return thumbnail;
}

/** A WebP thumbnail of an output at `width`, rendered once and then read from disk. */
export async function getThumbnail(filename: string, width: ThumbnailWidth): Promise<Buffer> {
  const target = thumbnailPath(filename, width);
  try {
    return await readFile(target);
  } catch {
    // Not cached yet.
  }
  const inFlight = pending.get(target);
  if (inFlight) return inFlight;
  const job = render(filename, width, target).finally(() => pending.delete(target));
  pending.set(target, job);
  return job;
}

/** Drops an output's cached thumbnails, so deleting an image leaves nothing behind. */
export async function removeThumbnails(filename: string): Promise<void> {
  await Promise.all(
    THUMBNAIL_WIDTHS.map((width) => rm(thumbnailPath(filename, width), { force: true })),
  );
}
