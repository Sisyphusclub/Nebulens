/** 320 for small thumbnails, 640 for grid cards (about 300px wide on a 2x screen). */
export type ThumbnailWidth = 320 | 640;

/**
 * A card-sized WebP copy of a generated image, so grids do not download multi-megabyte
 * originals. Only images served by the outputs API can be resized; local previews and
 * static media come back unchanged.
 */
export function thumbnailUrl(imageUrl: string, width: ThumbnailWidth): string {
  if (!imageUrl.includes('/api/outputs/')) return imageUrl;
  return `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}w=${width}`;
}
