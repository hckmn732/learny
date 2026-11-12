// AI credentials, task models, calls and subscription schema (SPEC-110 EF-1 to EF-6, ET-1 to ET-6;
// docs/architecture/data-model.md §9, ADR-0011, ADR-0012, ADR-0245).
//
// A personal provider key is never stored in clear: `ai_credentials.encrypted_key` is the bytea
// AES-256-GCM payload `iv‖tag‖ciphertext` produced by SPEC-505. This module exposes only the
// redacted public projection (`toPublicCredential`) and a format check; the repository refuses a
// plaintext key field (ET-2, ET-5).
//
// `ai_task_models` holds one row per learner and task; a null `credential_id` means the provided
// AI. `ai_calls` is the append-only cost journal written by the service role. `subscriptions`
// keeps the Stripe identifiers and the daily cap consumed by SPEC-210/SPEC-507. The local-day
// aggregation (`ai_spend_today`) is a view/function in the custom migration `ai_billing_rules`,
// because it needs the learner time zone and UTC day boundaries (ET-3).
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { z } from 'zod';

import { formations } from './formations';
import { profiles } from './identity';

/** EF-1 — the six providers of `data-model.md` §9. */
export const AI_PROVIDERS = [
  'anthropic',
  'openai',
  'mistral',
  'deepseek',
  'openai_compatible',
  'local',
] as const;

/** EF-1 — qualification state of a personal key. */
export const CREDENTIAL_STATUSES = ['untested', 'qualified', 'failed'] as const;

/** EF-2 — one task per learner; the five V1 task families of ADR-0018. */
export const AI_TASKS = ['programme', 'course', 'gaps', 'tutor', 'light'] as const;

/** EF-3 — outcome of a call, including refusals and caps that never reach a provider. */
export const AI_CALL_STATUSES = ['ok', 'error', 'refused', 'capped', 'invalid_output'] as const;

/** EF-4 — the five subscription statuses mapped from Stripe by ADR-0215. */
export const SUBSCRIPTION_STATUSES = [
  'none',
  'active',
  'past_due',
  'canceled',
  'incomplete',
] as const;

export const aiProvider = pgEnum('ai_provider', AI_PROVIDERS);
export const credentialStatus = pgEnum('credential_status', CREDENTIAL_STATUSES);
export const aiTask = pgEnum('ai_task', AI_TASKS);
export const aiCallStatus = pgEnum('ai_call_status', AI_CALL_STATUSES);
export const subscriptionStatus = pgEnum('subscription_status', SUBSCRIPTION_STATUSES);

export const AI_PROVIDERS_VALUES = aiProvider.enumValues;
export const CREDENTIAL_STATUSES_VALUES = credentialStatus.enumValues;
export const AI_TASKS_VALUES = aiTask.enumValues;
export const AI_CALL_STATUSES_VALUES = aiCallStatus.enumValues;
export const SUBSCRIPTION_STATUSES_VALUES = subscriptionStatus.enumValues;

export type AiProviderValue = (typeof AI_PROVIDERS)[number];
export type CredentialStatusValue = (typeof CREDENTIAL_STATUSES)[number];
export type AiTaskValue = (typeof AI_TASKS)[number];
export type AiCallStatusValue = (typeof AI_CALL_STATUSES)[number];
export type SubscriptionStatusValue = (typeof SUBSCRIPTION_STATUSES)[number];

/** ET-2 — AES-256-GCM layout: 12-byte IV, 16-byte tag, at least one ciphertext byte. */
export const AES_GCM_IV_BYTES = 12;
export const AES_GCM_TAG_BYTES = 16;
export const MIN_ENCRYPTED_KEY_BYTES = AES_GCM_IV_BYTES + AES_GCM_TAG_BYTES + 1;

/** EF-4 — default daily cap of the provided AI (ADR-0012), as a numeric string. */
export const DEFAULT_DAILY_CAP_USD = '1.5';

/**
 * ET-2 — `bytea` is not a Drizzle primitive; the driver hands Buffer/Uint8Array values through
 * unchanged. The application never turns this column into base64 for a client.
 */
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType() {
    return 'bytea';
  },
});

