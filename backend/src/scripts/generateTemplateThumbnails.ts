/**
 * Builds card-sized WebP copies of the creation template images, so the template
 * grid downloads a fraction of the originals. Each image `<dir>/<name>.<ext>` gets
 * `<dir>/thumbs/<name>.webp`; up-to-date thumbnails are skipped, so re-running after
 * adding templates only renders the new ones.
 *
 *   npm run templates:thumbnails -- ../frontend/public/media/templates
 */
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

/** Template cards are up to about 420px wide, so 640 stays sharp on 1.5x screens. */
const THUMBNAIL_WIDTH = 640;
const WEBP_QUALITY = 76;
const IMAGE_RE = /\.(?:webp|jpe?g|png)$/i;

async function isFresh(source: string, target: string): Promise<boolean> {
  try {
    return (await stat(target)).mtimeMs >= (await stat(source)).mtimeMs;
  } catch {
    return false;
  }
}

async function thumbnailFolder(dir: string): Promise<{ rendered: number; skipped: number }> {
  const entries = await readdir(dir, { withFileTypes: true });
  let rendered = 0;
  let skipped = 0;
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== 'thumbs') {
      const nested = await thumbnailFolder(path.join(dir, entry.name));
      rendered += nested.rendered;
      skipped += nested.skipped;
      continue;
    }
    if (!entry.isFile() || !IMAGE_RE.test(entry.name)) continue;
    const source = path.join(dir, entry.name);
    const target = path.join(dir, 'thumbs', `${path.parse(entry.name).name}.webp`);
    if (await isFresh(source, target)) {
      skipped += 1;
      continue;
    }
    await mkdir(path.dirname(target), { recursive: true });
    await sharp(source)
      .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toFile(target);
    rendered += 1;
  }
  return { rendered, skipped };
}

const root = process.argv[2];
if (root === undefined) {
  process.stderr.write('Usage: generateTemplateThumbnails <templates folder>\n');
  process.exit(1);
}
const result = await thumbnailFolder(path.resolve(root));
process.stdout.write(`${JSON.stringify({ root: path.resolve(root), ...result })}\n`);
