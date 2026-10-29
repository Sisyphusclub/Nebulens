import { Buffer } from 'node:buffer';

import { and, desc, eq, inArray, lt, or, type SQL } from 'drizzle-orm';

import { db } from '../db/drizzle.js';
import { imageRecords, user } from '../db/schema.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../logger.js';
import { removeOutputByFilename } from '../storage/localStorage.js';
import type { AspectRatio, ImageQuality, ImageResolution } from '../types/image.js';
import type { AnalysisStatus, TextCheckResult } from '../types/imageAnalysis.js';
import {
  isImageCategory,
  type ImageCategory,
  type ImageCategorySource,
} from '../types/imageCategory.js';

export interface ImageRecordDTO {
  id: string;
  batchId: string;
  prompt: string;
  model: string;
  referenceId?: string;
  referenceIds?: string[];
  aspectRatio?: AspectRatio;
  filename: string;
  mime: string;
  width: number;
  height: number;
  count: number;
  resolution: ImageResolution;
  quality?: ImageQuality;
  elapsedMs?: number;
  isPublic: boolean;
  isFavorite: boolean;
  collection?: string;
  isShared: boolean;
  category?: ImageCategory;
  categorySource?: ImageCategorySource;
  description?: string;
  tags?: string[];
  textCheck?: TextCheckResult;
  analysisStatus?: AnalysisStatus;
  createdAt: string; // ISO 8601
}

export type PublicImageRecordDTO = Omit<ImageRecordDTO, 'referenceId' | 'referenceIds'>;

/** A teammate's shared image, with who made it. */
export type TeamImageRecordDTO = PublicImageRecordDTO & { ownerName: string };

export interface TeamImageRecordPage {
  records: TeamImageRecordDTO[];
  nextCursor?: string;
}

export interface PublicImageRecordPage {
  records: PublicImageRecordDTO[];
  nextCursor?: string;
}

export const DEFAULT_PUBLIC_HISTORY_PAGE_SIZE = 24;
export const MAX_PUBLIC_HISTORY_PAGE_SIZE = 50;

export interface NewImageRecord {
  id: string;
  batchId: string;
  userId: string;
  prompt: string;
  model: string;
  referenceId?: string;
  referenceIds?: string[];
  aspectRatio?: AspectRatio;
  filename: string;
  mime: string;
  width: number;
  height: number;
  count: number;
  resolution: ImageResolution;
  quality?: ImageQuality;
  elapsedMs?: number;
  isPublic: boolean;
  /** Defaults to private; generation passes the requester's choice. */
  isShared?: boolean;
  category?: ImageCategory;
  analysisStatus?: AnalysisStatus;
  createdAt: Date;
}

function parseReferenceIds(raw: string | null, fallback: string | null): string[] {
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return Array.from(
          new Set(parsed.filter((item): item is string => typeof item === 'string')),
        );
      }
    } catch {
      // Fall back to the legacy single reference id below.
    }
  }
  return fallback !== null ? [fallback] : [];
}

