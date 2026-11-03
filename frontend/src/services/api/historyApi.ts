import {
  ASPECT_RATIOS,
  IMAGE_QUALITIES,
  IMAGE_RESOLUTIONS,
  type AspectRatio,
  type ImageMetadataUpdate,
  type ImageRecord,
  type ImageResolution,
  type ImageQuality,
  type ImageCategory,
  type TeamHistoryPage,
  type TeamRecommendation,
  type TextCheckResult,
  isImageCategory,
} from '@/types/image';
import { isNumber, isRecord, readNumber, readString } from '@/utils/narrowing';

import {
  ImageApiError,
  authedFetch,
  buildApiError,
  buildApiUrl,
  parseJsonResponse,
} from './httpClient';

export interface HistoryListResponse {
  records: ImageRecord[];
  nextCursor?: string;
}

export async function fetchHistory(): Promise<ImageRecord[]> {
  const response = await authedFetch(buildApiUrl('/api/history'));
  const payload = await parseJsonResponse(response);
  if (!response.ok) throw buildApiError(response.status, payload);
  if (!isHistoryListResponse(payload)) {
    throw new ImageApiError(response.status, 'INVALID_RESPONSE', '历史接口返回了无法识别的响应。');
  }
  return payload.records;
}

/** Teammates' shared images, newest first; pass the previous page's cursor for the next one. */
export async function fetchTeamHistory(
  input: { category?: ImageCategory; cursor?: string } = {},
): Promise<TeamHistoryPage> {
  const query = new URLSearchParams();
  if (input.category !== undefined) query.set('category', input.category);
  if (input.cursor !== undefined) query.set('cursor', input.cursor);
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  const response = await authedFetch(buildApiUrl(`/api/history/team${suffix}`));
  const payload = await parseJsonResponse(response);
  if (!response.ok) throw buildApiError(response.status, payload);
  if (!isTeamHistoryPage(payload)) {
    throw new ImageApiError(
      response.status,
      'INVALID_RESPONSE',
      '成果库接口返回了无法识别的响应。',
    );
  }
  return payload;
}

/** Teammates' shared work most relevant to `query`, best first. */
export async function fetchTeamRecommendations(
  query: string,
  signal?: AbortSignal,
  limit?: number,
): Promise<TeamRecommendation[]> {
  const params = new URLSearchParams({ q: query });
  if (limit !== undefined) params.set('limit', String(limit));
  const response = await authedFetch(
    buildApiUrl(`/api/history/team/recommendations?${params.toString()}`),
    signal === undefined ? {} : { signal },
  );
  const payload = await parseJsonResponse(response);
  if (!response.ok) throw buildApiError(response.status, payload);
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.recommendations) ||
    !payload.recommendations.every(
      (item) =>
        isRecord(item) &&
        isImageRecord(item.record) &&
        typeof item.ownerName === 'string' &&
        typeof item.reason === 'string',
    )
  ) {
    throw new ImageApiError(response.status, 'INVALID_RESPONSE', '推荐接口返回了无法识别的响应。');
  }
  return payload.recommendations as TeamRecommendation[];
}

/** The user's own images most relevant to `query`, best first, with why each matched. */
export async function fetchOwnImageMatches(
  query: string,
  signal?: AbortSignal,
  limit?: number,
): Promise<Array<{ id: string; reason: string }>> {
  const params = new URLSearchParams({ q: query });
  if (limit !== undefined) params.set('limit', String(limit));
  const response = await authedFetch(
    buildApiUrl(`/api/history/recommendations?${params.toString()}`),
    signal === undefined ? {} : { signal },
  );
  const payload = await parseJsonResponse(response);
  if (!response.ok) throw buildApiError(response.status, payload);
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.matches) ||
    !payload.matches.every(
      (item) => isRecord(item) && typeof item.id === 'string' && typeof item.reason === 'string',
    )
  ) {
    throw new ImageApiError(response.status, 'INVALID_RESPONSE', '搜索接口返回了无法识别的响应。');
  }
  return payload.matches as Array<{ id: string; reason: string }>;
}

export async function deleteHistoryRecord(
  id: string,
  options: { keepalive?: boolean } = {},
): Promise<void> {
  const response = await authedFetch(buildApiUrl(`/api/history/${encodeURIComponent(id)}`), {
    method: 'DELETE',
    // Lets the request outlive the page, for a delete sent as the page is closing.
    ...(options.keepalive ? { keepalive: true } : {}),
  });
  if (!response.ok && response.status !== 204) {
    const payload = await parseJsonResponse(response);
    throw buildApiError(response.status, payload);
  }
}

export async function deleteHistoryBatch(batchId: string): Promise<void> {
  const response = await authedFetch(
    buildApiUrl(`/api/history/batch/${encodeURIComponent(batchId)}`),
    { method: 'DELETE' },
  );
  if (!response.ok && response.status !== 204) {
    const payload = await parseJsonResponse(response);
    throw buildApiError(response.status, payload);
  }
}

