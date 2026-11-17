// Contracts of the offline mode (SPEC-801 ET-5, ET-6; ADR-0200). The daily pack carries the
// session of the day and up to twenty extra recall cards due tomorrow, with the full brick
// payloads so the browser can grade locally without ever calling the AI. The synchronisation
// input is the client queue without its local bookkeeping fields; the output is one result per
// entry, so a partially invalid batch still answers 200 (CL-11).
import { z } from 'zod';

import { CivilDate, IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';
import { GlobalQuizSessionDtoSchema } from './review';

/** Local state of a queued entry (never sent by the client). */
export const OfflineQueueStatusSchema = z.enum(['pending', 'syncing', 'rejected']);
export type OfflineQueueStatus = z.infer<typeof OfflineQueueStatusSchema>;

const OfflineEntryBase = {
  clientId: Uuid,
  formationId: Uuid,
  sessionId: Uuid,
  answeredAt: IsoDateTime,
} as const;

/** One queued answer or the completion of a session (ET-4, ET-7). */
export const OfflineAnswerEntrySchema = z
  .object({
    ...OfflineEntryBase,
    kind: z.literal('answer'),
    position: z.number().int().min(0),
    skipped: z.literal(true).optional(),
    brickVersionId: Uuid.optional(),
    response: z.unknown().optional(),
    timeMs: z.number().int().min(0).max(3_600_000).optional(),
    selfGrade: z.enum(['again', 'hard', 'good', 'easy']).optional(),
  })
  .strict();
export type OfflineAnswerEntry = z.infer<typeof OfflineAnswerEntrySchema>;

export const OfflineCompleteEntrySchema = z
  .object({
    ...OfflineEntryBase,
    kind: z.literal('complete'),
  })
  .strict();
export type OfflineCompleteEntry = z.infer<typeof OfflineCompleteEntrySchema>;

export const OfflineEntrySchema = z.discriminatedUnion('kind', [
  OfflineAnswerEntrySchema,
  OfflineCompleteEntrySchema,
]);
export type OfflineEntry = z.infer<typeof OfflineEntrySchema>;

/** ET-6 — at most 50 entries per call, in `answeredAt` order. */
export const OfflineSyncInputSchema = z
  .object({ entries: z.array(OfflineEntrySchema).min(1).max(50) })
  .strict();
export type OfflineSyncInput = z.infer<typeof OfflineSyncInputSchema>;

export const OFFLINE_SYNC_STATUSES = ['applied', 'duplicate', 'conflict', 'rejected'] as const;
export const OfflineSyncStatusSchema = z.enum(OFFLINE_SYNC_STATUSES);
export type OfflineSyncStatus = z.infer<typeof OfflineSyncStatusSchema>;

export const OFFLINE_SYNC_CODES = [
  'SESSION_NOT_FOUND',
  'EXPIRED',
  'INVALID_RESPONSE',
  'FORBIDDEN',
] as const;
export const OfflineSyncCodeSchema = z.enum(OFFLINE_SYNC_CODES);
export type OfflineSyncCode = z.infer<typeof OfflineSyncCodeSchema>;

export const OfflineSyncResultSchema = z
  .object({
    clientId: Uuid,
    status: OfflineSyncStatusSchema,
    code: OfflineSyncCodeSchema.optional(),
    correct: z.boolean().optional(),
    nextDueAt: IsoDateTime.optional(),
  })
  .strict();
export type OfflineSyncResult = z.infer<typeof OfflineSyncResultSchema>;

export const OfflineSyncResponseSchema = z
  .object({ results: z.array(OfflineSyncResultSchema) })
  .strict();
export type OfflineSyncResponse = z.infer<typeof OfflineSyncResponseSchema>;

/** ET-5 — one extra recall card of a notion due tomorrow. */
export const OfflineExtraCardSchema = z
  .object({
    brickVersionId: Uuid,
    notionId: Uuid,
    notionLabel: z.string().min(1),
    payload: z.unknown(),
  })
  .strict();
export type OfflineExtraCard = z.infer<typeof OfflineExtraCardSchema>;

export const OfflinePackSchema = z
  .object({
    formationId: Uuid,
    formationTitle: z.string().min(1),
    session: GlobalQuizSessionDtoSchema,
    extraCards: z.array(OfflineExtraCardSchema).max(20),
  })
  .strict();
export type OfflinePack = z.infer<typeof OfflinePackSchema>;

export const OfflinePackResponseSchema = z
  .object({
    ownerId: Uuid,
    localDate: CivilDate,
    generatedAt: IsoDateTime,
    expiresAt: IsoDateTime,
    formations: z.array(OfflinePackSchema),
  })
  .strict();
export type OfflinePackResponse = z.infer<typeof OfflinePackResponseSchema>;

export const offlinePack = defineRoute({
  id: 'offline.pack',
  method: 'GET',
  path: '/api/v1/offline/pack',
  auth: 'user',
  output: OfflinePackResponseSchema,
  successStatus: 200,
  rateLimit: 'default',
  summary:
    'Paquet hors ligne du jour : sessions actives et cartes de rappel du lendemain (SPEC-801).',
  errors: ['UNAUTHENTICATED', 'INTERNAL_ERROR'],
});

export const offlineSync = defineRoute({
  id: 'offline.sync',
  method: 'POST',
  path: '/api/v1/sync/offline-answers',
  auth: 'user',
  body: OfflineSyncInputSchema,
  output: OfflineSyncResponseSchema,
  successStatus: 200,
  rateLimit: 'default',
  summary: 'Synchronise les réponses données hors ligne, idempotent par clientId (SPEC-801).',
  errors: ['VALIDATION_FAILED', 'UNAUTHENTICATED', 'RATE_LIMITED', 'INTERNAL_ERROR'],
});

export const offlineRoutes = { offlinePack, offlineSync } as const;
