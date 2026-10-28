import { useState } from 'react';

import { ImageGenerationPlaceholder } from '@/components/generation/ImageGenerationPlaceholder';
import { MorphicCard } from '@/components/premium/morphic-card-modal';
import { Button } from '@/components/ui/button';
import { DEFAULT_ASPECT_RATIO, DEFAULT_IMAGE_RESOLUTION, type HistoryEntry } from '@/types/image';

interface SessionResultPreviewProps {
  entry: HistoryEntry;
  onOpen: () => void;
}

export function SessionResultPreview({ entry, onOpen }: SessionResultPreviewProps) {
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <MorphicCard id={entry.record.id} className="session-result__morph">
      <Button
        type="button"
        variant="ghost"
        className={`session-result__preview${imageLoaded ? ' is-loaded' : ''}`}
        style={{
          aspectRatio: `${entry.record.width} / ${entry.record.height}`,
        }}
        aria-label={`查看图片：${entry.record.prompt}`}
        onClick={onOpen}
      >
        <ImageGenerationPlaceholder
          aspectRatio={entry.record.aspectRatio ?? DEFAULT_ASPECT_RATIO}
          resolution={entry.record.resolution ?? DEFAULT_IMAGE_RESOLUTION}
          className="session-result__loading"
          fill
        />
        <img src={entry.imageUrl} alt={entry.record.prompt} onLoad={() => setImageLoaded(true)} />
      </Button>
    </MorphicCard>
  );
}
