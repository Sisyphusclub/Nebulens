import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';

import { AppError } from '../errors/AppError.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import {
  deleteProjectForUser,
  getProjectForUser,
  listProjectsForUser,
  saveProjectForUser,
  saveProjectNodesForUser,
  saveProjectTurnForUser,
} from '../services/project.service.js';

import '../types/express.js';

export interface ProjectsRouterDeps {
  /** Optional override for the auth middleware; defaults to `requireAuth`. */
  authMiddleware?: RequestHandler;
  /** Limits how often one account may save; a page saves as its user works. */
  writeRateLimiter?: RequestHandler;
}

// The page makes these ids, so each is held to characters that are safe in a path.
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const BATCH_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;
/** A picture's id, or "<batch>#<n>" for a placeholder or a failure card. */
const NODE_KEY_PATTERN = /^[A-Za-z0-9_#-]{1,140}$/;
const MAX_BATCHES = 2000;
const MAX_TASKS = 200;
const MAX_NODES = 5000;
/** One request with its plan is a few kilobytes; this leaves room and stops abuse. */
const MAX_TURN_BYTES = 256 * 1024;
/** Further out than any board reaches; also keeps out numbers too large to store. */
const MAX_COORDINATE = 10_000_000;
const TURN_STATUSES = [
  'planning',
  'awaiting',
  'running',
  'done',
  'failed',
  'cancelled',
  'interrupted',
] as const;

const dateString = z
  .string()
  .max(40)
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Not a date');

const projectBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  createdAt: dateString,
  updatedAt: dateString,
  batchIds: z.array(z.string().regex(BATCH_ID_PATTERN)).max(MAX_BATCHES),
  tasks: z
    .array(
      z.object({
        id: z.string().regex(BATCH_ID_PATTERN),
        createdAt: dateString,
        settings: z.record(z.string(), z.unknown()),
        error: z.string().max(4000).optional(),
      }),
    )
    .max(MAX_TASKS),
});

/** What the server reads of a request; the rest is kept as the page sent it. */
const turnSchema = z
  .object({
    id: z.string().regex(ID_PATTERN),
    createdAt: dateString,
    status: z.enum(TURN_STATUSES),
    brief: z.string().max(20_000),
  })
  .passthrough();

const turnBodySchema = z.object({ turn: turnSchema });

const coordinate = z.number().min(-MAX_COORDINATE).max(MAX_COORDINATE);

const nodesBodySchema = z.object({
  positions: z
    .record(z.string().regex(NODE_KEY_PATTERN), z.object({ x: coordinate, y: coordinate }))
    .refine((value) => Object.keys(value).length <= MAX_NODES, 'Too many places'),
});

const passThrough: RequestHandler = (_req, _res, next) => {
  next();
};

function requireUserId(req: Request): string {
  if (!req.user) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
  return req.user.id;
}

function readId(value: string | undefined, name: string): string {
  if (value === undefined || !ID_PATTERN.test(value)) {
    throw new AppError('BAD_REQUEST', `Invalid ${name}`, 400);
  }
  return value;
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown, name: string): T {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new AppError('BAD_REQUEST', `Invalid ${name}`, 400, parsed.error, {
      issues: parsed.error.issues,
    });
  }
  return parsed.data;
}

function notFound(projectId: string): AppError {
  return new AppError('NOT_FOUND', 'Project not found', 404, undefined, { projectId });
}

/** Runs an async handler, handing whatever it throws to the error handler. */
function handle(run: (req: Request, res: Parameters<RequestHandler>[1]) => Promise<void>) {
  return ((req, res, next) => {
    run(req, res).catch(next);
  }) satisfies RequestHandler;
}

export function buildProjectsRouter(deps: ProjectsRouterDeps = {}): Router {
  const router = Router();
  const limitWrites = deps.writeRateLimiter ?? passThrough;
  router.use(deps.authMiddleware ?? requireAuth);

  // GET /api/projects -> { projects }, the one worked on most recently first.
  router.get(
    '/',
    handle(async (req, res) => {
      res.status(200).json({ projects: await listProjectsForUser(requireUserId(req)) });
    }),
  );

  // GET /api/projects/:id -> { project, turns, positions }.
  router.get(
    '/:id',
    handle(async (req, res) => {
      const id = readId(req.params.id, 'project id');
      const detail = await getProjectForUser(requireUserId(req), id);
      if (detail === null) throw notFound(id);
      res.status(200).json(detail);
    }),
  );

  // PUT /api/projects/:id { title, createdAt, updatedAt, batchIds, tasks } -> { project }.
  // Creates the project when the account has none under this id.
  router.put(
    '/:id',
    limitWrites,
    handle(async (req, res) => {
      const id = readId(req.params.id, 'project id');
      const body = parseBody(projectBodySchema, req.body, 'project');
      const project = await saveProjectForUser(requireUserId(req), id, {
        title: body.title,
        createdAt: new Date(body.createdAt),
        updatedAt: new Date(body.updatedAt),
        batchIds: body.batchIds,
        tasks: body.tasks.map((task) => ({
          id: task.id,
          createdAt: task.createdAt,
          settings: task.settings,
          ...(task.error === undefined ? {} : { error: task.error }),
        })),
      });
      res.status(200).json({ project });
    }),
  );

  // PUT /api/projects/:id/turns/:turnId { turn } -> saves one request of the conversation.
  router.put(
    '/:id/turns/:turnId',
    limitWrites,
    handle(async (req, res) => {
      const id = readId(req.params.id, 'project id');
      const turnId = readId(req.params.turnId, 'turn id');
      const { turn } = parseBody(turnBodySchema, req.body, 'turn');
      if (turn.id !== turnId) {
        throw new AppError('BAD_REQUEST', 'Turn id does not match the path', 400);
      }
      if (Buffer.byteLength(JSON.stringify(turn)) > MAX_TURN_BYTES) {
        throw new AppError('PAYLOAD_TOO_LARGE', 'Turn is too large to keep', 413, undefined, {
          maxBytes: MAX_TURN_BYTES,
        });
      }
      const saved = await saveProjectTurnForUser(requireUserId(req), id, {
        id: turnId,
        status: turn.status,
        createdAt: new Date(turn.createdAt),
        payload: turn,
      });
      if (!saved) throw notFound(id);
      res.status(200).json({ ok: true });
    }),
  );

  // PUT /api/projects/:id/nodes { positions } -> replaces where everything sits on the board.
  router.put(
    '/:id/nodes',
    limitWrites,
    handle(async (req, res) => {
      const id = readId(req.params.id, 'project id');
      const { positions } = parseBody(nodesBodySchema, req.body, 'board');
      const saved = await saveProjectNodesForUser(requireUserId(req), id, positions);
      if (!saved) throw notFound(id);
      res.status(200).json({ ok: true });
    }),
  );

  // DELETE /api/projects/:id -> 204; the project's pictures stay in the account's assets.
  router.delete(
    '/:id',
    limitWrites,
    handle(async (req, res) => {
      const id = readId(req.params.id, 'project id');
      if (!(await deleteProjectForUser(requireUserId(req), id))) throw notFound(id);
      res.status(204).end();
    }),
  );

  return router;
}
