// Resources and vector chunks schema (SPEC-104 ET-1, ET-2, ET-4;
// docs/architecture/data-model.md §3). A resource is a learner contribution or a tutor
// suggestion; its passages (`resource_chunks`) carry the citation coordinates (BR-APP-06) and the
// 1024-dimension embedding used by the semantic search (ADR-0056).
//
// SQL that Drizzle cannot express lives in the custom migration `resources_rules`: RLS (ADR-0112),
// the HNSW cosine index, the coded limits (EF-3), the soft-deletion triggers (EF-4), the chunk
// consistency trigger (EF-5, CL-7) and the `programme_imports.resource_id` foreign key (EF-6).
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

import { EMBEDDING_DIM } from '@learny/config';

import { chapters, formations } from './formations';
import { profiles } from './identity';
import type { ChunkLocation, ResourceMetadata } from './resources.json-schemas';

/** ADR-0008 — resource types available from V1 (`audio`/`video` are not offered by the V1 UI). */
export const resourceKind = pgEnum('resource_kind', [
  'note',
  'pdf',
  'web',
  'youtube',
  'image',
  'audio',
  'video',
  'exam_guide',
]);

/** BR-APP-05 — a resource is imported by the learner or suggested by the tutor. */
export const resourceOrigin = pgEnum('resource_origin', ['learner', 'tutor_suggestion']);

/** BR-APP-05 — the learner imports or dismisses a tutor suggestion. */
export const suggestionStatus = pgEnum('suggestion_status', ['pending', 'imported', 'dismissed']);

/** BR-APP-07 — processing status of a contribution. */
export const resourceStatus = pgEnum('resource_status', [
  'queued',
  'processing',
  'ready',
  'failed',
]);

export const RESOURCE_KINDS = resourceKind.enumValues;
export const RESOURCE_ORIGINS = resourceOrigin.enumValues;
export const SUGGESTION_STATUSES = suggestionStatus.enumValues;
export const RESOURCE_STATUSES = resourceStatus.enumValues;

