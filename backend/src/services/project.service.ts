import { and, asc, count, desc, eq } from 'drizzle-orm';

import { db } from '../db/drizzle.js';
import { canvasNodes, projects, projectTurns, type ProjectTask } from '../db/schema.js';
import { AppError } from '../errors/AppError.js';

export interface ProjectDTO {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  batchIds: string[];
  tasks: ProjectTask[];
  turnCount: number;
}

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface ProjectDetailDTO {
  project: ProjectDTO;
  /** The conversation, oldest request first, each as the page saved it. */
  turns: Record<string, unknown>[];
  positions: Record<string, CanvasPoint>;
}

export interface ProjectInput {
  title: string;
  createdAt: Date;
  updatedAt: Date;
  batchIds: string[];
  tasks: ProjectTask[];
}

export interface ProjectTurnInput {
  id: string;
  status: string;
  createdAt: Date;
  payload: Record<string, unknown>;
}

type ProjectRow = typeof projects.$inferSelect;

function toDTO(row: ProjectRow, turnCount: number): ProjectDTO {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    batchIds: row.batchIds,
    tasks: row.tasks,
    turnCount,
  };
}

function findOwned(userId: string, id: string): ProjectRow | undefined {
  return db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .get();
}

// These are async although SQLite answers at once, so callers do not change if the
// store behind them later needs a round trip.

/** The account's projects, the one worked on most recently first. */
export async function listProjectsForUser(userId: string): Promise<ProjectDTO[]> {
  const rows = db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.updatedAt), desc(projects.id))
    .all();
  const turnCounts = new Map(
    db
      .select({ projectId: projectTurns.projectId, value: count() })
      .from(projectTurns)
      .innerJoin(projects, eq(projects.id, projectTurns.projectId))
      .where(eq(projects.userId, userId))
      .groupBy(projectTurns.projectId)
      .all()
      .map((row) => [row.projectId, row.value]),
  );
  return rows.map((row) => toDTO(row, turnCounts.get(row.id) ?? 0));
}

export async function getProjectForUser(
  userId: string,
  id: string,
): Promise<ProjectDetailDTO | null> {
  const row = findOwned(userId, id);
  if (row === undefined) return null;
  const turns = db
    .select({ payload: projectTurns.payload })
    .from(projectTurns)
    .where(eq(projectTurns.projectId, id))
    .orderBy(asc(projectTurns.createdAt), asc(projectTurns.id))
    .all();
  const nodes = db.select().from(canvasNodes).where(eq(canvasNodes.projectId, id)).all();
  return {
    project: toDTO(row, turns.length),
    turns: turns.map((turn) => turn.payload),
    positions: Object.fromEntries(nodes.map((node) => [node.key, { x: node.x, y: node.y }])),
  };
}

/**
 * Creates the project, or replaces what an existing one says about itself. An id another
 * account already uses is refused, since ids come from the page.
 */
export async function saveProjectForUser(
  userId: string,
  id: string,
  input: ProjectInput,
): Promise<ProjectDTO> {
  return db.transaction((tx) => {
    const existing = tx
      .select({ userId: projects.userId })
      .from(projects)
      .where(eq(projects.id, id))
      .get();
    if (existing !== undefined && existing.userId !== userId) {
      throw new AppError('FORBIDDEN', 'Project belongs to another account', 403);
    }
    if (existing === undefined) {
      tx.insert(projects)
        .values({ id, userId, ...input })
        .run();
    } else {
      tx.update(projects).set(input).where(eq(projects.id, id)).run();
    }
    const row = tx.select().from(projects).where(eq(projects.id, id)).get();
    if (row === undefined) {
      throw new AppError('INTERNAL', 'Project was not saved', 500, undefined, { projectId: id });
    }
    const turnCount =
      tx.select({ value: count() }).from(projectTurns).where(eq(projectTurns.projectId, id)).get()
        ?.value ?? 0;
    return toDTO(row, turnCount);
  });
}

/** False when the account has no such project. */
export async function saveProjectTurnForUser(
  userId: string,
  projectId: string,
  turn: ProjectTurnInput,
): Promise<boolean> {
  if (findOwned(userId, projectId) === undefined) return false;
  db.insert(projectTurns)
    .values({ projectId, ...turn })
    .onConflictDoUpdate({
      target: [projectTurns.projectId, projectTurns.id],
      set: { status: turn.status, payload: turn.payload, createdAt: turn.createdAt },
    })
    .run();
  return true;
}

/** Replaces the whole board. False when the account has no such project. */
export async function saveProjectNodesForUser(
  userId: string,
  projectId: string,
  positions: Readonly<Record<string, CanvasPoint>>,
): Promise<boolean> {
  if (findOwned(userId, projectId) === undefined) return false;
  const rows = Object.entries(positions).map(([key, point]) => ({
    projectId,
    key,
    x: point.x,
    y: point.y,
  }));
  db.transaction((tx) => {
    tx.delete(canvasNodes).where(eq(canvasNodes.projectId, projectId)).run();
    // SQLite caps the variables of one statement; four columns a row stays well under it.
    for (let start = 0; start < rows.length; start += 200) {
      tx.insert(canvasNodes)
        .values(rows.slice(start, start + 200))
        .run();
    }
  });
  return true;
}

/** Removes the project with its conversation and board; its pictures stay in the assets. */
export async function deleteProjectForUser(userId: string, id: string): Promise<boolean> {
  const result = db
    .delete(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .run();
  return result.changes > 0;
}
