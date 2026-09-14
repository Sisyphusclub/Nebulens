export type GenerationMode = 'text-to-image' | 'image-to-image';

export const ASPECT_RATIOS = [
  '3:1',
  '21:9',
  '2:1',
  '16:9',
  '16:10',
  '3:2',
  '4:3',
  '5:4',
  '1:1',
  '4:5',
  '3:4',
  '2:3',
  '10:16',
  '9:16',
  '9:19.5',
  '1:2',
  '1:3',
] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const ASPECT_CHOICES = ['auto', ...ASPECT_RATIOS] as const;
export type AspectChoice = (typeof ASPECT_CHOICES)[number];

export interface AspectRatioConfig {
  key: AspectRatio;
  label: string;
  ratio: number;
  standard_size: string;
  high_res_size: string;
}

export const ASPECT_RATIO_CONFIGS: Record<AspectRatio, AspectRatioConfig> = {
  '3:1': {
    key: '3:1',
    label: '极限超宽 / 3:1',
    ratio: 3,
    standard_size: '2304x768',
    high_res_size: '3072x1024',
  },
  '21:9': {
    key: '21:9',
    label: '宽银幕 / 21:9',
    ratio: 2.37,
    standard_size: '2560x1088',
    high_res_size: '3360x1424',
  },
  '2:1': {
    key: '2:1',
    label: '宽画幅 / 2:1',
    ratio: 2,
    standard_size: '2048x1024',
    high_res_size: '2560x1280',
  },
  '16:9': {
    key: '16:9',
    label: '横屏宽屏 / 16:9',
    ratio: 1.778,
    standard_size: '1920x1088',
    high_res_size: '2560x1440',
  },
  '16:10': {
    key: '16:10',
    label: '屏幕比例 / 16:10',
    ratio: 1.6,
    standard_size: '1920x1200',
    high_res_size: '2560x1600',
  },
  '3:2': {
    key: '3:2',
    label: '经典相机 / 3:2',
    ratio: 1.5,
    standard_size: '1536x1024',
    high_res_size: '2160x1440',
  },
  '4:3': {
    key: '4:3',
    label: '传统横画 / 4:3',
    ratio: 1.333,
    standard_size: '1440x1088',
    high_res_size: '2048x1536',
  },
  '5:4': {
    key: '5:4',
    label: '印刷横幅 / 5:4',
    ratio: 1.25,
    standard_size: '1280x1024',
    high_res_size: '2000x1600',
  },
  '1:1': {
    key: '1:1',
    label: '正方形 / 1:1',
    ratio: 1,
    standard_size: '1024x1024',
    high_res_size: '2048x2048',
  },
  '4:5': {
    key: '4:5',
    label: '社交媒体竖图 / 4:5',
    ratio: 0.8,
    standard_size: '1024x1280',
    high_res_size: '1600x2000',
  },
  '3:4': {
    key: '3:4',
    label: '人像肖像 / 3:4',
    ratio: 0.75,
    standard_size: '1088x1440',
    high_res_size: '1536x2048',
  },
  '2:3': {
    key: '2:3',
    label: '经典竖图 / 2:3',
    ratio: 0.667,
    standard_size: '1024x1536',
    high_res_size: '1440x2160',
  },
  '10:16': {
    key: '10:16',
    label: '平板竖屏 / 10:16',
    ratio: 0.625,
    standard_size: '1200x1920',
    high_res_size: '1600x2560',
  },
  '9:16': {
    key: '9:16',
    label: '移动竖屏 / 9:16',
    ratio: 0.563,
    standard_size: '1088x1920',
    high_res_size: '1440x2560',
  },
  '9:19.5': {
    key: '9:19.5',
    label: '手机满屏 / 9:19.5',
    ratio: 0.462,
    standard_size: '1088x2352',
    high_res_size: '1120x2432',
  },
  '1:2': {
    key: '1:2',
    label: '超长竖构图 / 1:2',
    ratio: 0.5,
    standard_size: '1024x2048',
    high_res_size: '1280x2560',
  },
  '1:3': {
    key: '1:3',
    label: '极限长图 / 1:3',
    ratio: 0.333,
    standard_size: '1024x3072',
    high_res_size: '1280x3840',
  },
};