/** EF-1 — a personal AI key, encrypted at rest. No plaintext column exists. */
export const aiCredentials = pgTable(
  'ai_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    provider: aiProvider('provider').notNull(),
    label: text('label').notNull(),
    baseUrl: text('base_url'),
    modelIds: text('model_ids')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    encryptedKey: bytea('encrypted_key'),
    keyLast4: text('key_last4'),
    status: credentialStatus('status').notNull().default('untested'),
    qualification: jsonb('qualification')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    outsideEu: boolean('outside_eu').notNull().default(false),
    qualifiedAt: timestamp('qualified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('ai_credentials_user_id_created_at_idx').on(table.userId, table.createdAt),
    check('ai_credentials_label_check', sql`char_length(${table.label}) between 1 and 80`),
    check(
      'ai_credentials_base_url_check',
      sql`${table.baseUrl} is null or char_length(${table.baseUrl}) between 1 and 2048`,
    ),
    // CL-1 — a hosted provider needs a ciphertext; a local model may run without a key.
    check(
      'ai_credentials_key_required_check',
      sql`${table.provider} = 'local' or ${table.encryptedKey} is not null`,
    ),
    // ET-2 — never a raw text key: the bytea payload carries at least IV + tag + one byte.
    check(
      'ai_credentials_encrypted_key_check',
      sql`${table.encryptedKey} is null or octet_length(${table.encryptedKey}) >= ${sql.raw(String(MIN_ENCRYPTED_KEY_BYTES))}`,
    ),
    // EF-1 — the four last characters are shown to the learner; a keyless local model has none.
    check(
      'ai_credentials_key_last4_check',
      sql`(${table.encryptedKey} is null and ${table.keyLast4} is null) or (${table.encryptedKey} is not null and char_length(${table.keyLast4}) = 4)`,
    ),
    check(
      'ai_credentials_qualification_check',
      sql`jsonb_typeof(${table.qualification}) = 'object'`,
    ),
  ],
);

/**
 * EF-2 — the model chosen for one task. `credential_id = null` means the provided AI; the FK is
 * `on delete set null`, so deleting a key leaves no dangling reference (CL-7). The ownership
 * trigger of the custom migration refuses another learner's credential.
 */
export const aiTaskModels = pgTable(
  'ai_task_models',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    task: aiTask('task').notNull(),
    credentialId: uuid('credential_id').references(() => aiCredentials.id, {
      onDelete: 'set null',
    }),
    modelId: text('model_id').notNull(),
  },
  (table) => [
    primaryKey({ name: 'ai_task_models_pkey', columns: [table.userId, table.task] }),
    index('ai_task_models_credential_id_idx').on(table.credentialId),
    check('ai_task_models_model_id_check', sql`char_length(${table.modelId}) between 1 and 200`),
  ],
);

/**
 * EF-3, ET-1 — one row per attempted call, created even for a refusal or a cap. A refusal or a
 * cap carries a zero cost because no provider call happened. The index serves the local-day view
 * and the usage listing (ET-3, EF-6).
 */
export const aiCalls = pgTable(
  'ai_calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    formationId: uuid('formation_id').references(() => formations.id, { onDelete: 'set null' }),
    task: aiTask('task').notNull(),
    provider: aiProvider('provider').notNull(),
    model: text('model').notNull(),
    managed: boolean('managed').notNull().default(false),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
    latencyMs: integer('latency_ms').notNull().default(0),
    status: aiCallStatus('status').notNull(),
    errorCode: text('error_code'),
    batch: boolean('batch').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('ai_calls_user_id_created_at_idx').on(table.userId, table.createdAt),
    index('ai_calls_formation_id_idx').on(table.formationId),
    check('ai_calls_model_check', sql`char_length(${table.model}) between 1 and 200`),
    check('ai_calls_input_tokens_check', sql`${table.inputTokens} >= 0`),
    check('ai_calls_output_tokens_check', sql`${table.outputTokens} >= 0`),
    check('ai_calls_cache_read_tokens_check', sql`${table.cacheReadTokens} >= 0`),
    check('ai_calls_cache_write_tokens_check', sql`${table.cacheWriteTokens} >= 0`),
    check('ai_calls_cost_usd_check', sql`${table.costUsd} >= 0`),
    check('ai_calls_latency_ms_check', sql`${table.latencyMs} >= 0`),
    check(
      'ai_calls_error_code_check',
      sql`${table.errorCode} is null or char_length(${table.errorCode}) between 1 and 80`,
    ),
  ],
);

/**
 * EF-4, CA-4 — one row per learner. The five statuses are the only basis of the provided-AI
 * entitlement (SPEC-210 decides); a new row defaults to `none` and a 1.50 USD daily cap.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    stripeCustomerId: text('stripe_customer_id').unique(),
    stripeSubscriptionId: text('stripe_subscription_id').unique(),
    status: subscriptionStatus('status').notNull().default('none'),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    /** SPEC-210 ET-3 — creation instant of the last Stripe event applied (ordering of webhooks). */
    stripeEventAt: timestamp('stripe_event_at', { withTimezone: true }),
    dailyCapUsd: numeric('daily_cap_usd', { precision: 12, scale: 6 })
      .notNull()
      .default(DEFAULT_DAILY_CAP_USD),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'subscriptions_stripe_customer_id_check',
      sql`${table.stripeCustomerId} is null or char_length(${table.stripeCustomerId}) between 1 and 255`,
    ),
    check(
      'subscriptions_stripe_subscription_id_check',
      sql`${table.stripeSubscriptionId} is null or char_length(${table.stripeSubscriptionId}) between 1 and 255`,
    ),
    check('subscriptions_daily_cap_usd_check', sql`${table.dailyCapUsd} > 0`),
  ],
);

/**
 * SPEC-210 ET-3 — Stripe events already received, deduplicated by `event.id` (ADR-0215). The table
 * is reserved to the service role: RLS is enabled in the custom migration `stripe_events_rules`
 * and no policy is granted to `authenticated`.
 */