function parseJson(raw: string | null): unknown {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function parseTags(raw: string | null): string[] | undefined {
  const parsed = parseJson(raw);
  return Array.isArray(parsed)
    ? parsed.filter((tag): tag is string => typeof tag === 'string')
    : undefined;
}

function parseTextCheck(raw: string | null): TextCheckResult | undefined {
  const parsed = parseJson(raw);
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const value = parsed as Partial<TextCheckResult>;
  return (value.status === 'passed' || value.status === 'issues') && Array.isArray(value.segments)
    ? { status: value.status, segments: value.segments }
    : undefined;
}

function toDTO(row: typeof imageRecords.$inferSelect): ImageRecordDTO {
  const dto: ImageRecordDTO = {
    id: row.id,
    batchId: row.batchId,
    prompt: row.prompt,
    model: row.model,
    filename: row.filename,
    mime: row.mime,
    width: row.width,
    height: row.height,
    count: row.count,
    resolution: row.resolution as ImageResolution,
    isPublic: row.isPublic,
    isFavorite: row.isFavorite,
    isShared: row.isShared,
    createdAt: row.createdAt.toISOString(),
  };
  const referenceIds = parseReferenceIds(row.referenceIds, row.referenceId);
  if (row.referenceId !== null) dto.referenceId = row.referenceId;
  if (referenceIds.length > 0) dto.referenceIds = referenceIds;
  if (row.aspectRatio !== null) dto.aspectRatio = row.aspectRatio as AspectRatio;
  if (row.quality !== null) dto.quality = row.quality as ImageQuality;
  if (row.elapsedMs !== null) dto.elapsedMs = row.elapsedMs;
  if (row.collection !== null) dto.collection = row.collection;
  if (isImageCategory(row.category)) dto.category = row.category;
  if (row.categorySource === 'user' || row.categorySource === 'ai') {
    dto.categorySource = row.categorySource;
  }
  if (row.description !== null) dto.description = row.description;
  const tags = parseTags(row.tags);
  if (tags !== undefined) dto.tags = tags;
  const textCheck = parseTextCheck(row.textCheck);
  if (textCheck !== undefined) dto.textCheck = textCheck;
  if (
    row.analysisStatus === 'pending' ||
    row.analysisStatus === 'done' ||
    row.analysisStatus === 'failed'
  ) {
    dto.analysisStatus = row.analysisStatus;
  }
  return dto;
}

export function insertImageRecords(records: NewImageRecord[]): void {
  if (records.length === 0) return;
  db.insert(imageRecords)
    .values(
      records.map((r) => ({
        id: r.id,
        batchId: r.batchId,
        userId: r.userId,
        prompt: r.prompt,
        model: r.model,
        referenceId: r.referenceId ?? r.referenceIds?.[0] ?? null,
        referenceIds:
          r.referenceIds && r.referenceIds.length > 0 ? JSON.stringify(r.referenceIds) : null,
        aspectRatio: r.aspectRatio ?? null,
        filename: r.filename,
        mime: r.mime,
        width: r.width,
        height: r.height,
        count: r.count,
        resolution: r.resolution,
        quality: r.quality ?? null,
        elapsedMs: r.elapsedMs ?? null,
        isPublic: r.isPublic,
        isShared: r.isShared ?? false,
        category: r.category ?? null,
        categorySource: r.category === undefined ? null : 'user',
        analysisStatus: r.analysisStatus ?? null,
        createdAt: r.createdAt,
      })),
    )
    .run();
}

export interface ImageRecordAccess {
  userId: string;
  isPublic: boolean;
  isShared: boolean;
}

export function findImageRecordAccess(filename: string): ImageRecordAccess | null {
  // `id` is the primary key and is always inserted equal to `filename`
  // (see persistGeneratedImages). Matching on the primary key lets this
  // lookup — run on every served image — hit the PK index instead of
  // scanning the table, which has no index on `filename`.
  return (
    db
      .select({
        userId: imageRecords.userId,
        isPublic: imageRecords.isPublic,
        isShared: imageRecords.isShared,
      })
      .from(imageRecords)
      .where(eq(imageRecords.id, filename))
      .get() ?? null
  );
}

export interface ImageMetadataUpdate {
  isFavorite?: boolean | undefined;
  isPublic?: boolean | undefined;
  isShared?: boolean | undefined;
  /** The owner's own choice; null clears it. */
  category?: ImageCategory | null | undefined;
  collection?: string | null | undefined;
}

function metadataValues(updates: ImageMetadataUpdate) {
  return {
    ...(updates.isFavorite === undefined ? {} : { isFavorite: updates.isFavorite }),
    ...(updates.isPublic === undefined ? {} : { isPublic: updates.isPublic }),
    ...(updates.isShared === undefined ? {} : { isShared: updates.isShared }),
    ...(updates.category === undefined
      ? {}
      : { category: updates.category, categorySource: updates.category === null ? null : 'user' }),
    ...(updates.collection === undefined ? {} : { collection: updates.collection }),
  };
}

export function updateImageRecordForUser(
  userId: string,
  id: string,
  updates: ImageMetadataUpdate,
): ImageRecordDTO | null {
  const row = db
    .update(imageRecords)
    .set(metadataValues(updates))
    .where(and(eq(imageRecords.userId, userId), eq(imageRecords.id, id)))
    .returning()
    .get();
  return row ? toDTO(row) : null;
}

export function updateImageRecordsForUser(
  userId: string,
  ids: readonly string[],
  updates: ImageMetadataUpdate,
): ImageRecordDTO[] {
  if (ids.length === 0) return [];
  return db
    .update(imageRecords)
    .set(metadataValues(updates))
    .where(and(eq(imageRecords.userId, userId), inArray(imageRecords.id, [...ids])))
    .returning()
    .all()
    .map(toDTO);
}

export async function deleteImageRecordsForUser(
  userId: string,
  ids: readonly string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const removed = db.transaction((tx) => {
    const rows = tx
      .delete(imageRecords)
      .where(and(eq(imageRecords.userId, userId), inArray(imageRecords.id, [...ids])))
      .returning({ filename: imageRecords.filename })
      .all();
    return rows;
  });
  await cleanupDeletedOutputs(removed.map((row) => row.filename));
  return removed.length;
}

export function listImageRecordsForUser(userId: string): ImageRecordDTO[] {
  const rows = db
    .select()
    .from(imageRecords)
    .where(eq(imageRecords.userId, userId))
    .orderBy(desc(imageRecords.createdAt))
    .all();
  return rows.map(toDTO);
}

export function listPublicImageRecords(input: {
  cursor?: string;
  limit: number;
}): PublicImageRecordPage {
  const cursor = input.cursor === undefined ? undefined : decodePublicCursor(input.cursor);
  const cursorCondition =
    cursor === undefined
      ? undefined
      : or(
          lt(imageRecords.createdAt, new Date(cursor.createdAt)),
          and(
            eq(imageRecords.createdAt, new Date(cursor.createdAt)),
            lt(imageRecords.id, cursor.id),
          ),
        );
  const rows = db
    .select()
    .from(imageRecords)
    .where(and(eq(imageRecords.isPublic, true), cursorCondition))
    .orderBy(desc(imageRecords.createdAt), desc(imageRecords.id))
    .limit(input.limit + 1)
    .all();
  const pageRows = rows.slice(0, input.limit);
  const records = pageRows.map(toPublicDTO);
  const last = pageRows.at(-1);
  return {
    records,
    ...(rows.length > input.limit && last !== undefined
      ? { nextCursor: encodePublicCursor(last.createdAt, last.id) }
      : {}),
  };
}

function selectTeamRows() {
  return db
    .select({
      record: imageRecords,
      username: user.displayUsername,
      handle: user.username,
      name: user.name,
    })
    .from(imageRecords)
    .innerJoin(user, eq(user.id, imageRecords.userId));
}

function toTeamDTO(row: {
  record: typeof imageRecords.$inferSelect;
  username: string | null;
  handle: string | null;
  name: string;
}): TeamImageRecordDTO {
  return { ...toPublicDTO(row.record), ownerName: row.username ?? row.handle ?? row.name };
}

/** The given images that are still shared, in no particular order. */
export function listTeamRecordDTOs(ids: readonly string[]): TeamImageRecordDTO[] {
  if (ids.length === 0) return [];
  return selectTeamRows()
    .where(and(eq(imageRecords.isShared, true), inArray(imageRecords.id, [...ids])))
    .all()
    .map(toTeamDTO);
}

/** Shared images from every teammate, newest first, optionally narrowed to one category. */
export function listTeamImageRecords(input: {
  cursor?: string;
  limit: number;
  category?: ImageCategory;
}): TeamImageRecordPage {
  const cursor = input.cursor === undefined ? undefined : decodePublicCursor(input.cursor);
  const conditions: Array<SQL | undefined> = [
    eq(imageRecords.isShared, true),
    input.category === undefined ? undefined : eq(imageRecords.category, input.category),
    cursor === undefined
      ? undefined
      : or(
          lt(imageRecords.createdAt, new Date(cursor.createdAt)),
          and(
            eq(imageRecords.createdAt, new Date(cursor.createdAt)),
            lt(imageRecords.id, cursor.id),
          ),
        ),
  ];
  const rows = selectTeamRows()
    .where(and(...conditions))
    .orderBy(desc(imageRecords.createdAt), desc(imageRecords.id))
    .limit(input.limit + 1)
    .all();
  const pageRows = rows.slice(0, input.limit);
  const last = pageRows.at(-1)?.record;
  return {
    records: pageRows.map(toTeamDTO),
    ...(rows.length > input.limit && last !== undefined
      ? { nextCursor: encodePublicCursor(last.createdAt, last.id) }
      : {}),
  };
}

function toPublicDTO(row: typeof imageRecords.$inferSelect): PublicImageRecordDTO {
  const dto = toDTO(row);
  delete dto.referenceId;
  delete dto.referenceIds;
  return dto;
}

function encodePublicCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.getTime(), id }), 'utf8').toString(
    'base64url',
  );
}

