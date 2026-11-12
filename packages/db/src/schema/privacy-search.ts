// Personal-data, idempotency and private-search schema (SPEC-112 EF-1 to EF-7, ET-1 to ET-6;
// docs/architecture/data-model.md §11–§12, ADR-0044, ADR-0062, ADR-0120, ADR-0219, ADR-0247).
//
// Four tables:
//   * `data_exports` keeps the private ZIP job of SPEC-211 (owner, job state, private path,
//     expiration, size). An expired export is never downloadable even though its row remains for
//     audit until the purge (EF-1, CL-2).
//   * `legal_acceptances` is the append-only history of accepted CGU/privacy versions: a new
//     version inserts a row and never rewrites the previous acceptance (EF-2, CL-1).
//   * `idempotency_keys` is keyed by `(user_id, key)` and stores the canonical request hash, the
//     JSON response, the HTTP status (`0` = in progress) and the completion instant (EF-3, CL-3,
//     ADR-0120). The wrapper of SPEC-201 and the purge of SPEC-208 compose these rows.
//   * `rate_limits` is a service-only token bucket; SPEC-208 decrements it atomically (EF-4, CL-4).
//
// The `search_user_content(q, limit_count)` function and the FTS/trigram indexes live in the custom
// migration `privacy_search_rules`, as does RLS. This module owns the validation and pure helpers
// shared by the repositories, the demonstration and the tests: canonical request hashing, query
// normalization, safe snippets and the downloadability rule.
import { createHash } from 'node:crypto';

import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { z } from 'zod';

import { AppError } from '@learny/core';

import { jobStatus } from './enums';
import { profiles } from './identity';

/** EF-2 — the two legal documents whose acceptance is kept. */
export const legalDocument = pgEnum('legal_document', ['cgu', 'privacy']);

export const LEGAL_DOCUMENTS = legalDocument.enumValues;

/** EF-3, ADR-0120 — a client key is 8 to 128 URL-safe characters. */
export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/, {
  message: 'une clé d’idempotence fait 8 à 128 caractères [A-Za-z0-9_-]',
});

/** ET-1, ADR-0120 — SHA-256 rendered as 64 lower-case hexadecimal characters. */
export const requestHashSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, { message: 'une empreinte SHA-256 hexadécimale est attendue' });

/** ET-2 — the SQL function clamps the same bounds; the repository rejects an out-of-range limit. */
export const searchLimitSchema = z.int().min(1).max(100);

/** EF-6 — a snippet is plain text, bounded before it reaches the API or the page. */
export const SNIPPET_MAX_LENGTH = 160;
export const SEARCH_QUERY_MAX_LENGTH = 100;

/**
 * ET-2, EF-5 — normalizes a query before it reaches SQL: NFKC, collapsed whitespace, trim and a
 * hard bound. Accent folding is done by `unaccent` inside Postgres.
 */
export function normalizeSearchQuery(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, SEARCH_QUERY_MAX_LENGTH);
}

/**
 * EF-6, ET-4 — turns any text (including Markdown or HTML from a course) into a plain-text
 * snippet: tags are removed, angle brackets and ampersands are replaced so no markup can survive,
 * whitespace is collapsed and the result is bounded. The SQL function applies the same rule for
 * rows read directly from Postgres.
 */
