import { ASPECT_RATIOS, type AspectRatio, type ImageResolution } from '@/types/image';

import { CREATION_TEMPLATE_TITLES_ZH } from './creationTemplateTitlesZh';
import promptsZh from './creationTemplatePromptsZh.json';
import manifest from './creationTemplates.json';

export interface CreationTemplateSettings {
  aspectRatio: AspectRatio;
  count: number;
  resolution: ImageResolution;
  isPublic: boolean;
}

export interface CreationTemplate {
  id: string;
  /** Chinese display title. */
  title: string;
  /** The template's original English title, shown as a subtitle. */
  englishTitle: string;
  /** The original prompt from the source gallery, which search still matches. */
  originalPrompt: string;
  category: string;
  imageUrl: string;
  prompt: string;
  settings: CreationTemplateSettings;
  sourceUrl: string;
  sourceTitle: string;
  sourcePath: string;
  width: number;
  height: number;
}

const isAspectRatio = (value: unknown): value is AspectRatio =>
  typeof value === 'string' && (ASPECT_RATIOS as readonly string[]).includes(value);

const isImageResolution = (value: unknown): value is ImageResolution =>
  value === 'standard' || value === '2k' || value === '4k';

function normalizeTemplate(value: (typeof manifest)[number]): CreationTemplate {
  if (!isAspectRatio(value.aspectRatio) || !isImageResolution(value.resolution)) {
    throw new Error(`Invalid GPT Image 2 template metadata: ${value.id}`);
  }
  return {
    id: value.id,
    title: CREATION_TEMPLATE_TITLES_ZH[value.id] ?? value.title,
    englishTitle: value.title,
    category: value.category,
    imageUrl: value.imageUrl,
    // Text meant to appear in the image stays as written; the rest is in Chinese.
    prompt: (promptsZh as Record<string, string>)[value.id] ?? value.prompt,
    originalPrompt: value.prompt,
    settings: {
      aspectRatio: value.aspectRatio,
      count: value.count,
      resolution: value.resolution,
      isPublic: value.isPublic,
    },
    sourceUrl: value.sourceUrl,
    sourceTitle: value.sourceTitle,
    sourcePath: value.sourcePath,
    width: value.width,
    height: value.height,
  };
}

export const CREATION_TEMPLATES: readonly CreationTemplate[] = manifest.map(normalizeTemplate);

export const TEMPLATE_CATEGORIES = [
  '全部',
  ...new Set(CREATION_TEMPLATES.map((template) => template.category)),
] as const;

/**
 * Template categories offered as one-tap shortcuts under the Discover composer: everyday
 * design work rather than niche styles.
 */
export const TEMPLATE_SHORTCUT_CATEGORIES: readonly string[] = [
  '海报字体',
  '信息图表',
  '电影风格',
  '时尚编辑',
  '产品美食',
];

export function orderTemplatesWithAnimeLast(
  templates: readonly CreationTemplate[],
): CreationTemplate[] {
  const anime: CreationTemplate[] = [];
  const general: CreationTemplate[] = [];

  for (const template of templates) {
    (template.category === '动漫漫画' ? anime : general).push(template);
  }

  return [...general, ...anime];
}

/**
 * A varied handful of templates for the Discover feed: one from each category in turn,
 * anime last in every round as on the templates page.
 */
export function templatesAcrossCategories(count: number): CreationTemplate[] {
  const queues = new Map<string, CreationTemplate[]>();
  for (const template of orderTemplatesWithAnimeLast(CREATION_TEMPLATES)) {
    const queue = queues.get(template.category) ?? [];
    queue.push(template);
    queues.set(template.category, queue);
  }
  const picked: CreationTemplate[] = [];
  while (picked.length < count && [...queues.values()].some((queue) => queue.length > 0)) {
    for (const queue of queues.values()) {
      const next = queue.shift();
      if (next !== undefined && picked.length < count) picked.push(next);
    }
  }
  return picked;
}