/** BR-APP-05, ADR-0039 — contributions and tutor suggestions with soft deletion. */
export const resources = pgTable(
  'resources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    formationId: uuid('formation_id')
      .notNull()
      .references(() => formations.id, { onDelete: 'cascade' }),
    chapterId: uuid('chapter_id').references(() => chapters.id, { onDelete: 'cascade' }),
    kind: resourceKind('kind').notNull(),
    origin: resourceOrigin('origin').notNull().default('learner'),
    suggestionStatus: suggestionStatus('suggestion_status'),
    title: text('title').notNull(),
    /** Notes and transcriptions (BR-APP-06); erased by the soft-deletion trigger. */
    contentText: text('content_text'),
    /** ADR-0058 — `<userId>/<uuid>/<name>` inside the private `resources` bucket. */
    storagePath: text('storage_path'),
    url: text('url'),
    mime: text('mime'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    status: resourceStatus('status').notNull().default('queued'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    metadata: jsonb('metadata').$type<ResourceMetadata>().notNull().default({}),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('resources_owner_chapter_idx').on(table.ownerId, table.chapterId),
    index('resources_formation_id_idx').on(table.formationId),
    index('resources_status_idx')
      .on(table.status)
      .where(sql`${table.status} in ('queued', 'processing')`),
    check('resources_title_length_check', sql`char_length(${table.title}) between 1 and 200`),
    check(
      'resources_storage_path_check',
      sql`${table.storagePath} is null or (${table.storagePath} ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/.+$' and char_length(${table.storagePath}) <= 512)`,
    ),
    check(
      'resources_url_check',
      sql`${table.url} is null or (${table.url} ~ '^https://' and char_length(${table.url}) <= 2048)`,
    ),
    check(
      'resources_mime_length_check',
      sql`${table.mime} is null or char_length(${table.mime}) <= 127`,
    ),
    check('resources_size_bytes_check', sql`${table.sizeBytes} is null or ${table.sizeBytes} >= 0`),
    check(
      'resources_error_code_length_check',
      sql`${table.errorCode} is null or char_length(${table.errorCode}) <= 64`,
    ),
    check(
      'resources_error_message_length_check',
      sql`${table.errorMessage} is null or char_length(${table.errorMessage}) <= 1000`,
    ),
    check('resources_metadata_check', sql`jsonb_typeof(${table.metadata}) = 'object'`),
    // EF-2 — shape of a note: text only, no file and no link; a deleted note keeps its identity.
    check(
      'resources_note_shape',
      sql`${table.kind} <> 'note' or ${table.deletedAt} is not null or (${table.contentText} is not null and char_length(${table.contentText}) <= 100000 and ${table.storagePath} is null and ${table.url} is null)`,
    ),
    check(
      'resources_file_shape',
      sql`${table.kind} not in ('pdf', 'image', 'audio', 'video') or ${table.storagePath} is not null`,
    ),
    check(
      'resources_link_shape',
      sql`${table.kind} not in ('web', 'youtube') or ${table.url} is not null`,
    ),
    check(
      'resources_exam_guide_shape',
      sql`${table.kind} <> 'exam_guide' or ${table.storagePath} is not null or ${table.url} is not null`,
    ),
    check(
      'resources_suggestion_shape',
      sql`(${table.origin} = 'tutor_suggestion') = (${table.suggestionStatus} is not null) and (${table.origin} = 'learner' or ${table.url} is not null)`,
    ),
    check(
      'resources_failed_has_error',
      sql`${table.status} <> 'failed' or ${table.errorCode} is not null`,
    ),
    check(
      'resources_content_max',
      sql`${table.contentText} is null or char_length(${table.contentText}) <= 2000000`,
    ),
    check(
      'resources_pdf_size',
      sql`${table.kind} <> 'pdf' or ${table.sizeBytes} is null or ${table.sizeBytes} <= 52428800`,
    ),
    check(
      'resources_image_size',
      sql`${table.kind} <> 'image' or ${table.sizeBytes} is null or ${table.sizeBytes} <= 10485760`,
    ),
    check(
      'resources_pdf_pages',
      sql`${table.kind} <> 'pdf' or coalesce((${table.metadata} ->> 'pages')::int, 0) <= 500`,
    ),
  ],
);

/**
 * BR-APP-06 — located passages of a resource. `formation_id` and `chapter_id` are copied from the
 * resource (ADR-0113) so the semantic search filters without a join; the `resource_chunks_consistency`
 * trigger refuses a divergent scope and a passage of a deleted resource.
 */
export const resourceChunks = pgTable(
  'resource_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    formationId: uuid('formation_id')
      .notNull()
      .references(() => formations.id, { onDelete: 'cascade' }),
    chapterId: uuid('chapter_id').references(() => chapters.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    text: text('text').notNull(),
    location: jsonb('location').$type<ChunkLocation>().notNull(),
    tokenCount: integer('token_count'),
    /** ADR-0056 — Voyage `voyage-4-lite`, cosine similarity, HNSW index. */
    embedding: vector('embedding', { dimensions: EMBEDDING_DIM }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('resource_chunks_resource_id_position_unique').on(table.resourceId, table.position),
    index('resource_chunks_owner_resource_idx').on(table.ownerId, table.resourceId),
    index('resource_chunks_owner_formation_idx').on(table.ownerId, table.formationId),
    index('resource_chunks_chapter_idx').on(table.chapterId),
    check('resource_chunks_position_check', sql`${table.position} >= 0`),
    check('resource_chunks_text_length_check', sql`char_length(${table.text}) between 1 and 20000`),
    check(
      'resource_chunks_location_check',
      sql`jsonb_typeof(${table.location}) = 'object' and ${table.location} ? 'charStart' and ${table.location} ? 'charEnd'`,
    ),
    check(
      'resource_chunks_token_count_check',
      sql`${table.tokenCount} is null or ${table.tokenCount} >= 0`,
    ),
  ],
);

export type Resource = typeof resources.$inferSelect;
export type NewResource = typeof resources.$inferInsert;
export type ResourceChunk = typeof resourceChunks.$inferSelect;
export type NewResourceChunk = typeof resourceChunks.$inferInsert;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
