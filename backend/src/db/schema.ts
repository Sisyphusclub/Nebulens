import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// --- Better Auth core tables ---
// Schema mirrors better-auth.com/docs/concepts/database (sqlite + ms timestamps).

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  username: text('username').unique(),
  displayUsername: text('display_username'),
  image: text('image'),
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    byUser: index('session_user_idx').on(t.userId),
  }),
);

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    idToken: text('id_token'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    byUser: index('account_user_idx').on(t.userId),
    byProviderAccount: index('account_provider_account_idx').on(t.providerId, t.accountId),
  }),
);

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// --- App tables ---

export const userQuota = sqliteTable('user_quota', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  usedToday: integer('used_today').notNull().default(0),
  quotaDate: text('quota_date').notNull(), // ISO 'YYYY-MM-DD' (Asia/Shanghai)
  dailyTotal: integer('daily_total'),
  checkInDate: text('check_in_date'),
  bonusToday: integer('bonus_today').notNull().default(0),
  /** Lifetime quota configured by an administrator. Kept nullable for old rows. */
  permanentTotal: integer('permanent_total'),
  /** Lifetime quota consumed (including active reservations). */
  permanentUsed: integer('permanent_used'),
});

export const userImageApiKeys = sqliteTable('user_image_api_keys', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  encryptedKey: text('encrypted_key'),
  keySuffix: text('key_suffix'),
  highResEncryptedKey: text('high_res_encrypted_key'),
  highResKeySuffix: text('high_res_key_suffix'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const quotaGrants = sqliteTable(
  'quota_grants',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    source: text('source').notNull().default('check_in'),
    amount: integer('amount').notNull(),
    remaining: integer('remaining').notNull(),
    grantedAt: integer('granted_at', { mode: 'timestamp_ms' }).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    checkInDate: text('check_in_date').notNull(),
  },
  (t) => ({
    byUserExpiry: index('quota_grants_user_expiry_idx').on(t.userId, t.expiresAt),
    byUserSourceDate: uniqueIndex('quota_grants_user_source_date_idx').on(
      t.userId,
      t.source,
      t.checkInDate,
    ),
  }),
);

export const referenceUploads = sqliteTable(
  'reference_uploads',
  {
    filename: text('filename').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    byUserCreatedAt: index('reference_uploads_user_created_idx').on(t.userId, t.createdAt),
  }),
);

export const imageRecords = sqliteTable(
  'image_records',
  {
    id: text('id').primaryKey(), // = filename uuid (matches /api/outputs/<id>)
    batchId: text('batch_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    prompt: text('prompt').notNull(),
    model: text('model').notNull(),
    referenceId: text('reference_id'),
    referenceIds: text('reference_ids'),
    aspectRatio: text('aspect_ratio'),
    filename: text('filename').notNull(),
    mime: text('mime').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    count: integer('count').notNull().default(1),
    resolution: text('resolution').notNull().default('standard'),
    quality: text('quality'),
    elapsedMs: integer('elapsed_ms'),
    isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
    isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
    collection: text('collection'),
    /** Usage category (see IMAGE_CATEGORIES); null until chosen or inferred. */
    category: text('category'),
    /** 'user' when the owner chose the category, 'ai' when analysis inferred it. */
    categorySource: text('category_source'),
    /** Visible to every signed-in teammate. Existing rows stay private. */
    isShared: integer('is_shared', { mode: 'boolean' }).notNull().default(false),
    description: text('description'),
    /** JSON array of short tags. */
    tags: text('tags'),
    /** JSON result of checking the rendered quoted text. */
    textCheck: text('text_check'),
    /** 'pending' | 'done' | 'failed'; null when no analysis was requested. */
    analysisStatus: text('analysis_status'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    byUserCreatedAt: index('image_records_user_created_idx').on(t.userId, t.createdAt),
    bySharedCreatedId: index('image_records_shared_created_id_idx').on(
      t.isShared,
      t.createdAt,
      t.id,
    ),
    byBatch: index('image_records_batch_idx').on(t.batchId),
    byPublicCreatedId: index('image_records_public_created_id_idx').on(
      t.isPublic,
      t.createdAt,
      t.id,
    ),
  }),
);

// --- Projects ---
// A project keeps one piece of work together: the pictures made in it, the conversation
// with the Agent, and where everything sits on the canvas.

/** A generation that failed, kept with its settings so it can be tried again. */
export interface ProjectTask {
  id: string;
  createdAt: string;
  settings: Record<string, unknown>;
  error?: string;
}

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** Ids of the batches made in the project, oldest first, failed generations included. */
    batchIds: text('batch_ids', { mode: 'json' }).$type<string[]>().notNull(),
    tasks: text('tasks', { mode: 'json' }).$type<ProjectTask[]>().notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    /** When work was last done in the project; the list is ordered by it. */
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    byUserUpdated: index('projects_user_updated_idx').on(t.userId, t.updatedAt),
  }),
);

export const projectTurns = sqliteTable(
  'project_turns',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** Unique within its project only: the page makes these ids. */
    id: text('id').notNull(),
    status: text('status').notNull(),
    /** The request and what came of it, as the page keeps it. */
    payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.id] }),
    byProjectCreated: index('project_turns_project_created_idx').on(t.projectId, t.createdAt),
  }),
);

/** Where one picture, placeholder or failure card sits on a project's canvas. */
export const canvasNodes = sqliteTable(
  'canvas_nodes',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    x: real('x').notNull(),
    y: real('y').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.key] }),
  }),
);