export const ASPECT_RATIO_LABELS: Record<AspectRatio, string> = Object.fromEntries(
  ASPECT_RATIOS.map((ratio) => [ratio, ASPECT_RATIO_CONFIGS[ratio].label]),
) as Record<AspectRatio, string>;

export const ASPECT_CHOICE_LABELS: Record<AspectChoice, string> = {
  auto: '智能',
  ...ASPECT_RATIO_LABELS,
};

export const DEFAULT_ASPECT_CHOICE: AspectChoice = 'auto';
export const DEFAULT_ASPECT_RATIO: AspectRatio = '1:1';
export const IMAGE_RESOLUTIONS = ['standard', '2k', '4k'] as const;
export type ImageResolution = (typeof IMAGE_RESOLUTIONS)[number];
export const IMAGE_RESOLUTION_LABELS: Record<ImageResolution, string> = {
  standard: '1K',
  '2k': '2K',
  '4k': '4K',
};
export const DEFAULT_IMAGE_RESOLUTION: ImageResolution = 'standard';
export const IMAGE_MODELS = [
  'gpt-image-2',
  'gpt-image-2.5-flare',
  'gpt-image-2.5-sunburst',
  'gemini-3-pro-image',
] as const;
export type ImageModel = (typeof IMAGE_MODELS)[number];
export const DEFAULT_IMAGE_MODEL: ImageModel = 'gpt-image-2.5-flare';
export const IMAGE_MODEL_LABELS: Record<ImageModel, string> = {
  'gpt-image-2': 'gpt-image-2',
  'gpt-image-2.5-flare': 'gpt-image-2.5-flare',
  'gpt-image-2.5-sunburst': 'gpt-image-2.5-sunburst',
  'gemini-3-pro-image': 'Nano Banana Pro',
};
export const IMAGE_QUALITIES = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];
export const DEFAULT_IMAGE_QUALITY: ImageQuality = 'medium';
export const QUALITY_CAPABLE_IMAGE_MODELS = [
  'gpt-image-2.5-flare',
  'gpt-image-2.5-sunburst',
] as const satisfies readonly ImageModel[];
export const STANDARD_IMAGE_GENERATION_CREDIT_COST = 1;
export const HIGH_RES_IMAGE_GENERATION_CREDIT_COST = 3;
export const SUNBURST_HIGH_RES_IMAGE_GENERATION_CREDIT_COST = 4;
export const GEMINI_IMAGE_GENERATION_CREDIT_COST = 4;
export const DEFAULT_COUNT = 1;
export const MIN_COUNT = 1;
export const MAX_COUNT = 4;
export const MAX_REFERENCE_IMAGES = 4;

export function isAspectChoice(value: string | null): value is AspectChoice {
  return value !== null && (ASPECT_CHOICES as readonly string[]).includes(value);
}

export function isAspectRatio(value: string | null): value is AspectRatio {
  return value !== null && (ASPECT_RATIOS as readonly string[]).includes(value);
}

export function isImageResolution(value: string | null): value is ImageResolution {
  return value !== null && (IMAGE_RESOLUTIONS as readonly string[]).includes(value);
}

export function normalizeImageModel(value: string | null | undefined): ImageModel {
  return IMAGE_MODELS.find((model) => model === value) ?? DEFAULT_IMAGE_MODEL;
}

export function imageModelLabel(model: string): string {
  return IMAGE_MODEL_LABELS[model as ImageModel] ?? model;
}

export function isImageQuality(value: string | null | undefined): value is ImageQuality {
  return value !== null && value !== undefined && IMAGE_QUALITIES.includes(value as ImageQuality);
}

