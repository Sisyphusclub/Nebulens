import { cn } from '@/lib/utils';
import {
  ASPECT_RATIO_CONFIGS,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_IMAGE_RESOLUTION,
  IMAGE_RESOLUTION_LABELS,
  type AspectRatio,
  type ImageResolution,
} from '@/types/image';

import './ImageGenerationPlaceholder.css';

type ImageGenerationOrientation = 'landscape' | 'portrait' | 'square';

interface ImageGenerationPlaceholderProps {
  aspectRatio?: AspectRatio;
  className?: string;
  fill?: boolean;
  resolution?: ImageResolution;
}

function getOrientation(aspectRatio: AspectRatio): ImageGenerationOrientation {
  const ratio = ASPECT_RATIO_CONFIGS[aspectRatio].ratio;
  if (ratio === 1) return 'square';
  return ratio > 1 ? 'landscape' : 'portrait';
}

function toCssAspectRatio(aspectRatio: AspectRatio): string {
  return aspectRatio.replace(':', ' / ');
}

export function ImageGenerationPlaceholder({
  aspectRatio = DEFAULT_ASPECT_RATIO,
  className,
  fill = false,
  resolution = DEFAULT_IMAGE_RESOLUTION,
}: ImageGenerationPlaceholderProps) {
  return (
    <div
      className={cn('generation-skeleton__card', 'image-generation', className)}
      data-orientation={getOrientation(aspectRatio)}
      style={fill ? undefined : { aspectRatio: toCssAspectRatio(aspectRatio) }}
      aria-hidden="true"
    >
      <span className="image-generation__dots" aria-hidden="true" />
      <span className="image-generation__glow" aria-hidden="true" />
      <span className="image-generation__resolution">
        {aspectRatio} · {IMAGE_RESOLUTION_LABELS[resolution]}
      </span>
      <span className="image-generation__status">
        <span className="image-generation__label">正在生成图片</span>
      </span>
    </div>
  );
}
