import { Gauge } from 'lucide-react';

import { GenerationComposerControls } from '@/components/generation/GenerationComposerControls';
import { Button } from '@/components/ui/button';
import type { AspectChoice, ImageModel, ImageQuality, ImageResolution } from '@/types/image';

interface LandingGenerationControlsProps {
  model: ImageModel;
  aspect: AspectChoice;
  count: number;
  resolution: ImageResolution;
  quality: ImageQuality;
  disabled?: boolean;
  /** A skill decides each image's ratio and count. */
  planned?: boolean;
  quotaLabel: string;
  quotaAriaLabel: string;
  quotaIsAction: boolean;
  onModelChange: (model: ImageModel) => void;
  onAspectChange: (aspect: AspectChoice) => void;
  onCountChange: (count: number) => void;
  onResolutionChange: (resolution: ImageResolution) => void;
  onQualityChange: (quality: ImageQuality) => void;
  onQuotaClick: () => void;
}

export function LandingGenerationControls({
  model,
  aspect,
  count,
  resolution,
  quality,
  disabled,
  planned = false,
  quotaLabel,
  quotaAriaLabel,
  quotaIsAction,
  onModelChange,
  onAspectChange,
  onCountChange,
  onResolutionChange,
  onQualityChange,
  onQuotaClick,
}: LandingGenerationControlsProps) {
  const quotaContent = (
    <>
      <Gauge aria-hidden="true" />
      <span>{quotaLabel}</span>
    </>
  );

  return (
    <GenerationComposerControls
      model={model}
      aspect={aspect}
      count={count}
      resolution={resolution}
      quality={quality}
      disabled={disabled ?? false}
      planned={planned}
      onModelChange={onModelChange}
      onAspectChange={onAspectChange}
      onCountChange={onCountChange}
      onResolutionChange={onResolutionChange}
      onQualityChange={onQualityChange}
      trailingContent={
        quotaIsAction ? (
          <Button
            type="button"
            variant="ghost"
            className="landing-quota"
            aria-label={quotaAriaLabel}
            onClick={onQuotaClick}
          >
            {quotaContent}
          </Button>
        ) : (
          <span className="landing-quota" role="status" aria-label={quotaAriaLabel}>
            {quotaContent}
          </span>
        )
      }
    />
  );
}
