/** What an image is for. Used to file team work and to narrow recommendations. */
export const IMAGE_CATEGORIES = [
  'poster',
  'ecommerce',
  'social',
  'infographic',
  'product',
  'logo',
  'illustration',
  'photo',
  'ui',
  'other',
] as const;

export type ImageCategory = (typeof IMAGE_CATEGORIES)[number];

export const IMAGE_CATEGORY_LABELS: Readonly<Record<ImageCategory, string>> = {
  poster: '海报',
  ecommerce: '电商主图',
  social: '社媒封面',
  infographic: '信息图表',
  product: '产品渲染',
  logo: '品牌 Logo',
  illustration: '插画',
  photo: '摄影写实',
  ui: 'UI 设计',
  other: '其他',
};

export type ImageCategorySource = 'user' | 'ai';

export function isImageCategory(value: unknown): value is ImageCategory {
  return typeof value === 'string' && (IMAGE_CATEGORIES as readonly string[]).includes(value);
}
