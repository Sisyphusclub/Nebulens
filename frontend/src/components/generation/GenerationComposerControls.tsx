import { ChevronDown, Lock, SlidersHorizontal, Sparkles } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

import { ModelLogo } from '@/components/premium/agent-chat-input/model-logo';
import {
  AnimatedDropdown,
  AnimatedDropdownContent,
  AnimatedDropdownItemIcon,
  AnimatedDropdownItemText,
  AnimatedDropdownLabel,
  AnimatedDropdownRadioGroup,
  AnimatedDropdownRadioItem,
  AnimatedDropdownTrigger,
} from '@/components/premium/animated-dropdown';
import { Button } from '@/components/ui/button';
import { SelectMenu } from '@/components/ui/select-menu';
import {
  ASPECT_CHOICES,
  ASPECT_RATIO_CONFIGS,
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODEL_LABELS,
  IMAGE_MODELS,
  IMAGE_QUALITIES,
  IMAGE_QUALITY_LABELS,
  IMAGE_RESOLUTIONS,
  IMAGE_RESOLUTION_LABELS,
  MAX_COUNT,
  MIN_COUNT,
  type AspectChoice,
  type ImageModel,
  type ImageQuality,
  type ImageResolution,
  supportsImageQuality,
} from '@/types/image';

const MODEL_OPTIONS = IMAGE_MODELS.map((value) => ({ value, label: IMAGE_MODEL_LABELS[value] }));

function aspectFrameSize(aspect: Exclude<AspectChoice, 'auto'>): {
  width: number;
  height: number;
} {
  const ratio = ASPECT_RATIO_CONFIGS[aspect].ratio;
  const height = Math.min(21, 23 / ratio);
  return { width: height * ratio, height };
}

function keepCustomPanelOpen(event: Event): void {
  event.preventDefault();
}

/** Who may see the images a run makes; the values are what the radio group passes around. */
const VISIBILITY_OPTIONS = [
  { value: 'shared', label: '所有人', name: '所有人可见' },
  { value: 'private', label: '仅自己', name: '仅自己可见' },
] as const;

interface GenerationComposerControlsProps {
  model: ImageModel;
  aspect: AspectChoice;
  count: number;
  resolution: ImageResolution;
  quality: ImageQuality;
  /** New images are kept to their maker instead of shown to everyone. */
  isPrivate: boolean;
  disabled?: boolean;
  customPanelSide?: 'top' | 'bottom';
  /** A skill decides each image's ratio and count, so only the other settings are offered. */
  planned?: boolean;
  onModelChange: (model: ImageModel) => void;
  onAspectChange: (aspect: AspectChoice) => void;
  onCountChange: (count: number) => void;
  onResolutionChange: (resolution: ImageResolution) => void;
  onQualityChange: (quality: ImageQuality) => void;
  onPrivateChange: (isPrivate: boolean) => void;
}

