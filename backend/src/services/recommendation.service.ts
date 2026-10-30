import { desc, eq } from 'drizzle-orm';

import { db } from '../db/drizzle.js';
import { imageRecords, user } from '../db/schema.js';
import {
  IMAGE_CATEGORY_LABELS,
  isImageCategory,
  type ImageCategory,
} from '../types/imageCategory.js';

import { listTeamRecordDTOs, type TeamImageRecordDTO } from './history.service.js';

/** Words that name a usage; checked in order, so more specific usages come first. */
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

export function inferCategory(query: string): ImageCategory | undefined {
  return CATEGORY_KEYWORDS.find(([, pattern]) => pattern.test(query))?.[0];
}

function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}\p{Z}\s]/gu, '');
}

/** Character bigrams: robust for Chinese without a word segmenter. */
function bigrams(text: string): Set<string> {
  const chars = Array.from(normalize(text));
  const grams = new Set<string>();
  for (let index = 0; index < chars.length - 1; index += 1) {
    grams.add(`${chars[index]}${chars[index + 1]}`);
  }
  return grams;
}

export interface RecommendationCandidate {
  id: string;
  prompt: string;
  description?: string;
  tags: readonly string[];
  category?: ImageCategory;
  createdAt: Date;
}

export interface RankedRecommendation {
  id: string;
  score: number;
  reason: string;
}

const MIN_COVERAGE = 0.25;
const RECENCY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

/** Scores teammates' work against a need and keeps the relevant ones, best first. */
export function rankRecommendations(
  query: string,
  candidates: readonly RecommendationCandidate[],
  options: { now: Date; limit: number },
): RankedRecommendation[] {
  const queryGrams = bigrams(query);
  if (queryGrams.size === 0) return [];
  const normalizedQuery = normalize(query);
  const inferred = inferCategory(query);

  return candidates
    .flatMap((candidate) => {
      const docGrams = bigrams(
        [candidate.prompt, candidate.description ?? '', ...candidate.tags].join(' '),
      );
      let shared = 0;
      queryGrams.forEach((gram) => {
        if (docGrams.has(gram)) shared += 1;
      });
      const coverage = shared / queryGrams.size;
      const tagHits = candidate.tags.filter((tag) => {
        const normalizedTag = normalize(tag);
        return normalizedTag.length > 0 && normalizedQuery.includes(normalizedTag);
      });
      const sameCategory = inferred !== undefined && candidate.category === inferred;
      if (coverage < MIN_COVERAGE && tagHits.length === 0 && !sameCategory) return [];

      const age = options.now.getTime() - candidate.createdAt.getTime();
      const recency = Math.max(0, 1 - age / RECENCY_WINDOW_MS) * 0.05;
      const reasons = [
        ...(sameCategory ? [`同为${IMAGE_CATEGORY_LABELS[inferred]}`] : []),
        ...(tagHits.length > 0 ? [`标签相近：${tagHits.join('、')}`] : []),
      ];
      return [
        {
          id: candidate.id,
          score: coverage + tagHits.length * 0.15 + (sameCategory ? 0.3 : 0) + recency,
          reason: reasons.length > 0 ? reasons.join(' · ') : '画面描述相近',
        },
      ];
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit);
}

export interface TeamRecommendation {
  record: Omit<TeamImageRecordDTO, 'ownerName'>;
  ownerName: string;
  reason: string;
}

/** How many of the newest shared images are considered; enough for a team library. */
const CANDIDATE_POOL = 2000;

function parseTags(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === 'string')
      : [];
  } catch {
    return [];
  }
}

interface CandidateRow {
  id: string;
  prompt: string;
  description: string | null;
  tags: string | null;
  category: string | null;
  createdAt: Date;
}

function toCandidate(row: CandidateRow): RecommendationCandidate {
  return {
    id: row.id,
    prompt: row.prompt,
    ...(row.description === null ? {} : { description: row.description }),
    tags: parseTags(row.tags),
    ...(isImageCategory(row.category) ? { category: row.category } : {}),
    createdAt: row.createdAt,
  };
}

const candidateColumns = {
  id: imageRecords.id,
  prompt: imageRecords.prompt,
  description: imageRecords.description,
  tags: imageRecords.tags,
  category: imageRecords.category,
  createdAt: imageRecords.createdAt,
};

/** A user's own images, private ones included, most relevant to a described need. */
export function recommendOwnImages(input: {
  userId: string;
  query: string;
  limit: number;
}): Array<{ id: string; reason: string }> {
  const rows = db
    .select(candidateColumns)
    .from(imageRecords)
    .where(eq(imageRecords.userId, input.userId))
    .orderBy(desc(imageRecords.createdAt))
    .limit(CANDIDATE_POOL)
    .all();
  return rankRecommendations(input.query, rows.map(toCandidate), {
    now: new Date(),
    limit: input.limit,
  }).map(({ id, reason }) => ({ id, reason }));
}

/** Teammates' shared work most relevant to a described need. */
export function recommendTeamImages(input: { query: string; limit: number }): TeamRecommendation[] {
  const rows = db
    .select(candidateColumns)
    .from(imageRecords)
    .innerJoin(user, eq(user.id, imageRecords.userId))
    .where(eq(imageRecords.isShared, true))
    .orderBy(desc(imageRecords.createdAt))
    .limit(CANDIDATE_POOL)
    .all();
  const ranked = rankRecommendations(input.query, rows.map(toCandidate), {
    now: new Date(),
    limit: input.limit,
  });
  const records = new Map(
    listTeamRecordDTOs(ranked.map((item) => item.id)).map((dto) => [dto.id, dto]),
  );
  return ranked.flatMap((item) => {
    const dto = records.get(item.id);
    if (dto === undefined) return [];
    const { ownerName, ...record } = dto;
    return [{ record, ownerName, reason: item.reason }];
  });
}
