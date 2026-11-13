import { z } from 'zod';

import { CivilDate, IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';

// Contracts of the proposed programme (SPEC-605 EF-1 to EF-5, ET-3; BR-FOR-04 to BR-FOR-06).
// A proposal is an ordered list of modules, each with ordered chapters and at least one notion.
// The tutor output (draft) has no positions: the service numbers it. A stored proposal and every
// API answer carry positions so a duplicate or a missing order is rejected before any write.

/** BR-FOR-04 — the tutor proposed it, or the learner imported and the tutor structured it. */
export const PROGRAMME_SOURCES = ['generated', 'imported'] as const;
export const ProgrammeSource = z.enum(PROGRAMME_SOURCES);
export type ProgrammeSource = z.infer<typeof ProgrammeSource>;

/** BR-FOR-06, ADR-0014 — 80 % by default, adjustable from 60 % to 95 %. */
export const PROGRAMME_THRESHOLD = { min: 60, max: 95, default: 80 } as const;

export const PROGRAMME_MODULE_STATUSES = ['locked', 'open', 'validated'] as const;
export const ProgrammeModuleStatus = z.enum(PROGRAMME_MODULE_STATUSES);
export type ProgrammeModuleStatus = z.infer<typeof ProgrammeModuleStatus>;

export const PROGRAMME_FORMATION_STATUSES = [
  'cadrage',
  'programme_proposed',
  'active',
  'paused',
  'completed',
  'archived',
] as const;
export const ProgrammeFormationStatus = z.enum(PROGRAMME_FORMATION_STATUSES);
export type ProgrammeFormationStatus = z.infer<typeof ProgrammeFormationStatus>;

export const ProgrammeNotionSchema = z.strictObject({
  label: z.string().trim().min(1).max(120),
  definition: z.string().trim().min(1).max(400),
});
export type ProgrammeNotion = z.infer<typeof ProgrammeNotionSchema>;

const chapterShape = {
  position: z.number().int().min(1).max(100),
  title: z.string().trim().min(1).max(160),
  notions: z.array(ProgrammeNotionSchema).min(1).max(30),
};

/** A chapter never carries the same notion twice (accent and case insensitive). */
export const ProgrammeChapterSchema = z.strictObject(chapterShape).superRefine((chapter, ctx) => {
  const seen = new Set<string>();
  for (const notion of chapter.notions) {
    const key = normalizeLabel(notion.label);
    if (seen.has(key)) {
      ctx.addIssue({
        code: 'custom',
        path: ['notions'],
        message: `La notion « ${notion.label} » est présente deux fois dans ce chapitre.`,
      });
    }
    seen.add(key);
  }
});
export type ProgrammeChapter = z.infer<typeof ProgrammeChapterSchema>;

const moduleShape = {
  position: z.number().int().min(1).max(100),
  title: z.string().trim().min(1).max(160),
  objectives: z.array(z.string().trim().min(1).max(200)).min(1).max(8),
  plannedStart: CivilDate,
  plannedEnd: CivilDate,
  threshold: z
    .number()
    .int()
    .min(PROGRAMME_THRESHOLD.min)
    .max(PROGRAMME_THRESHOLD.max)
    .default(PROGRAMME_THRESHOLD.default),
  chapters: z.array(ProgrammeChapterSchema).min(1).max(40),
};

export const ProgrammeModuleSchema = z.strictObject(moduleShape);
export type ProgrammeModule = z.infer<typeof ProgrammeModuleSchema>;

export const ProgrammeModuleDtoSchema = z.strictObject({
  ...moduleShape,
  status: ProgrammeModuleStatus.nullable(),
});
export type ProgrammeModuleDto = z.infer<typeof ProgrammeModuleDtoSchema>;

export const ProgrammeVersionSummarySchema = z.strictObject({
  version: z.number().int().min(1),
  source: ProgrammeSource,
  createdAt: IsoDateTime,
  current: z.boolean(),
});
export type ProgrammeVersionSummary = z.infer<typeof ProgrammeVersionSummarySchema>;

/** Stored payload: everything required to rebuild the structure, with ordered positions. */
export const ProgrammeProposalPayloadSchema = z
  .strictObject({
    description: z.string().trim().max(2000).nullable().default(null),
    volumeHours: z.number().int().min(1).max(2000).nullable().default(null),
    summary: z.string().trim().max(1000).nullable().default(null),
    modules: z.array(ProgrammeModuleSchema).min(1).max(20),
  })
  .superRefine((payload, ctx) => {
    checkModules(payload.modules, ctx);
  });
export type ProgrammeProposalPayload = z.infer<typeof ProgrammeProposalPayloadSchema>;

/** Model output of one generation, import or adjustment: no position, numbered by the service. */
const draftChapterShape = {
  title: z.string().trim().min(1).max(160),
  notions: z.array(ProgrammeNotionSchema).min(1).max(30),
};

const draftChapterSchema = z.strictObject(draftChapterShape).superRefine((chapter, ctx) => {
  checkNotions(chapter.notions, ctx);
});

const draftModuleShape = {
  title: z.string().trim().min(1).max(160),
  objectives: z.array(z.string().trim().min(1).max(200)).min(1).max(8),
  plannedStart: CivilDate,
  plannedEnd: CivilDate,
  threshold: z
    .number()
    .int()
    .min(PROGRAMME_THRESHOLD.min)
    .max(PROGRAMME_THRESHOLD.max)
    .default(PROGRAMME_THRESHOLD.default),
  chapters: z.array(draftChapterSchema).min(1).max(40),
};

export const ProgrammeDraftModuleSchema = z.strictObject(draftModuleShape);
export type ProgrammeDraftModule = z.infer<typeof ProgrammeDraftModuleSchema>;

export const ProgrammeDraftSchema = z
  .strictObject({
    description: z.string().trim().max(2000).nullable().default(null),
    volumeHours: z.number().int().min(1).max(2000).nullable().default(null),
    summary: z.string().trim().max(1000).nullable().default(null),
    modules: z.array(ProgrammeDraftModuleSchema).min(1).max(20),
  })
  .superRefine((draft, ctx) => {
    checkModuleDates(draft.modules, ctx);
  });
export type ProgrammeDraft = z.infer<typeof ProgrammeDraftSchema>;

export const ProgrammeProposalDtoSchema = z.strictObject({
  formationId: Uuid,
  version: z.number().int().min(1),
  source: ProgrammeSource,
  proposalStatus: z.enum(['proposed', 'active']),
  title: z.string().min(1).max(120),
  description: z.string().max(2000).nullable(),
  summary: z.string().max(1000).nullable(),
  volumeHours: z.number().int().min(1).max(2000).nullable(),
  createdAt: IsoDateTime,
  modules: z.array(ProgrammeModuleDtoSchema).min(1).max(20),
  versions: z.array(ProgrammeVersionSummarySchema),
  activeFormationCount: z.number().int().min(0),
});
export type ProgrammeProposalDto = z.infer<typeof ProgrammeProposalDtoSchema>;

/** Whole screen state: a formation may be proposed, active, or still waiting for generation. */
export const ProgrammeProposalStateDto = z.strictObject({
  formationId: Uuid,
  title: z.string().min(1).max(120),
  description: z.string().max(2000).nullable(),
  formationStatus: ProgrammeFormationStatus,
  cadrageCompleted: z.boolean(),
  proposal: ProgrammeProposalDtoSchema.nullable(),
});
export type ProgrammeProposalStateDto = z.infer<typeof ProgrammeProposalStateDto>;

// Active programme screen (SPEC-606 EF-1 to EF-4, ET-3, ET-5; BR-FOR-07 to BR-FOR-09, BR-PRO-01).
// The DTO is computed from persisted rows only: module_progress is the source of truth for the
// learner's module statuses, chapters come from the ordered structure, and the calendar entries
// carry the civil dates and quiz markers used by the Gantt.

export const ACTIVE_PROGRAMME_FORMATION_STATUSES = ['active', 'paused', 'completed'] as const;
export const ActiveProgrammeFormationStatus = z.enum(ACTIVE_PROGRAMME_FORMATION_STATUSES);
export type ActiveProgrammeFormationStatus = z.infer<typeof ActiveProgrammeFormationStatus>;

/** BR-PRO-01 — the exact counts stay in the API; `percent` is the rounded display value. */
export const ProgrammeProgressSchema = z.strictObject({
  validated: z.number().int().min(0),
  total: z.number().int().min(0),
  percent: z.number().int().min(0).max(100),
});
export type ProgrammeProgress = z.infer<typeof ProgrammeProgressSchema>;

export const ActiveProgrammeFormationSchema = z.strictObject({
  id: Uuid,
  title: z.string().min(1).max(120),
  description: z.string().max(2000).nullable(),
  objectives: z.array(z.string().min(1).max(200)),
  volumeHours: z.number().int().min(1).max(2000).nullable(),
  startDate: CivilDate.nullable(),
  endDate: CivilDate.nullable(),
  threshold: z.number().int().min(PROGRAMME_THRESHOLD.min).max(PROGRAMME_THRESHOLD.max),
  status: ActiveProgrammeFormationStatus,
});
export type ActiveProgrammeFormationDto = z.infer<typeof ActiveProgrammeFormationSchema>;

export const ActiveProgrammeIndicatorsSchema = z.strictObject({
  progress: ProgrammeProgressSchema,
  weeks: z.number().int().min(1).max(104),
  volumeHours: z.number().int().min(1).max(2000).nullable(),
  threshold: z.number().int().min(PROGRAMME_THRESHOLD.min).max(PROGRAMME_THRESHOLD.max),
  hoursPerDay: z.number().int().min(1).max(6),
  studyDaysPerWeek: z.number().int().min(1).max(7),
});
export type ActiveProgrammeIndicatorsDto = z.infer<typeof ActiveProgrammeIndicatorsSchema>;

export const ProgrammeQuizKind = z.enum(['quiz', 'exam']);
export type ProgrammeQuizKind = z.infer<typeof ProgrammeQuizKind>;

export const ActiveProgrammeModuleSchema = z.strictObject({
  id: Uuid,
  position: z.number().int().min(1).max(100),
  title: z.string().min(1).max(160),
  objectives: z.array(z.string().min(1).max(200)),
  plannedStart: CivilDate,
  plannedEnd: CivilDate,
  threshold: z.number().int().min(PROGRAMME_THRESHOLD.min).max(PROGRAMME_THRESHOLD.max),
  status: ProgrammeModuleStatus,
  score: z.number().min(0).max(100).nullable(),
  quizOn: CivilDate,
  quizKind: ProgrammeQuizKind,
  /** BR-FOR-08 — the module whose quiz unlocks this locked module, null when not locked. */
  unlockAfterPosition: z.number().int().min(1).max(99).nullable(),
  /** ET-4 — null for a locked module: no active access link reaches it. */
  href: z.string().min(1).max(512).nullable(),
});
export type ActiveProgrammeModuleDto = z.infer<typeof ActiveProgrammeModuleSchema>;

export const ActiveProgrammeChapterSchema = z.strictObject({
  id: Uuid,
  moduleId: Uuid,
  position: z.number().int().min(1).max(100),
  title: z.string().min(1).max(160),
  contributionsStatus: z.enum(['in_progress', 'done']),
  courseHref: z.string().min(1).max(512),
});
export type ActiveProgrammeChapterDto = z.infer<typeof ActiveProgrammeChapterSchema>;

export const ProgrammeCalendarEntrySchema = z.strictObject({
  moduleId: Uuid,
  position: z.number().int().min(1).max(100),
  title: z.string().min(1).max(160),
  start: CivilDate,
  end: CivilDate,
  status: ProgrammeModuleStatus,
  quizOn: CivilDate,
  quizKind: ProgrammeQuizKind,
});
export type ProgrammeCalendarEntryDto = z.infer<typeof ProgrammeCalendarEntrySchema>;

export const ActiveProgrammeDto = z.strictObject({
  formation: ActiveProgrammeFormationSchema,
  indicators: ActiveProgrammeIndicatorsSchema,
  modules: z.array(ActiveProgrammeModuleSchema).min(1).max(20),
  chapters: z.array(ActiveProgrammeChapterSchema).max(1000),
  calendar: z.array(ProgrammeCalendarEntrySchema).min(1).max(20),
  /** ET-2, CL-5 — local civil day of the learner, in the profile IANA zone. */
  today: CivilDate,
  timeZone: z.string().min(1).max(64),
});
export type ActiveProgrammeDto = z.infer<typeof ActiveProgrammeDto>;

/** GET /formations/:fid/programme answers the proposal state or the active programme. */
export const ProgrammeScreenStateDto = z.union([ProgrammeProposalStateDto, ActiveProgrammeDto]);
export type ProgrammeScreenStateDto = z.infer<typeof ProgrammeScreenStateDto>;

export function isActiveProgramme(value: ProgrammeScreenStateDto): value is ActiveProgrammeDto {
  return 'formation' in value && 'calendar' in value;
}

export const GenerateProgrammeInput = z.strictObject({
  expectedVersion: z.number().int().min(0).default(0),
});
export type GenerateProgrammeInput = z.input<typeof GenerateProgrammeInput>;

const importBase = {
  expectedVersion: z.number().int().min(0).default(0),
};

/** EF-2 — a pasted text, or a file whose bytes are sent as base64 (private, never returned). */
export const ImportProgrammeInput = z.discriminatedUnion('kind', [
  z.strictObject({
    ...importBase,
    kind: z.literal('text'),
    text: z.string().max(200_000),
  }),
  z.strictObject({
    ...importBase,
    kind: z.literal('file'),
    filename: z.string().trim().min(1).max(200),
    /** 700 kB of bytes at most: the API body stays under its 1 MiB limit. */
    contentBase64: z
      .string()
      .min(1)
      .max(950_000)
      .regex(/^[A-Za-z0-9+/]*={0,2}$/, 'Contenu base64 invalide.'),
  }),
]);
export type ImportProgrammeInput = z.input<typeof ImportProgrammeInput>;

export const AdjustProgrammeInput = z.strictObject({
  expectedVersion: z.number().int().min(1),
  message: z.string().trim().min(1).max(2000),
});
export type AdjustProgrammeInput = z.input<typeof AdjustProgrammeInput>;

export const ValidateProgrammeInput = z.strictObject({
  expectedVersion: z.number().int().min(1),
});
export type ValidateProgrammeInput = z.input<typeof ValidateProgrammeInput>;

export const ProgrammeGetQuery = z.strictObject({
  version: z.coerce.number().int().min(1).optional(),
});
export type ProgrammeGetQuery = z.infer<typeof ProgrammeGetQuery>;

const idParams = z.object({ fid: Uuid });

const programmeErrors = [
  'VALIDATION_FAILED',
  'PROGRAMME_INCOMPLETE',
  'FORMATION_LIMIT_REACHED',
  'CONFLICT',
  'NOT_FOUND',
  'UNAUTHENTICATED',
  'INTERNAL_ERROR',
] as const;

export const programmeRoutes = {
  programmeGet: defineRoute({
    id: 'programme.get',
    method: 'GET',
    path: '/api/v1/formations/:fid/programme',
    auth: 'user',
    params: idParams,
    query: ProgrammeGetQuery,
    output: ProgrammeScreenStateDto,
    successStatus: 200,
    summary: 'Proposition courante, ou programme en cours, d’une formation (SPEC-605, SPEC-606).',
    errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'UNAUTHENTICATED', 'INTERNAL_ERROR'],
  }),
  programmeGenerate: defineRoute({
    id: 'programme.generate',
    method: 'POST',
    path: '/api/v1/formations/:fid/programme/generate',
    auth: 'user',
    params: idParams,
    body: GenerateProgrammeInput,
    output: ProgrammeProposalStateDto,
    successStatus: 200,
    idempotent: true,
    rateLimit: 'ai',
    summary: 'Génère une proposition de programme depuis le cadrage figé (SPEC-605).',
    errors: [
      ...programmeErrors,
      'CADRAGE_INCOMPLETE',
      'AI_UNAVAILABLE',
      'AI_TASK_FAILED',
      'AI_RATE_LIMITED',
      'RATE_LIMITED',
      'IDEMPOTENCY_KEY_REQUIRED',
    ],
  }),
  programmeImport: defineRoute({
    id: 'programme.import',
    method: 'POST',
    path: '/api/v1/formations/:fid/programme/import',
    auth: 'user',
    params: idParams,
    body: ImportProgrammeInput,
    output: ProgrammeProposalStateDto,
    successStatus: 200,
    idempotent: true,
    rateLimit: 'ai',
    summary: 'Importe un texte ou un fichier et le structure en proposition (SPEC-605).',
    errors: [
      ...programmeErrors,
      'EXTRACTION_FAILED',
      'UNSUPPORTED_TYPE',
      'TEXT_EMPTY',
      'AI_UNAVAILABLE',
      'AI_TASK_FAILED',
      'AI_RATE_LIMITED',
      'RATE_LIMITED',
      'IDEMPOTENCY_KEY_REQUIRED',
    ],
  }),
  programmeAdjust: defineRoute({
    id: 'programme.adjust',
    method: 'POST',
    path: '/api/v1/formations/:fid/programme/adjust',
    auth: 'user',
    params: idParams,
    body: AdjustProgrammeInput,
    output: ProgrammeProposalStateDto,
    successStatus: 200,
    idempotent: true,
    rateLimit: 'ai',
    summary: 'Ajuste la proposition avec le tuteur et crée une version (SPEC-605).',
    errors: [
      ...programmeErrors,
      'AI_UNAVAILABLE',
      'AI_TASK_FAILED',
      'AI_RATE_LIMITED',
      'RATE_LIMITED',
      'IDEMPOTENCY_KEY_REQUIRED',
    ],
  }),
  programmeValidate: defineRoute({
    id: 'programme.validate',
    method: 'POST',
    path: '/api/v1/formations/:fid/programme/validate',
    auth: 'user',
    params: idParams,
    body: ValidateProgrammeInput,
    output: ProgrammeProposalStateDto,
    successStatus: 200,
    idempotent: true,
    summary: 'Active la proposition : modules, chapitres, notions et planification (SPEC-605).',
    errors: [...programmeErrors, 'IDEMPOTENCY_KEY_REQUIRED', 'RATE_LIMITED'],
  }),
} as const;

