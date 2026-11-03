export const ASPECT_RATIOS = [
  '1:1',
  '3:4',
  '4:3',
  '16:9',
  '9:16',
  '2:3',
  '3:2',
  '1:3',
  '3:1',
  '4:5',
  '5:4',
] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const IMAGE_RESOLUTIONS = ['standard', '2k', '4k'] as const;
export type ImageResolution = (typeof IMAGE_RESOLUTIONS)[number];
export const HIGH_RES_IMAGE_RESOLUTIONS = ['2k', '4k'] as const;
export type HighImageResolution = (typeof HIGH_RES_IMAGE_RESOLUTIONS)[number];

export const IMAGE_QUALITIES = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];
export const QUALITY_CAPABLE_IMAGE_MODELS = [
  'gpt-image-2.5-flare',
  'gpt-image-2.5-sunburst',
] as const;

export const DEFAULT_ASPECT_RATIO: AspectRatio = '1:1';
export const DEFAULT_IMAGE_RESOLUTION: ImageResolution = 'standard';
export const GEMINI_IMAGE_MODEL = 'gemini-3-pro-image';
export const STANDARD_IMAGE_GENERATION_CREDIT_COST = 1;
export const HIGH_RES_IMAGE_GENERATION_CREDIT_COST = 3;
export const SUNBURST_HIGH_RES_IMAGE_GENERATION_CREDIT_COST = 4;
export const GEMINI_IMAGE_GENERATION_CREDIT_COST = 4;
export const DEFAULT_COUNT = 1;
export const MIN_COUNT = 1;
export const MAX_COUNT = 4;
export const MAX_REFERENCE_IMAGES = 14;

export interface AspectSize {
  size: string;
  width: number;
  height: number;
}

export type ImageSizeTier = 'standard' | 'high_res' | '4k';

export interface AspectRatioConfig {
  key: AspectRatio;
  label: string;
  ratio: number;
  standard_size: string;
  high_res_size: string;
  four_k_size: string;
}

export const MIN_IMAGE_DIMENSION_RATIO = 1 / 3;
export const MAX_IMAGE_DIMENSION_RATIO = 3;
export const MAX_IMAGE_SIDE = 4096;
export const MIN_IMAGE_PIXELS = 655_360;
export const MAX_IMAGE_PIXELS = 16_777_216;

export const ASPECT_RATIO_CONFIGS: Record<AspectRatio, AspectRatioConfig> = {
  '1:1': {
    key: '1:1',
    label: '1:1（正方形）',
    ratio: 1,
    standard_size: '1024x1024',
    high_res_size: '2048x2048',
    four_k_size: '4096x4096',
  },
  '3:4': {
    key: '3:4',
    label: '3:4（竖向）',
    ratio: 0.75,
    standard_size: '1024x1360',
    high_res_size: '1536x2048',
    four_k_size: '3072x4096',
  },
  '4:3': {
    key: '4:3',
    label: '4:3（横向）',
    ratio: 4 / 3,
    standard_size: '1360x1024',
    high_res_size: '2048x1536',
    four_k_size: '4096x3072',
  },
  '16:9': {
    key: '16:9',
    label: '16:9（宽屏）',
    ratio: 16 / 9,
    standard_size: '1792x1024',
    high_res_size: '2048x1152',
    four_k_size: '4096x2304',
  },
  '9:16': {
    key: '9:16',
    label: '9:16（竖屏）',
    ratio: 9 / 16,
    standard_size: '1024x1792',
    high_res_size: '1152x2048',
    four_k_size: '2304x4096',
  },
  '2:3': {
    key: '2:3',
    label: '2:3（纵向）',
    ratio: 2 / 3,
    standard_size: '1024x1536',
    high_res_size: '1360x2048',
    four_k_size: '2736x4096',
  },
  '3:2': {
    key: '3:2',
    label: '3:2（横向）',
    ratio: 3 / 2,
    standard_size: '1536x1024',
    high_res_size: '2048x1360',
    four_k_size: '4096x2736',
  },
  '1:3': {
    key: '1:3',
    label: '极限长图 / 1:3',
    ratio: 1 / 3,
    standard_size: '1024x3072',
    high_res_size: '1280x3840',
    four_k_size: '1376x4096',
  },
  '3:1': {
    key: '3:1',
    label: '极限超宽 / 3:1',
    ratio: 3,
    standard_size: '2304x768',
    high_res_size: '3072x1024',
    four_k_size: '4096x1376',
  },
  '4:5': {
    key: '4:5',
    label: '4:5（社交媒体竖图）',
    ratio: 0.8,
    standard_size: '1024x1280',
    high_res_size: '1600x2000',
    four_k_size: '3280x4096',
  },
  '5:4': {
    key: '5:4',
    label: '5:4（印刷横幅）',
    ratio: 1.25,
    standard_size: '1280x1024',
    high_res_size: '2000x1600',
    four_k_size: '4096x3280',
  },
};

export function snapTo16(value: number): number {
  return Math.round(value / 16) * 16;
}

