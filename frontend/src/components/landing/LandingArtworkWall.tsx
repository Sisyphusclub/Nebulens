import { useEffect, useRef, useState } from 'react';

const ARTWORKS = [
  'amalfi-poster',
  'avant-garde-organic-high-fashion',
  'blade-runner-neo-noir-orange',
  'brutalist-concrete-museum-atrium',
  'color-neo-traditional-fox-flora',
  'cyberpunk-mecha',
  'dark-surrealist-moth-cathedral',
  'dual-exposure-poster',
  'editorial-studio-portrait',
  'ghibli-cottage',
  'gothic-cathedral-interior-render',
  'haute-couture-sculptural-runway',
  'impasto-floral-swirls',
  'impressionist-river-dusk',
  'ink-landscape',
  'japanese-traditional-dragon-koi',
  'miyazaki-floating-island-garden',
  'neon-orchid-district-board',
  'photoreal-subway',
  'pulp-scifi-cover',
  'rainy-botanical-greenhouse',
  'rothko-color-field-meditation',
  'saul-bass-poster',
  'tarkovsky-misty-dacha-morning',
  'villeneuve-monolithic-desert',
  'vogue-cover',
  'watercolor-lily-pond',
  'streetwear-tokyo-lookbook',
  'anime-open-world',
  'epic-silhouette-poster',
].map((name) => `/media/hero-wall/${name}.jpg`);

const COLUMN_COUNT = 8;
const TILES_PER_COLUMN = 8;
// Offset each column through the shared list so neighbours never start on the same artwork.
const COLUMNS = Array.from({ length: COLUMN_COUNT }, (_, column) =>
  Array.from(
    { length: TILES_PER_COLUMN },
    (_, row) => ARTWORKS[(column * 7 + row * 3) % ARTWORKS.length],
  ),
);

/**
 * Hero background: a tilted wall of sample artworks drifting in alternating columns.
 * Each column only animates transform, and the whole wall pauses off screen.
 */
export function LandingArtworkWall() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver !== 'function') return undefined;
    const observer = new IntersectionObserver(([entry]) =>
      setInView(entry?.isIntersecting ?? true),
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={rootRef}
      className="artwork-wall"
      data-paused={inView ? undefined : 'true'}
      aria-hidden="true"
    >
      <div className="artwork-wall__plane">
        {COLUMNS.map((images, column) => (
          <div key={column} className="artwork-wall__column" data-column={column}>
            <div className="artwork-wall__track">
              {/* The list is doubled so the -50% loop restarts on an identical frame. */}
              {[...images, ...images].map((src, index) => (
                <img
                  key={`${src}-${index}`}
                  className="artwork-wall__tile"
                  src={src}
                  alt=""
                  decoding="async"
                  loading={index < images.length ? 'eager' : 'lazy'}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="artwork-wall__scrim" />
    </div>
  );
}