function normalizeLabel(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function checkNotions(notions: readonly { label: string }[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  for (const notion of notions) {
    const key = normalizeLabel(notion.label);
    if (seen.has(key)) {
      ctx.addIssue({
        code: 'custom',
        path: ['notions'],
        message: `La notion « ${notion.label} » est présente deux fois dans ce chapitre.`,
      });
    }
    seen.add(key);
  }
}

interface DatedModule {
  plannedStart: string;
  plannedEnd: string;
}

function checkModuleDates(modules: readonly DatedModule[], ctx: z.RefinementCtx): void {
  modules.forEach((module, index) => {
    if (module.plannedEnd < module.plannedStart) {
      ctx.addIssue({
        code: 'custom',
        path: ['modules', index, 'plannedEnd'],
        message: 'La date de fin du module précède sa date de début.',
      });
    }
    const previous = modules[index - 1];
    if (previous !== undefined && module.plannedStart < previous.plannedStart) {
      ctx.addIssue({
        code: 'custom',
        path: ['modules', index, 'plannedStart'],
        message: 'Les modules doivent être ordonnés par date de début.',
      });
    }
  });
}

function checkModules(
  modules: readonly {
    position: number;
    plannedStart: string;
    plannedEnd: string;
    chapters: readonly { position: number }[];
  }[],
  ctx: z.RefinementCtx,
): void {
  checkModuleDates(modules, ctx);
  const modulePositions = new Set<number>();
  modules.forEach((module, moduleIndex) => {
    if (modulePositions.has(module.position)) {
      ctx.addIssue({
        code: 'custom',
        path: ['modules', moduleIndex, 'position'],
        message: 'Deux modules partagent la même position.',
      });
    }
    modulePositions.add(module.position);
    const chapterPositions = new Set<number>();
    module.chapters.forEach((chapter, chapterIndex) => {
      if (chapterPositions.has(chapter.position)) {
        ctx.addIssue({
          code: 'custom',
          path: ['modules', moduleIndex, 'chapters', chapterIndex, 'position'],
          message: 'Deux chapitres partagent la même position.',
        });
      }
      chapterPositions.add(chapter.position);
    });
  });
}
