import { z } from 'zod';

import { IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';

// Contracts of the personal-data services (SPEC-211 ET-1, EF-1 to EF-9): self-service export and
// account deletion. The interface of SPEC-707 delegates entirely to these routes.
export const EXPORT_STATUSES = ['queued', 'running', 'done', 'failed'] as const;
export const ExportStatus = z.enum(EXPORT_STATUSES);
export type ExportStatus = z.infer<typeof ExportStatus>;

export const ExportRequestOutput = z.object({
  exportId: Uuid,
  status: ExportStatus,
});
export type ExportRequestOutput = z.infer<typeof ExportRequestOutput>;

export const ExportState = z.object({
  id: Uuid,
  status: ExportStatus,
  sizeBytes: z.int().min(0).nullable(),
  createdAt: IsoDateTime,
  expiresAt: IsoDateTime.nullable(),
  /** EF-2 — signed URL of ten minutes, present only for a done and unexpired export. */
  downloadUrl: z.url().optional(),
});
export type ExportState = z.infer<typeof ExportState>;

export const ExportParams = z.object({ id: Uuid });
export const ExportDownloadQuery = z.object({
  /** `?download=1` answers a 302 to a fresh signed URL. */
  download: z.literal('1').optional(),
});

export const DeletionState = z.object({ scheduledFor: IsoDateTime });
export type DeletionState = z.infer<typeof DeletionState>;

export const meExportRequest = defineRoute({
  id: 'me.export.request',
  method: 'POST',
  path: '/api/v1/me/export',
  auth: 'user',
  output: ExportRequestOutput,
  successStatus: 202,
  idempotent: true,
  summary: 'Demande un export ZIP des données personnelles (SPEC-211).',
  errors: ['EXPORT_LIMIT_REACHED', 'IDEMPOTENCY_IN_PROGRESS', 'IDEMPOTENCY_KEY_REUSED'],
});

export const meExportRead = defineRoute({
  id: 'me.export.read',
  method: 'GET',
  path: '/api/v1/me/exports/:id',
  auth: 'user',
  params: ExportParams,
  query: ExportDownloadQuery,
  output: ExportState,
  successStatus: 200,
  summary:
    'État d’un export, URL signée de dix minutes, ou redirection de téléchargement (SPEC-211).',
  errors: ['NOT_FOUND', 'EXPORT_EXPIRED'],
});

export const meDeletionSchedule = defineRoute({
  id: 'me.deletion.schedule',
  method: 'POST',
  path: '/api/v1/me/deletion',
  auth: 'user',
  output: DeletionState,
  successStatus: 200,
  summary: 'Programme la suppression du compte à J+30 (SPEC-211).',
  errors: ['NOT_FOUND'],
});

export const meDeletionCancel = defineRoute({
  id: 'me.deletion.cancel',
  method: 'DELETE',
  path: '/api/v1/me/deletion',
  auth: 'user',
  output: null,
  successStatus: 204,
  summary: 'Annule une suppression programmée (SPEC-211).',
  errors: [],
});

export const personalDataRoutes = {
  meExportRequest,
  meExportRead,
  meDeletionSchedule,
  meDeletionCancel,
} as const;

// Demonstration routes of SPEC-211 (`ENABLE_SDD_PAGES` only): real services on the demo dataset,
// a throwaway account for the J+30 execution and the memory e-mail outbox.
export const EmailLine = z.object({
  template: z.string(),
  to: z.string(),
  at: IsoDateTime,
});
export type EmailLine = z.infer<typeof EmailLine>;

export const DevExportOutput = z.object({
  export: ExportState,
  tree: z.array(z.string()),
  durationMs: z.number().int().min(0),
  emails: z.array(EmailLine),
});
export type DevExportOutput = z.infer<typeof DevExportOutput>;

export const DevDeletionOutput = z.object({
  scheduledFor: IsoDateTime.nullable(),
  emails: z.array(EmailLine),
});
export type DevDeletionOutput = z.infer<typeof DevDeletionOutput>;

export const DevExecutionTable = z.object({
  table: z.string(),
  remaining: z.number().int().min(0),
});
export type DevExecutionTable = z.infer<typeof DevExecutionTable>;
export const DevExecutionOutput = z.object({
  scheduledFor: IsoDateTime,
  tables: z.array(DevExecutionTable),
  authStatus: z.enum(['supprimé', 'présent']),
  emails: z.array(EmailLine),
});
export type DevExecutionOutput = z.infer<typeof DevExecutionOutput>;

export const devPersonalDataExport = defineRoute({
  id: 'dev.personal-data.export',
  method: 'POST',
  path: '/api/v1/dev/sdd/personal-data/export',
  auth: 'user',
  output: DevExportOutput,
  successStatus: 200,
  summary: 'Route de démonstration : export complet du jeu de démonstration (SPEC-211).',
  errors: ['EXPORT_LIMIT_REACHED', 'NOT_FOUND'],
});

export const devPersonalDataDeletion = defineRoute({
  id: 'dev.personal-data.deletion.schedule',
  method: 'POST',
  path: '/api/v1/dev/sdd/personal-data/deletion',
  auth: 'user',
  output: DevDeletionOutput,
  successStatus: 200,
  summary: 'Route de démonstration : programme la suppression à J+30 (SPEC-211).',
  errors: ['NOT_FOUND'],
});

export const devPersonalDataDeletionCancel = defineRoute({
  id: 'dev.personal-data.deletion.cancel',
  method: 'DELETE',
  path: '/api/v1/dev/sdd/personal-data/deletion',
  auth: 'user',
  output: DevDeletionOutput,
  successStatus: 200,
  summary: 'Route de démonstration : annule la suppression programmée (SPEC-211).',
  errors: [],
});

export const devPersonalDataExecute = defineRoute({
  id: 'dev.personal-data.execute',
  method: 'POST',
  path: '/api/v1/dev/sdd/personal-data/execute',
  auth: 'user',
  output: DevExecutionOutput,
  successStatus: 200,
  summary: 'Route de démonstration : suppression complète d’un compte jetable à J+30 (SPEC-211).',
  errors: ['NOT_FOUND'],
});

export const personalDataDevRoutes = {
  devPersonalDataExport,
  devPersonalDataDeletion,
  devPersonalDataDeletionCancel,
  devPersonalDataExecute,
} as const;

export type PersonalDataRoute = keyof typeof personalDataRoutes;