export function normalizeImageQuality(value: string | null | undefined): ImageQuality {
  return isImageQuality(value) ? value : DEFAULT_IMAGE_QUALITY;
}

export function supportsImageQuality(model: string | null | undefined): boolean {
  return QUALITY_CAPABLE_IMAGE_MODELS.includes(
    model as (typeof QUALITY_CAPABLE_IMAGE_MODELS)[number],
  );
}

export function imageGenerationCreditCost(resolution: ImageResolution, model?: string): number {
  if (model === 'gemini-3-pro-image') return GEMINI_IMAGE_GENERATION_CREDIT_COST;
  if (resolution === DEFAULT_IMAGE_RESOLUTION) return STANDARD_IMAGE_GENERATION_CREDIT_COST;
  return model === 'gpt-image-2.5-sunburst'
    ? SUNBURST_HIGH_RES_IMAGE_GENERATION_CREDIT_COST
    : HIGH_RES_IMAGE_GENERATION_CREDIT_COST;
}

export function normalizeAspectChoiceForResolution(
  aspect: AspectChoice,
  resolution: ImageResolution,
): AspectChoice {
  return (IMAGE_RESOLUTIONS as readonly string[]).includes(resolution)
    ? aspect
    : DEFAULT_ASPECT_CHOICE;
}

export interface ImageRecord {
  id: string;
  /** Shared across every record in the same generate batch. Optional for entries
   * created before this field was introduced. */
  batchId?: string;
  createdAt: string;
  prompt: string;
  model: string;
  referenceId?: string;
  referenceIds?: readonly string[];
  aspectRatio?: AspectRatio;
  width: number;
  height: number;
  count?: number;
  resolution?: ImageResolution;
  quality?: ImageQuality;
  /** Wall-clock ms from request start to image saved. Optional. */
  elapsedMs?: number;
  isPublic: boolean;
  isFavorite?: boolean;
  collection?: string;
}

export interface GenerationSettingsSnapshot {
  prompt: string;
  model: string;
  count: number;
  aspectRatio: AspectRatio;
  resolution: ImageResolution;
  quality?: ImageQuality;
  isPublic: boolean;
  referenceIds: readonly string[];
}

export interface ImageMetadataUpdate {
  isFavorite?: boolean;
  isPublic?: boolean;
  collection?: string | null;
}

export interface UploadResponse {
  id: string;
  filename: string;
  mime: string;
  size: number;
}

export interface GenerateRequest {
  prompt: string;
  referenceId?: string;
  referenceIds?: readonly string[];
  model?: string;
  count?: number;
  aspectRatio?: AspectRatio;
  resolution?: ImageResolution;
  quality?: ImageQuality;
  isPublic?: boolean;
  demoPresetId?: string;
}

export interface GenerateResponseItem {
  id: string;
  outputUrl: string;
  filename: string;
  mime: string;
  width: number;
  height: number;
}

export interface GenerateResponse {
  batchId: string;
  aspectRatio: AspectRatio;
  generationMode: GenerationMode;
  images: GenerateResponseItem[];
}

export interface ApiErrorBody {
  code: string;
  message: string;
  requestId: string;
  details?: Record<string, unknown>;
}

export interface ApiErrorEnvelope {
  error: ApiErrorBody;
}

export interface QuotaResponse {
  total: number;
  remaining: number;
  checkedInToday: boolean;
  dailyCheckInReward: number;
  permanentTotal?: number;
  permanentUsed?: number;
  permanentRemaining?: number;
  bonusRemaining?: number;
  bonusExpiresAt?: string | null;
}

export interface DailyCheckInResponse extends QuotaResponse {
  claimed: boolean;
}

export interface HistoryEntry {
  record: ImageRecord;
  imageUrl: string;
  size?: number;
}

export interface GeneratedBatchResult {
  batchId: string;
  aspectRatio: AspectRatio;
  generationMode: GenerationMode;
  entries: HistoryEntry[];
}
