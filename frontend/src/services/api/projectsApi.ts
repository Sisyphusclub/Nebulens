import { isNumber, isRecord } from '@/utils/narrowing';

import {
  ImageApiError,
  authedFetch,
  buildApiError,
  buildApiUrl,
  parseJsonResponse,
} from './httpClient';

/** A project as the server lists it. Its tasks are read by whoever keeps sessions. */
export interface RemoteProject {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  batchIds: string[];
  tasks: unknown[];
  /** How many requests its conversation holds; none for a project made on the generate page. */
  turnCount: number;
}

export interface RemotePoint {
  x: number;
  y: number;
}

export interface RemoteProjectDetail {
  project: RemoteProject;
  /** The conversation, oldest first, each request as a page saved it. */
  turns: unknown[];
  positions: Record<string, RemotePoint>;
}

export interface ProjectPayload {
  title: string;
  createdAt: string;
  updatedAt: string;
  batchIds: readonly string[];
  tasks: readonly object[];
}

function isRemoteProject(value: unknown): value is RemoteProject {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    Array.isArray(value.batchIds) &&
    value.batchIds.every((batchId) => typeof batchId === 'string') &&
    Array.isArray(value.tasks) &&
    isNumber(value.turnCount)
  );
}

function projectUrl(id: string, rest = ''): string {
  return buildApiUrl(`/api/projects/${encodeURIComponent(id)}${rest}`);
}

async function put(url: string, body: unknown): Promise<void> {
  const response = await authedFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw buildApiError(response.status, await parseJsonResponse(response));
}

/** The account's projects, the one worked on most recently first. */
export async function fetchProjects(): Promise<RemoteProject[]> {
  const response = await authedFetch(buildApiUrl('/api/projects'));
  const payload = await parseJsonResponse(response);
  if (!response.ok) throw buildApiError(response.status, payload);
  if (!isRecord(payload) || !Array.isArray(payload.projects)) {
    throw new ImageApiError(response.status, 'INVALID_RESPONSE', '项目接口返回了无法识别的响应。');
  }
  return payload.projects.filter(isRemoteProject);
}

/** One project with its conversation and board; null when the server has no such project. */
export async function fetchProject(id: string): Promise<RemoteProjectDetail | null> {
  const response = await authedFetch(projectUrl(id));
  const payload = await parseJsonResponse(response);
  if (response.status === 404) return null;
  if (!response.ok) throw buildApiError(response.status, payload);
  if (
    !isRecord(payload) ||
    !isRemoteProject(payload.project) ||
    !Array.isArray(payload.turns) ||
    !isRecord(payload.positions)
  ) {
    throw new ImageApiError(response.status, 'INVALID_RESPONSE', '项目接口返回了无法识别的响应。');
  }
  const positions = Object.fromEntries(
    Object.entries(payload.positions).flatMap(([key, point]) =>
      isRecord(point) && isNumber(point.x) && isNumber(point.y)
        ? [[key, { x: point.x, y: point.y }]]
        : [],
    ),
  );
  return { project: payload.project, turns: payload.turns, positions };
}

/** Creates the project on the server, or replaces what it says about itself. */
export async function saveProject(id: string, project: ProjectPayload): Promise<void> {
  await put(projectUrl(id), project);
}

/** Saves one request of the project's conversation. */
export async function saveProjectTurn<Turn extends { id: string }>(
  id: string,
  turn: Turn,
): Promise<void> {
  await put(projectUrl(id, `/turns/${encodeURIComponent(turn.id)}`), { turn });
}

/** Replaces where everything sits on the project's board. */
export async function saveProjectNodes(
  id: string,
  positions: Readonly<Record<string, RemotePoint>>,
): Promise<void> {
  await put(projectUrl(id, '/nodes'), { positions });
}

/** Deletes the project; one the server no longer has counts as deleted. */
export async function deleteProject(id: string): Promise<void> {
  const response = await authedFetch(projectUrl(id), { method: 'DELETE' });
  if (response.ok || response.status === 404) return;
  throw buildApiError(response.status, await parseJsonResponse(response));
}
