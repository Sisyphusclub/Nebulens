import { useEffect, useState } from 'react';

import {
  DEFAULT_ASPECT_CHOICE,
  DEFAULT_COUNT,
  DEFAULT_IMAGE_QUALITY,
  DEFAULT_IMAGE_RESOLUTION,
  isAspectChoice,
  isImageResolution,
  MAX_COUNT,
  MAX_REFERENCE_IMAGES,
  MIN_COUNT,
  normalizeAspectChoiceForResolution,
  normalizeImageModel,
  normalizeImageQuality,
  supportsImageQuality,
  type AspectChoice,
  type GenerationSettingsSnapshot,
  type ImageModel,
  type ImageQuality,
  type ImageResolution,
} from '@/types/image';
import { resolveAspectChoice } from '@/utils/imageAspect';

export function readCount(searchParams: URLSearchParams): number {
  const value = Number(searchParams.get('count'));
  return Number.isInteger(value) && value >= MIN_COUNT && value <= MAX_COUNT
    ? value
    : DEFAULT_COUNT;
}

function readAspectChoice(searchParams: URLSearchParams): AspectChoice {
  const value = searchParams.get('aspect');
  return isAspectChoice(value) ? value : DEFAULT_ASPECT_CHOICE;
}

export function readResolution(searchParams: URLSearchParams): ImageResolution {
  const value = searchParams.get('resolution');
  return isImageResolution(value) ? value : DEFAULT_IMAGE_RESOLUTION;
}

function readQuality(searchParams: URLSearchParams): ImageQuality {
  return normalizeImageQuality(searchParams.get('quality'));
}

export function readReferenceIds(searchParams: URLSearchParams): string[] {
  return [
    ...new Set(
      searchParams
        .getAll('referenceId')
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, MAX_REFERENCE_IMAGES),
    ),
  ];
}

/**
 * Composer generation parameters (model, count, resolution, quality, aspect, visibility),
 * initialised from and kept in sync with the page's search params.
 */
export function useGenerationSettings(searchParams: URLSearchParams) {
  const [model, setModel] = useState<ImageModel>(() =>
    normalizeImageModel(searchParams.get('model')),
  );
  const [count, setCount] = useState(() => readCount(searchParams));
  const [resolution, setResolution] = useState<ImageResolution>(() => readResolution(searchParams));
  const [quality, setQuality] = useState<ImageQuality>(() => readQuality(searchParams));
  const [aspect, setAspect] = useState<AspectChoice>(() =>
    normalizeAspectChoiceForResolution(
      readAspectChoice(searchParams),
      readResolution(searchParams),
    ),
  );
  const [isPublic, setIsPublic] = useState(() => searchParams.get('isPublic') === 'true');

  useEffect(() => {
    setModel(normalizeImageModel(searchParams.get('model')));
    const queryResolution = readResolution(searchParams);
    setResolution(queryResolution);
    setQuality(readQuality(searchParams));
    setAspect(normalizeAspectChoiceForResolution(readAspectChoice(searchParams), queryResolution));
    setCount(readCount(searchParams));
    const queryPublic = searchParams.get('isPublic');
    if (queryPublic === 'true' || queryPublic === 'false') setIsPublic(queryPublic === 'true');
  }, [searchParams]);

  const updateResolution = (next: ImageResolution): void => {
    setResolution(next);
    setAspect((current) => normalizeAspectChoiceForResolution(current, next));
  };

  const applySnapshot = (settings: GenerationSettingsSnapshot): void => {
    setModel(normalizeImageModel(settings.model));
    setCount(settings.count);
    setResolution(settings.resolution);
    setQuality(settings.quality ?? DEFAULT_IMAGE_QUALITY);
    setAspect(normalizeAspectChoiceForResolution(settings.aspectRatio, settings.resolution));
    setIsPublic(settings.isPublic);
  };

  const buildSnapshot = async (
    prompt: string,
    referenceIds: string[],
    referenceFiles: readonly File[],
  ): Promise<GenerationSettingsSnapshot> => ({
    prompt: prompt.trim(),
    model,
    count,
    aspectRatio: await resolveAspectChoice(aspect, referenceFiles),
    resolution,
    ...(supportsImageQuality(model) ? { quality } : {}),
    isPublic,
    referenceIds,
  });

  return {
    model,
    setModel,
    count,
    setCount,
    resolution,
    updateResolution,
    quality,
    setQuality,
    aspect,
    setAspect,
    isPublic,
    setIsPublic,
    applySnapshot,
    buildSnapshot,
  };
}