export function GenerationComposerControls({
  model = DEFAULT_IMAGE_MODEL,
  aspect,
  count,
  resolution,
  quality,
  isPrivate,
  disabled = false,
  customPanelSide = 'bottom',
  planned = false,
  onModelChange,
  onAspectChange,
  onCountChange,
  onResolutionChange,
  onQualityChange,
  onPrivateChange,
}: GenerationComposerControlsProps) {
  const visibleAspect = aspect === 'auto' ? '智能' : aspect;
  const qualitySupported = supportsImageQuality(model);
  const parameterSummary = [
    ...(planned ? [] : [visibleAspect]),
    IMAGE_RESOLUTION_LABELS[resolution],
    ...(qualitySupported ? [IMAGE_QUALITY_LABELS[quality]] : []),
    ...(planned ? [] : [`${count}张`]),
  ].join(' · ');
  const visibility = isPrivate ? VISIBILITY_OPTIONS[1] : VISIBILITY_OPTIONS[0];
  // Sharpness, count and visibility share one row; a planned run has no count to choose.
  const compactColumns: CSSProperties & { '--compact-columns': number } = {
    '--compact-columns': planned ? 2 : 3,
  };

  return (
    <div className="generation-composer-controls" aria-label="生成设置">
      <SelectMenu
        label="选择模型"
        value={model}
        options={MODEL_OPTIONS}
        disabled={disabled}
        leadingIcon={<ModelLogo modelId={model} className="generation-model-select__icon" />}
        className="generation-model-select"
        contentClassName="generation-control-panel generation-model-menu"
        onValueChange={onModelChange}
      />

      <AnimatedDropdown modal={false}>
        <AnimatedDropdownTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="generation-custom-trigger"
            aria-label="自定义生成参数"
            data-private={isPrivate ? 'true' : undefined}
            disabled={disabled}
          >
            {/* The lock takes the sliders' place, so the toolbar keeps its width. */}
            {isPrivate ? <Lock aria-hidden="true" /> : <SlidersHorizontal aria-hidden="true" />}
            <span>自定义</span>
            <small>{parameterSummary}</small>
            {isPrivate ? (
              <span className="generation-custom-trigger__private sr-only">仅自己可见</span>
            ) : null}
            <ChevronDown aria-hidden="true" />
          </Button>
        </AnimatedDropdownTrigger>
        <AnimatedDropdownContent
          align="start"
          side={customPanelSide}
          avoidCollisions={false}
          className="generation-control-panel generation-custom-panel"
          aria-label="自定义生成参数"
        >
          <AnimatedDropdownLabel className="generation-custom-panel__header">
            <span className="generation-custom-panel__title">
              <SlidersHorizontal aria-hidden="true" />
              <strong>生成偏好</strong>
            </span>
            <output>{parameterSummary}</output>
          </AnimatedDropdownLabel>

          <div className="generation-custom-panel__body">
            {planned ? null : (
              <ParameterGroup
                label="选择比例"
                value={visibleAspect}
                className="generation-custom-group--aspect"
              >
                <AnimatedDropdownRadioGroup
                  value={aspect}
                  className="generation-custom-options generation-custom-options--aspect"
                  aria-label="画面比例"
                  onValueChange={(value) => onAspectChange(value as AspectChoice)}
                >
                  {ASPECT_CHOICES.map((value) => (
                    <AnimatedDropdownRadioItem
                      key={value}
                      value={value}
                      aria-label={value === 'auto' ? '智能' : value}
                      className="generation-custom-option generation-custom-option--aspect"
                      onSelect={keepCustomPanelOpen}
                    >
                      <AnimatedDropdownItemIcon
                        className="generation-custom-option__visual group-data-[highlighted]:translate-x-0"
                        data-aspect={value}
                      >
                        {value === 'auto' ? (
                          <Sparkles />
                        ) : (
                          <span
                            className="generation-custom-option__frame"
                            style={aspectFrameSize(value)}
                          />
                        )}
                      </AnimatedDropdownItemIcon>
                      <AnimatedDropdownItemText className="generation-custom-option__text group-data-[highlighted]:translate-x-0">
                        {value === 'auto' ? '智能' : value}
                      </AnimatedDropdownItemText>
                    </AnimatedDropdownRadioItem>
                  ))}
                </AnimatedDropdownRadioGroup>
              </ParameterGroup>
            )}

            <div className="generation-custom-panel__compact-groups" style={compactColumns}>
              {qualitySupported ? (
                <ParameterGroup
                  label="质量"
                  value={IMAGE_QUALITY_LABELS[quality]}
                  className="generation-custom-group--quality"
                >
                  <AnimatedDropdownRadioGroup
                    value={quality}
                    className="generation-custom-options generation-custom-options--compact generation-custom-options--quality"
                    aria-label="质量"
                    onValueChange={(value) => onQualityChange(value as ImageQuality)}
                  >
                    {IMAGE_QUALITIES.map((value) => (
                      <AnimatedDropdownRadioItem
                        key={value}
                        value={value}
                        className="generation-custom-option generation-custom-option--compact"
                        onSelect={keepCustomPanelOpen}
                      >
                        <AnimatedDropdownItemText className="generation-custom-option__text group-data-[highlighted]:translate-x-0">
                          {IMAGE_QUALITY_LABELS[value]}
                        </AnimatedDropdownItemText>
                      </AnimatedDropdownRadioItem>
                    ))}
                  </AnimatedDropdownRadioGroup>
                </ParameterGroup>
              ) : null}

              <ParameterGroup label="清晰度" value={IMAGE_RESOLUTION_LABELS[resolution]}>
                <AnimatedDropdownRadioGroup
                  value={resolution}
                  className="generation-custom-options generation-custom-options--compact"
                  aria-label="清晰度"
                  onValueChange={(value) => onResolutionChange(value as ImageResolution)}
                >
                  {IMAGE_RESOLUTIONS.map((value) => (
                    <AnimatedDropdownRadioItem
                      key={value}
                      value={value}
                      aria-label={IMAGE_RESOLUTION_LABELS[value]}
                      className="generation-custom-option generation-custom-option--compact"
                      onSelect={keepCustomPanelOpen}
                    >
                      <AnimatedDropdownItemText className="generation-custom-option__text group-data-[highlighted]:translate-x-0">
                        {IMAGE_RESOLUTION_LABELS[value]}
                      </AnimatedDropdownItemText>
                    </AnimatedDropdownRadioItem>
                  ))}
                </AnimatedDropdownRadioGroup>
              </ParameterGroup>

              {planned ? null : (
                <ParameterGroup label="生成张数" value={`${count} 张`}>
                  <AnimatedDropdownRadioGroup
                    value={String(count)}
                    className="generation-custom-options generation-custom-options--compact generation-custom-options--count"
                    aria-label="生成张数"
                    onValueChange={(value) => onCountChange(Number(value))}
                  >
                    {Array.from(
                      { length: MAX_COUNT - MIN_COUNT + 1 },
                      (_, index) => index + MIN_COUNT,
                    ).map((value) => (
                      <AnimatedDropdownRadioItem
                        key={value}
                        value={String(value)}
                        aria-label={`${value} 张`}
                        className="generation-custom-option generation-custom-option--compact"
                        onSelect={keepCustomPanelOpen}
                      >
                        <AnimatedDropdownItemText className="generation-custom-option__text group-data-[highlighted]:translate-x-0">
                          {value}
                        </AnimatedDropdownItemText>
                      </AnimatedDropdownRadioItem>
                    ))}
                  </AnimatedDropdownRadioGroup>
                </ParameterGroup>
              )}

              <ParameterGroup
                label="可见范围"
                value={visibility.label}
                className="generation-custom-group--visibility"
              >
                <AnimatedDropdownRadioGroup
                  value={visibility.value}
                  className="generation-custom-options generation-custom-options--compact generation-custom-options--visibility"
                  aria-label="可见范围"
                  onValueChange={(value) => onPrivateChange(value === 'private')}
                >
                  {VISIBILITY_OPTIONS.map((option) => (
                    <AnimatedDropdownRadioItem
                      key={option.value}
                      value={option.value}
                      aria-label={option.name}
                      className="generation-custom-option generation-custom-option--compact"
                      onSelect={keepCustomPanelOpen}
                    >
                      <AnimatedDropdownItemText className="generation-custom-option__text group-data-[highlighted]:translate-x-0">
                        {option.label}
                      </AnimatedDropdownItemText>
                    </AnimatedDropdownRadioItem>
                  ))}
                </AnimatedDropdownRadioGroup>
              </ParameterGroup>
            </div>
          </div>
        </AnimatedDropdownContent>
      </AnimatedDropdown>

      {planned ? null : (
        <output className="sr-only" aria-label={`${count} 张`}>
          {count}
        </output>
      )}
    </div>
  );
}

function ParameterGroup({
  label,
  value,
  className,
  children,
}: {
  label: string;
  value: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`generation-custom-group${className ? ` ${className}` : ''}`}>
      <header className="generation-custom-group__header">
        <span className="generation-custom-group__label">{label}</span>
        <output>{value}</output>
      </header>
      {children}
    </section>
  );
}