export async function updateHistoryRecord(
  id: string,
  updates: ImageMetadataUpdate,
): Promise<ImageRecord> {
  const response = await authedFetch(buildApiUrl(`/api/history/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const payload = await parseJsonResponse(response);
  if (!response.ok) throw buildApiError(response.status, payload);
  if (!isRecordResponse(payload)) {
    throw new ImageApiError(response.status, 'INVALID_RESPONSE', '资产更新返回了无法识别的响应。');
  }
  return payload.record;
}

export async function updateHistoryRecords(
  ids: readonly string[],
  updates: ImageMetadataUpdate,
): Promise<ImageRecord[]> {
  const response = await authedFetch(buildApiUrl('/api/history'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, updates }),
  });
  const payload = await parseJsonResponse(response);
  if (!response.ok) throw buildApiError(response.status, payload);
  if (!isHistoryListResponse(payload)) {
    throw new ImageApiError(response.status, 'INVALID_RESPONSE', '批量更新返回了无法识别的响应。');
  }
  return payload.records;
}

export async function deleteHistoryRecords(ids: readonly string[]): Promise<number> {
  const response = await authedFetch(buildApiUrl('/api/history/bulk-delete'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  const payload = await parseJsonResponse(response);
  if (!response.ok) throw buildApiError(response.status, payload);
  if (!isRecord(payload) || typeof payload.removed !== 'number') {
    throw new ImageApiError(response.status, 'INVALID_RESPONSE', '批量删除返回了无法识别的响应。');
  }
  return payload.removed;
}

function isAspectRatio(value: unknown): value is AspectRatio {
  return typeof value === 'string' && (ASPECT_RATIOS as readonly string[]).includes(value);
}

function isImageResolution(value: unknown): value is ImageResolution {
  return typeof value === 'string' && (IMAGE_RESOLUTIONS as readonly string[]).includes(value);
}

function isImageQuality(value: unknown): value is ImageQuality {
  return typeof value === 'string' && (IMAGE_QUALITIES as readonly string[]).includes(value);
}

function isImageRecord(value: unknown): value is ImageRecord {
  if (!isRecord(value)) return false;
  const id = readString(value, 'id');
  const createdAt = readString(value, 'createdAt');
  const prompt = readString(value, 'prompt');
  const model = readString(value, 'model');
  const width = readNumber(value, 'width');
  const height = readNumber(value, 'height');
  if (typeof id !== 'string') return false;
  if (typeof createdAt !== 'string') return false;
  if (typeof prompt !== 'string') return false;
  if (typeof model !== 'string') return false;
  if (!isNumber(width) || !isNumber(height)) return false;
  const batchId = value.batchId;
  const referenceId = value.referenceId;
  const referenceIds = value.referenceIds;
  const aspectRatio = value.aspectRatio;
  const elapsedMs = value.elapsedMs;
  const isPublic = value.isPublic;
  const count = value.count;
  const resolution = value.resolution;
  const quality = value.quality;
  const isFavorite = value.isFavorite;
  const collection = value.collection;
  return (
    (batchId === undefined || typeof batchId === 'string') &&
    (referenceId === undefined || typeof referenceId === 'string') &&
    (referenceIds === undefined || isStringArray(referenceIds)) &&
    (aspectRatio === undefined || isAspectRatio(aspectRatio)) &&
    (elapsedMs === undefined || typeof elapsedMs === 'number') &&
    (count === undefined || typeof count === 'number') &&
    (resolution === undefined || isImageResolution(resolution)) &&
    (quality === undefined || isImageQuality(quality)) &&
    (isFavorite === undefined || typeof isFavorite === 'boolean') &&
    (collection === undefined || typeof collection === 'string') &&
    typeof isPublic === 'boolean' &&
    dropMalformedAnalysisFields(value)
  );
}

function isTextCheck(value: unknown): value is TextCheckResult {
  return (
    isRecord(value) &&
    (value.status === 'passed' || value.status === 'issues') &&
    Array.isArray(value.segments) &&
    value.segments.every(
      (segment) =>
        isRecord(segment) &&
        typeof segment.text === 'string' &&
        (segment.found === null || typeof segment.found === 'string') &&
        typeof segment.ok === 'boolean' &&
        (segment.clear === undefined || typeof segment.clear === 'boolean'),
    )
  );
}

const ANALYSIS_FIELD_CHECKS: Record<string, (value: unknown) => boolean> = {
  isShared: (value) => typeof value === 'boolean',
  category: isImageCategory,
  categorySource: (value) => value === 'user' || value === 'ai',
  description: (value) => typeof value === 'string',
  tags: isStringArray,
  textCheck: isTextCheck,
  analysisStatus: (value) => value === 'pending' || value === 'done' || value === 'failed',
};

/**
 * Sharing and analysis fields are optional extras: a malformed one is dropped so the
 * record, and the rest of the history list, still loads.
 */
function dropMalformedAnalysisFields(value: Record<string, unknown>): true {
  for (const [field, isValid] of Object.entries(ANALYSIS_FIELD_CHECKS)) {
    if (value[field] !== undefined && !isValid(value[field])) delete value[field];
  }
  return true;
}

function isRecordResponse(value: unknown): value is { record: ImageRecord } {
  return isRecord(value) && isImageRecord(value.record);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isTeamHistoryPage(value: unknown): value is TeamHistoryPage {
  return (
    isRecord(value) &&
    Array.isArray(value.records) &&
    value.records.every(
      (record) => isImageRecord(record) && isRecord(record) && typeof record.ownerName === 'string',
    ) &&
    (value.nextCursor === undefined || typeof value.nextCursor === 'string')
  );
}

function isHistoryListResponse(value: unknown): value is HistoryListResponse {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.records)) return false;
  return (
    value.records.every(isImageRecord) &&
    (value.nextCursor === undefined || typeof value.nextCursor === 'string')
  );
}
