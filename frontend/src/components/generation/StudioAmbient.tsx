import { thumbnailUrl } from '@/utils/thumbnail';

/**
 * Backdrop for the generate page: a soft colour wash, tinted by a heavily blurred copy of
 * the latest image, so the page is not flat black and the glass composer has colour to
 * refract. The small thumbnail is enough since the blur removes all detail.
 */
export function StudioAmbient({ imageUrl }: { imageUrl: string | undefined }) {
  return (
    <div className="studio-ambient" aria-hidden="true">
      {imageUrl === undefined ? null : (
        <img
          key={imageUrl}
          className="studio-ambient__image"
          src={thumbnailUrl(imageUrl, 320)}
          alt=""
          decoding="async"
        />
      )}
    </div>
  );
}