export const stripeEvents = pgTable('stripe_events', {
  eventId: text('event_id').primaryKey(),
  type: text('type').notNull(),
  /** Instant at which Stripe created the event (not the reception instant). */
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  /** Set once the event has been applied or consciously ignored. */
  processedAt: timestamp('processed_at', { withTimezone: true }),
});

export type StripeEventRow = typeof stripeEvents.$inferSelect;

export type AiCredential = typeof aiCredentials.$inferSelect;
export type NewAiCredential = typeof aiCredentials.$inferInsert;
export type AiTaskModel = typeof aiTaskModels.$inferSelect;
export type NewAiTaskModel = typeof aiTaskModels.$inferInsert;
export type AiCall = typeof aiCalls.$inferSelect;
export type NewAiCall = typeof aiCalls.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

/** ET-5 — the only fields of a key that may leave the server. */
export interface PublicAiCredential {
  provider: AiProviderValue;
  label: string;
  keyLast4: string | null;
  status: CredentialStatusValue;
  outsideEu: boolean;
}

export const PUBLIC_AI_CREDENTIAL_FIELDS = [
  'provider',
  'label',
  'keyLast4',
  'status',
  'outsideEu',
] as const satisfies readonly (keyof PublicAiCredential)[];

/**
 * ET-5 — redacts a credential row. The function builds a new object from an explicit allow-list,
 * so `encryptedKey` (or any future column) can never leak through a spread or `toJSON`.
 */
export function toPublicCredential(row: {
  provider: AiProviderValue;
  label: string;
  keyLast4: string | null;
  status: CredentialStatusValue;
  outsideEu: boolean;
}): PublicAiCredential {
  return {
    provider: row.provider,
    label: row.label,
    keyLast4: row.keyLast4,
    status: row.status,
    outsideEu: row.outsideEu,
  };
}

/** ET-2 — recognises the AES-256-GCM `iv‖tag‖ciphertext` layout before it reaches Postgres. */
export function isEncryptedKeyFormat(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array && value.length >= MIN_ENCRYPTED_KEY_BYTES;
}

const usdPattern = /^\d{1,6}(\.\d{1,6})?$/;

/** ET-1 — normalises a non-negative USD amount to the six decimals of `numeric(12,6)`. */
export function normalizeUsd(value: string | number): string {
  const text = typeof value === 'number' ? value.toFixed(6) : value.trim();
  if (!usdPattern.test(text)) throw new Error(`montant USD invalide : ${String(value)}`);
  const [whole = '0', fraction = ''] = text.split('.');
  return `${whole}.${fraction.padEnd(6, '0')}`;
}

/** EF-1, ET-1 — the public value lists used by the Zod validators below. */
export const aiProviderSchema = z.enum(AI_PROVIDERS);
export const credentialStatusSchema = z.enum(CREDENTIAL_STATUSES);
export const aiTaskSchema = z.enum(AI_TASKS);
export const aiCallStatusSchema = z.enum(AI_CALL_STATUSES);
export const subscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUSES);

/** EF-1 — a non-empty label, bounded like the SQL check. */
export const credentialLabelSchema = z.string().trim().min(1).max(80);

/** EF-1 — an optional base URL of an OpenAI-compatible endpoint. */
export const baseUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(
    (value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'URL attendue' },
  )
  .nullish();

/** EF-1, ET-2 — a byte payload in the AES-GCM layout. */
export const encryptedKeySchema = z
  .instanceof(Uint8Array)
  .refine(isEncryptedKeyFormat, { message: 'format iv‖tag‖ciphertext attendu' });

/** EF-1 — exactly the four last characters of a key. */
export const keyLast4Schema = z.string().length(4).nullish();

/** EF-2 — a provider-side model identifier. */
export const modelIdSchema = z.string().trim().min(1).max(200);

/** EF-3, CL-2 — a token count is a non-negative integer. */
export const tokenCountSchema = z.int().min(0);

/** EF-3, CL-2 — a latency in milliseconds, never negative. */
export const latencyMsSchema = z.int().min(0);

/** EF-3, ET-1 — a cost in USD at `numeric(12,6)` precision, never negative. */
export const costUsdSchema = z
  .union([z.string(), z.number()])
  .transform((value) => {
    try {
      return normalizeUsd(value);
    } catch {
      return Number.NaN.toString();
    }
  })
  .pipe(z.string().regex(usdPattern, { message: 'coût USD non négatif attendu' }));

/** EF-1 — the qualification report is a JSON object of test results. */
export const qualificationSchema = z.record(z.string(), z.unknown());

/** EF-4, CA-4 — the daily cap is strictly positive at `numeric(12,6)` precision. */
export const dailyCapUsdSchema = z
  .union([z.string(), z.number()])
  .transform((value) => {
    try {
      return normalizeUsd(value);
    } catch {
      return Number.NaN.toString();
    }
  })
  .pipe(z.string().regex(usdPattern, { message: 'plafond USD positif attendu' }))
  .refine((value) => Number(value) > 0, { message: 'plafond USD positif attendu' });