export function sanitizeSnippet(
  value: string | null | undefined,
  max = SNIPPET_MAX_LENGTH,
): string {
  const bound = Math.max(0, Math.min(Math.trunc(max), 400));
  const plain = (value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:[a-z]+|#\d+);/gi, ' ')
    .replace(/[<>&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.slice(0, bound);
}

export interface RequestHashInput {
  method: string;
  route: string;
  params?: unknown;
  body?: unknown;
}

/** Deterministic JSON: object keys sorted, `undefined` members omitted, arrays kept in order. */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new AppError('VALIDATION_FAILED', 'Un nombre non fini ne peut pas être haché.');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  throw new AppError('VALIDATION_FAILED', 'Une valeur non sérialisable ne peut pas être hachée.');
}

/**
 * ET-1, ADR-0120, ADR-0219 — SHA-256 of the method, the route template, the canonical parameters
 * and the canonical body. The user is not included: the key is already scoped by `pk(user_id, key)`.
 */
export function computeRequestHash(input: RequestHashInput): string {
  const method = input.method.trim().toUpperCase();
  const route = input.route.trim();
  if (method === '' || route === '') {
    throw new AppError('VALIDATION_FAILED', 'La méthode et la route sont obligatoires.');
  }
  if (route.length > 300) {
    throw new AppError('VALIDATION_FAILED', 'La route dépasse 300 caractères.');
  }
  const payload = [
    method,
    route,
    canonicalJson(input.params ?? {}),
    canonicalJson(input.body ?? null),
  ].join('\n');
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/** ADR-0120, ADR-0219 — a key older than 24 hours is treated as absent. */
export const IDEMPOTENCY_VALIDITY_MS = 24 * 60 * 60 * 1000;

/** EF-1, CL-2 — an export is downloadable only while it is done, stored and unexpired. */
export interface DownloadableExport {
  status: string;
  storagePath: string | null;
  expiresAt: Date | null;
}

export function isDataExportDownloadable(record: DownloadableExport, now: Date): boolean {
  return (
    record.status === 'done' &&
    record.storagePath !== null &&
    record.storagePath !== '' &&
    record.expiresAt !== null &&
    record.expiresAt.getTime() > now.getTime()
  );
}

/** EF-1, ET-1 — a private export job and its expiration (bucket `exports`). */
export const dataExports = pgTable(
  'data_exports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    status: jobStatus('status').notNull().default('queued'),
    storagePath: text('storage_path'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // EF-1, ET-1 — the account page lists one owner's exports newest first.
    index('data_exports_user_id_created_at_idx').on(table.userId, table.createdAt.desc()),
    // EF-1, CL-2 — the purge of SPEC-211 finds expired rows without scanning the table.
    index('data_exports_expires_at_idx')
      .on(table.expiresAt)
      .where(sql`${table.expiresAt} is not null`),
    check(
      'data_exports_storage_path_check',
      sql`${table.storagePath} is null or char_length(${table.storagePath}) between 1 and 1024`,
    ),
    check(
      'data_exports_size_bytes_check',
      sql`${table.sizeBytes} is null or ${table.sizeBytes} >= 0`,
    ),
    // EF-1 — an expiration is always later than the creation instant.
    check(
      'data_exports_expires_at_check',
      sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

/** EF-2, CL-1 — append-only legal acceptance history, unique for one version. */
export const legalAcceptances = pgTable(
  'legal_acceptances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    document: legalDocument('document').notNull(),
    version: text('version').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // CL-1 — accepting the same version twice never doubles the history.
    unique('legal_acceptances_user_id_document_version_unique').on(
      table.userId,
      table.document,
      table.version,
    ),
    index('legal_acceptances_user_id_accepted_at_idx').on(table.userId, table.acceptedAt.desc()),
    check('legal_acceptances_version_check', sql`char_length(${table.version}) between 1 and 40`),
  ],
);

/** EF-3, ET-1, CL-3, ADR-0120/ADR-0219 — one idempotency reservation per `(user_id, key)`. */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: text('key').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    route: text('route').notNull(),
    requestHash: text('request_hash').notNull(),
    response: jsonb('response').$type<unknown>(),
    statusCode: integer('status_code').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ name: 'idempotency_keys_pkey', columns: [table.userId, table.key] }),
    // EF-3, ADR-0219 — the hourly purge of SPEC-208 reads by creation instant.
    index('idempotency_keys_created_at_idx').on(table.createdAt),
    // ADR-0120 — a key is URL-safe and 8 to 128 characters long.
    check('idempotency_keys_key_check', sql`${table.key} ~ '^[A-Za-z0-9_-]{8,128}$'`),
    check('idempotency_keys_route_check', sql`char_length(${table.route}) between 1 and 300`),
    // ET-1, ADR-0219 — the stored fingerprint is exactly a SHA-256 hexadecimal digest.
    check('idempotency_keys_request_hash_check', sql`${table.requestHash} ~ '^[0-9a-f]{64}$'`),
    check('idempotency_keys_status_code_check', sql`${table.statusCode} between 0 and 599`),
    // CL-3 — `0` means in progress and has no completion instant; a recorded response is dated.
    check(
      'idempotency_keys_completed_at_check',
      sql`(${table.statusCode} = 0) = (${table.completedAt} is null)`,
    ),
  ],
);

/** EF-4, ET-5, CL-4 — service-only token bucket, decremented atomically by SPEC-208. */
export const rateLimits = pgTable(
  'rate_limits',
  {
    bucket: text('bucket').primaryKey(),
    tokens: numeric('tokens', { precision: 12, scale: 4 }).notNull().default('0'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // EF-4 — the cleanup of stale buckets scans by last update.
    index('rate_limits_updated_at_idx').on(table.updatedAt),
    check('rate_limits_bucket_check', sql`char_length(${table.bucket}) between 1 and 300`),
    check('rate_limits_tokens_check', sql`${table.tokens} >= 0`),
  ],
);

export type DataExport = typeof dataExports.$inferSelect;
export type NewDataExport = typeof dataExports.$inferInsert;
export type LegalAcceptance = typeof legalAcceptances.$inferSelect;
export type NewLegalAcceptance = typeof legalAcceptances.$inferInsert;
export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type NewIdempotencyKey = typeof idempotencyKeys.$inferInsert;
export type RateLimit = typeof rateLimits.$inferSelect;
export type NewRateLimit = typeof rateLimits.$inferInsert;
export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number];