function decodePublicCursor(cursor: string): { createdAt: number; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null) throw new Error('cursor is not an object');
    const fields = parsed as Record<string, unknown>;
    if (
      typeof fields['createdAt'] !== 'number' ||
      !Number.isSafeInteger(fields['createdAt']) ||
      fields['createdAt'] < 0 ||
      fields['createdAt'] > Date.now() + 86_400_000 ||
      typeof fields['id'] !== 'string' ||
      fields['id'].length === 0
    ) {
      throw new Error('cursor fields are invalid');
    }
    return { createdAt: fields['createdAt'], id: fields['id'] };
  } catch (err) {
    throw new AppError('BAD_REQUEST', 'Invalid public history cursor', 400, err);
  }
}

/** Deletes one record. Returns number of rows deleted (0 if not owned by user). */
export async function deleteImageRecordForUser(userId: string, id: string): Promise<number> {
  const removed = db
    .delete(imageRecords)
    .where(and(eq(imageRecords.userId, userId), eq(imageRecords.id, id)))
    .returning({ filename: imageRecords.filename })
    .all();
  await cleanupDeletedOutputs(removed.map((row) => row.filename));
  return removed.length;
}

/** Removes one public gallery record regardless of owner. Intended for admin moderation. */
export function removePublicImageRecordFromGalleryAsAdmin(id: string): number {
  const candidateIds = imageRecordIdCandidates(id);
  const result = db
    .update(imageRecords)
    .set({ isPublic: false })
    .where(and(inArray(imageRecords.id, candidateIds), eq(imageRecords.isPublic, true)))
    .run();
  return result.changes;
}

function imageRecordIdCandidates(id: string): string[] {
  if (/\.(png|jpeg|webp)$/i.test(id)) return [id];
  return [id, `${id}.png`, `${id}.jpeg`, `${id}.webp`];
}

/** Deletes every record in `batchId` owned by `userId`. */
export async function deleteImageRecordBatchForUser(
  userId: string,
  batchId: string,
): Promise<number> {
  const removed = db
    .delete(imageRecords)
    .where(and(eq(imageRecords.userId, userId), eq(imageRecords.batchId, batchId)))
    .returning({ filename: imageRecords.filename })
    .all();
  await cleanupDeletedOutputs(removed.map((row) => row.filename));
  return removed.length;
}

async function cleanupDeletedOutputs(filenames: readonly string[]): Promise<void> {
  const results = await Promise.allSettled(
    filenames.map((filename) => removeOutputByFilename(filename)),
  );
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      logger.error(
        { filename: filenames[index], err: result.reason },
        'history.delete: failed to remove output after deleting its record',
      );
    }
  });
}
