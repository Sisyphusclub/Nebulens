import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Only Chromium renders SVG filters inside backdrop-filter; it is also the only
 * engine with navigator.userAgentData, so other browsers keep plain frosted glass.
 */
const SUPPORTS_BACKDROP_REFRACTION =
  typeof navigator !== 'undefined' && 'userAgentData' in navigator;

/**
 * Liquid glass around a generation composer: the frame draws the evenly lit rim
 * and halo, and owns the refraction filter the composer's backdrop references.
 * Render one per page, since the filter id is fixed for the stylesheet.
 */
export function LiquidGlassFrame({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn('liquid-glass-frame', className)}
      data-refraction={SUPPORTS_BACKDROP_REFRACTION ? 'true' : undefined}
    >
      <svg className="liquid-glass-frame__filter" aria-hidden="true" focusable="false">
        <filter id="liquid-glass-refraction" colorInterpolationFilters="sRGB">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.006 0.012"
            numOctaves={2}
            seed={7}
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale={16}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>
      {children}
    </div>
  );
}