export function normalizeSize(
  targetWidth: number,
  targetHeight: number,
): { width: number; height: number; sizeStr: string } {
  if (!Number.isFinite(targetWidth) || !Number.isFinite(targetHeight)) {
    throw new RangeError('Image width and height must be finite numbers');
  }
  const width = snapTo16(targetWidth);
  const height = snapTo16(targetHeight);
  if (width <= 0 || height <= 0) {
    throw new RangeError('Image width and height must be positive after snapping to 16px');
  }
  const ratio = width / height;
  if (ratio < MIN_IMAGE_DIMENSION_RATIO || ratio > MAX_IMAGE_DIMENSION_RATIO) {
    throw new RangeError('Image width/height ratio must be between 1:3 and 3:1');
  }
  if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) {
    throw new RangeError(`Image width and height must not exceed ${MAX_IMAGE_SIDE}px`);
  }
  const pixels = width * height;
  if (pixels < MIN_IMAGE_PIXELS || pixels > MAX_IMAGE_PIXELS) {
    throw new RangeError(
      `Image pixel count must be between ${MIN_IMAGE_PIXELS} and ${MAX_IMAGE_PIXELS}`,
    );
  }
  return { width, height, sizeStr: `${width}x${height}` };
}

export function getSizeByRatio(ratioKey: string, tier: ImageSizeTier = 'standard'): string {
  if (tier !== 'standard' && tier !== 'high_res' && tier !== '4k') {
    throw new RangeError(`Unsupported image size tier: ${String(tier)}`);
  }
  const config = ASPECT_RATIO_CONFIGS[ratioKey as AspectRatio];
  if (config === undefined || !ASPECT_RATIOS.includes(ratioKey as AspectRatio)) {
    throw new RangeError(`Unsupported aspect ratio: ${ratioKey}`);
  }
  const rawSize =
    tier === '4k'
      ? config.four_k_size
      : tier === 'high_res'
        ? config.high_res_size
        : config.standard_size;
  const [width, height] = rawSize.split('x').map(Number);
  if (width === undefined || height === undefined) {
    throw new RangeError(`Invalid image size preset: ${rawSize}`);
  }
  return normalizeSize(width, height).sizeStr;
}

function aspectSize(ratio: AspectRatio, tier: ImageSizeTier): AspectSize {
  const size = getSizeByRatio(ratio, tier);
  const [width, height] = size.split('x').map(Number) as [number, number];
  return { size, width, height };
}

export const ASPECT_SIZE_MAP: Record<AspectRatio, AspectSize> = Object.fromEntries(
  ASPECT_RATIOS.map((ratio) => [ratio, aspectSize(ratio, 'standard')]),
) as Record<AspectRatio, AspectSize>;

export const RESOLUTION_SIZE_MAP: Record<
  ImageResolution,
  Partial<Record<AspectRatio, AspectSize>>
> = {
  standard: ASPECT_SIZE_MAP,
  '2k': Object.fromEntries(
    ASPECT_RATIOS.map((ratio) => [ratio, aspectSize(ratio, 'high_res')]),
  ) as Record<AspectRatio, AspectSize>,
  '4k': Object.fromEntries(
    ASPECT_RATIOS.map((ratio) => [ratio, aspectSize(ratio, '4k')]),
  ) as Record<AspectRatio, AspectSize>,
};

export function aspectSizeForResolution(
  aspectRatio: AspectRatio,
  resolution: ImageResolution = DEFAULT_IMAGE_RESOLUTION,
): AspectSize | undefined {
  return RESOLUTION_SIZE_MAP[resolution][aspectRatio];
}

export function isAspectRatioSupportedForResolution(
  aspectRatio: AspectRatio,
  resolution: ImageResolution = DEFAULT_IMAGE_RESOLUTION,
): boolean {
  return aspectSizeForResolution(aspectRatio, resolution) !== undefined;
}

export function imageGenerationCreditCost(
  resolution: ImageResolution = DEFAULT_IMAGE_RESOLUTION,
  model?: string,
): number {
  if (model === GEMINI_IMAGE_MODEL) return GEMINI_IMAGE_GENERATION_CREDIT_COST;
  if (resolution === DEFAULT_IMAGE_RESOLUTION) return STANDARD_IMAGE_GENERATION_CREDIT_COST;
  return model === 'gpt-image-2.5-sunburst'
    ? SUNBURST_HIGH_RES_IMAGE_GENERATION_CREDIT_COST
    : HIGH_RES_IMAGE_GENERATION_CREDIT_COST;
}

export function supportsImageQuality(model: string | undefined): boolean {
  return QUALITY_CAPABLE_IMAGE_MODELS.includes(
    model as (typeof QUALITY_CAPABLE_IMAGE_MODELS)[number],
  );
}

export interface GenerateInput {
  prompt: string;
  requestId?: string;
  signal?: AbortSignal;
  /** Server-resolved credential for this request. Never accepted from an HTTP request body. */
  providerCredential?: string;
  providerCredentialGroup?: 'standard' | 'high-res';
  /**
   * Optional reference image path under UPLOAD_DIR.
   * Routes the request to /v1/images/edits.
   *
   * @deprecated Use referencePaths for new call sites.
   */
  referencePath?: string;
  /**
   * Optional reference image paths under UPLOAD_DIR.
   * Routes the request to /v1/images/edits and appends each item as an
   * `image` multipart field.
   */
  referencePaths?: string[];
  model?: string;
  count?: number;
  aspectRatio?: AspectRatio;
  resolution?: ImageResolution;
  quality?: ImageQuality;
}

export interface GenerateImageItem {
  /** Absolute path under OUTPUT_DIR. */
  outputPath: string;
  width: number;
  height: number;
}

export interface GenerateOutput {
  images: GenerateImageItem[];
  aspectRatio: AspectRatio;
  /** Provider-selected model after any resolution-specific override. */
  model?: string;
}
