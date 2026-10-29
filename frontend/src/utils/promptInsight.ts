import type { ImageCategory } from '@/types/image';

import { extractVisibleTexts, isTextDense } from './visibleText';

/** Words that name a usage; mirrors the backend's recommendation rules, specific usages first. */
const CATEGORY_KEYWORDS: ReadonlyArray<readonly [ImageCategory, RegExp]> = [
  ['ecommerce', /电商|主图|商品图|详情页/u],
  ['social', /小红书|封面|朋友圈|公众号|社媒/u],
  ['infographic', /信息图|图表|流程图|数据可视化/u],
  ['logo', /logo|标志|商标|徽标/iu],
  ['poster', /海报|招贴|宣传单|传单/u],
  ['product', /产品渲染|渲染图|产品图/u],
  ['illustration', /插画|插图/u],
  ['photo', /摄影|照片|写实/u],
  ['ui', /\bui\b|界面|\bapp\b|网页/iu],
];

export function inferCategory(prompt: string): ImageCategory | undefined {
  return CATEGORY_KEYWORDS.find(([, pattern]) => pattern.test(prompt))?.[0];
}

export interface PromptInsight {
  category?: ImageCategory;
  texts: string[];
  dense: boolean;
}

/** What the composer can tell about a prompt before anything is generated. */
export function analyzePrompt(prompt: string): PromptInsight {
  const category = inferCategory(prompt);
  return {
    ...(category === undefined ? {} : { category }),
    texts: extractVisibleTexts(prompt),
    dense: isTextDense(prompt),
  };
}
