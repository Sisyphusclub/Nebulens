import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

import { cn } from '@/lib/utils';
import { refractionMapDataUrl } from '@/utils/liquidGlassMap';

/**
 * Only Chromium renders SVG filters inside backdrop-filter; it is also the only
 * engine with navigator.userAgentData, so other browsers keep plain frosted glass.
 */
const SUPPORTS_BACKDROP_REFRACTION =
  typeof navigator !== 'undefined' && 'userAgentData' in navigator;

/** Matches the composer's 28px corner radius in base.css. */
const GLASS_RADIUS = 28;
/** Largest shift, in pixels, is half this value: strong enough to read as thick glass. */
const REFRACTION_SCALE = 80;

interface RefractionMap {
  url: string;
  width: number;
  height: number;
}

/** A displacement map sized to the frame, regenerated whenever the composer resizes. */
function useRefractionMap(frame: RefObject<HTMLDivElement | null>): RefractionMap | null {
  const [map, setMap] = useState<RefractionMap | null>(null);

  useEffect(() => {
    const element = frame.current;
    if (!SUPPORTS_BACKDROP_REFRACTION || !element || typeof ResizeObserver !== 'function') {
      return undefined;
    }
    let pending = 0;
    let size = '';
    const render = () => {
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      if (width === 0 || height === 0 || `${width}x${height}` === size) return;
      const url = refractionMapDataUrl(width, height, { radius: GLASS_RADIUS });
      if (url === null) return;
      size = `${width}x${height}`;
      setMap({ url, width, height });
    };
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(render);
    });
    observer.observe(element);
    // Measure right away too, so the glass refracts from the first paint.
    render();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(pending);
    };
  }, [frame]);

  return map;
}

/**
 * Liquid glass around a generation composer: the frame draws the glass edge
 * and owns the refraction filter the composer's backdrop references, which
 * bends what is behind the glass like a thick glass rim.
 * Render one per page, since the filter id is fixed for the stylesheet.
 */
export function LiquidGlassFrame({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const map = useRefractionMap(frameRef);

  return (
    <div
      ref={frameRef}
      className={cn('liquid-glass-frame', className)}
      data-refraction={map ? 'true' : undefined}
    >
      {map ? (
        <svg className="liquid-glass-frame__filter" aria-hidden="true" focusable="false">
          <filter
            id="liquid-glass-refraction"
            x="0"
            y="0"
            width={map.width}
            height={map.height}
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feImage
              href={map.url}
              x="0"
              y="0"
              width={map.width}
              height={map.height}
              preserveAspectRatio="none"
              result="refraction-map"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="refraction-map"
              scale={REFRACTION_SCALE}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </svg>
      ) : null}
      {children}
    </div>
  );
}
