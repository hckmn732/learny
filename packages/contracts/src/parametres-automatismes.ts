import { z } from 'zod';

import { EchauffementParams, RemediationParams, RepriseParams } from './automations';
import type { AutomationKey } from './moteur-d-automatismes';

// Display catalogue of the ten automations of SCR-15 (SPEC-710 ET-4, BR-SET-04).
//
// The screen never hard-codes its own automation table: it reads these groups, settings fields and
// parameter schemas. The engine of SPEC-711 remains the source of the runtime definitions; this
// module fixes the display order (1/2/9, 3/6/7, 4/5/8 then the pause card) and the canonical
// parameter object of each automation, so the settings service can validate a field even before
// its definition is registered by SPEC-713 to SPEC-721.

export const AUTOMATION_GROUP_IDS = ['decrochage', 'memoire', 'quiz'] as const;
export const AutomationGroupId = z.enum(AUTOMATION_GROUP_IDS);
export type AutomationGroupId = z.infer<typeof AutomationGroupId>;

export interface AutomationGroupDefinition {
  id: AutomationGroupId;
  keys: readonly AutomationKey[];
}

/** BR-SET-04 — the three groups in the order of the mockup. The pause card is rendered alone. */
export const AUTOMATION_GROUPS: readonly AutomationGroupDefinition[] = [
  { id: 'decrochage', keys: ['reprise', 'micro_seance', 'bilan'] },
  { id: 'memoire', keys: ['echauffement', 'questions_cartes', 'plafond_quiz'] },
  { id: 'quiz', keys: ['remediation', 'jeu_lacune', 'sprint'] },
] as const;

/** The tenth automation (SPEC-721): its switch and settings live in the Mode pause card. */
export const AUTOMATION_PAUSE_KEY = 'pause' as const;

/** How a settings field is stored in `automation_settings.params`. */
export const AutomationSettingFieldType = z.enum(['select', 'switch']);
export type AutomationSettingFieldType = z.infer<typeof AutomationSettingFieldType>;

/** Where the option list comes from: a fixed list, or the upcoming Sundays of the profile zone. */
export const AutomationSettingOptionSource = z.enum(['fixed', 'pauseDates']);
export type AutomationSettingOptionSource = z.infer<typeof AutomationSettingOptionSource>;

export const AutomationSettingField = z.object({
  /** Key of the JSON object `automation_settings.params`. */
  param: z.string().min(1).max(60),
  type: AutomationSettingFieldType,
  /** Type of the value written back to Postgres; the select sends a string. */
  valueType: z.enum(['string', 'number', 'boolean']),
  /** Canonical default, rendered until the learner changes the field. */
  defaultValue: z.string(),
  /** `fixed`: ordered option values; `pauseDates`: computed from the injected clock and zone. */
  optionsSource: AutomationSettingOptionSource.default('fixed'),
  options: z.array(z.string().min(1)).default([]),
});
export type AutomationSettingField = z.infer<typeof AutomationSettingField>;

export const AutomationDisplayDefinition = z.object({
  key: z.enum([
    'reprise',
    'micro_seance',
    'echauffement',
    'remediation',
    'jeu_lacune',
    'questions_cartes',
    'plafond_quiz',
    'sprint',
    'bilan',
    'pause',
  ]),
  group: z.union([AutomationGroupId, z.literal('pause')]),
  /** The journal shows « Annuler » only while the action is applied and not consumed. */
  canUndo: z.boolean().default(true),
  settings: z.array(AutomationSettingField),
});
export type AutomationDisplayDefinition = z.infer<typeof AutomationDisplayDefinition>;

const numberField = (
  param: string,
  defaultValue: number,
  options: readonly number[],
): AutomationSettingField => ({
  param,
  type: 'select',
  valueType: 'number',
  defaultValue: String(defaultValue),
  optionsSource: 'fixed',
  options: options.map(String),
});

const stringField = (
  param: string,
  defaultValue: string,
  options: readonly string[],
): AutomationSettingField => ({
  param,
  type: 'select',
  valueType: 'string',
  defaultValue,
  optionsSource: 'fixed',
  options: [...options],
});

const switchField = (param: string, defaultValue: boolean): AutomationSettingField => ({
  param,
  type: 'switch',
  valueType: 'boolean',
  defaultValue: String(defaultValue),
  optionsSource: 'fixed',
  options: [],
});

/** The ten automations, exactly once, in the order of BR-SET-04 and of the mockup. */
export const AUTOMATION_DISPLAY_DEFINITIONS: readonly AutomationDisplayDefinition[] = [
  {
    key: 'reprise',
    group: 'decrochage',
    canUndo: true,
    settings: [
      numberField('inactiveDays', 2, [1, 2, 3]),
      numberField('lightenDays', 5, [4, 5, 7]),
      stringField('mode', 'accord', ['auto', 'accord']),
    ],
  },
  {
    key: 'micro_seance',
    group: 'decrochage',
    canUndo: true,
    settings: [numberField('hour', 20, [19, 20, 21]), numberField('durationMin', 5, [3, 5, 10])],
  },
  {
    key: 'bilan',
    group: 'decrochage',
    canUndo: true,
    settings: [
      numberField('weekday', 7, [5, 6, 7]),
      numberField('hour', 19, [18, 19, 20]),
      stringField('channel', 'app', ['app', 'app_email']),
    ],
  },
  {
    key: 'echauffement',
    group: 'memoire',
    canUndo: true,
    settings: [
      numberField('count', 3, [2, 3, 5]),
      stringField('scope', 'yesterday_prerequisites', ['yesterday_prerequisites', 'yesterday']),
    ],
  },
  {
    key: 'questions_cartes',
    group: 'memoire',
    canUndo: true,
    settings: [stringField('mode', 'confirm', ['confirm', 'auto'])],
  },
  {
    key: 'plafond_quiz',
    group: 'memoire',
    canUndo: true,
    settings: [
      numberField('maxMinutes', 15, [10, 15, 20, 30]),
      numberField('targetRetention', 0.9, [0.85, 0.9, 0.95]),
    ],
  },
  {
    key: 'remediation',
    group: 'quiz',
    canUndo: true,
    settings: [
      numberField('delayHours', 24, [0, 12, 24, 48]),
      stringField('mode', 'advised', ['advised', 'mandatory']),
    ],
  },
  {
    key: 'jeu_lacune',
    group: 'quiz',
    canUndo: true,
    settings: [stringField('preference', 'vary', ['vary', 'cards', 'matching'])],
  },
  {
    key: 'sprint',
    group: 'quiz',
    canUndo: true,
    settings: [
      numberField('daysBefore', 3, [2, 3, 5]),
      numberField('durationMin', 30, [15, 30, 45]),
    ],
  },
  {
    key: AUTOMATION_PAUSE_KEY,
    group: 'pause',
    canUndo: false,
    settings: [
      {
        param: 'pauseUntil',
        type: 'select',
        valueType: 'string',
        defaultValue: '',
        optionsSource: 'pauseDates',
        options: [],
      },
      switchField('diagnosticOnReturn', true),
    ],
  },
] as const;

const definitionByKey = new Map(
  AUTOMATION_DISPLAY_DEFINITIONS.map((definition) => [definition.key, definition]),
);

/** The display definition of a key, or `undefined` for an unknown key. */
export function automationDisplayDefinition(
  key: AutomationKey,
): AutomationDisplayDefinition | undefined {
  return definitionByKey.get(key);
}

/* ------------------------------------------------------------------ */
/* Canonical parameter schemas (SPEC-710, BR-SET-04)                    */
/* ------------------------------------------------------------------ */

/** SPEC-713 — micro-session proposed in the evening, lasting three, five or ten minutes. */
export const MicroSeanceParams = z.object({
  hour: z.union([z.literal(19), z.literal(20), z.literal(21)]).default(20),
  durationMin: z.union([z.literal(3), z.literal(5), z.literal(10)]).default(5),
});
export type MicroSeanceParams = z.infer<typeof MicroSeanceParams>;

/** SPEC-720 — weekly review on Friday, Saturday or Sunday, at 18:00, 19:00 or 20:00. */
export const BilanParams = z.object({
  weekday: z.union([z.literal(5), z.literal(6), z.literal(7)]).default(7),
  hour: z.union([z.literal(18), z.literal(19), z.literal(20)]).default(19),
  channel: z.enum(['app', 'app_email']).default('app'),
});
export type BilanParams = z.infer<typeof BilanParams>;

/** SPEC-717 — a question becomes a card with confirmation, or automatically. */
export const QuestionsCartesParams = z.object({
  mode: z.enum(['confirm', 'auto']).default('confirm'),
});
export type QuestionsCartesParams = z.infer<typeof QuestionsCartesParams>;

/** SPEC-718 — daily review capped in minutes, with the target retention. */
export const PlafondQuizParams = z.object({
  maxMinutes: z.union([z.literal(10), z.literal(15), z.literal(20), z.literal(30)]).default(15),
  targetRetention: z.union([z.literal(0.85), z.literal(0.9), z.literal(0.95)]).default(0.9),
});
export type PlafondQuizParams = z.infer<typeof PlafondQuizParams>;

/** SPEC-716 — the preferred game family when a gap is detected. */
export const JeuLacuneParams = z.object({
  preference: z.enum(['vary', 'cards', 'matching']).default('vary'),
});
export type JeuLacuneParams = z.infer<typeof JeuLacuneParams>;

/** SPEC-719 — sprint starting two, three or five days before a milestone. */
export const SprintParams = z.object({
  daysBefore: z.union([z.literal(2), z.literal(3), z.literal(5)]).default(3),
  durationMin: z.number().int().min(5).max(120).default(30),
});
export type SprintParams = z.infer<typeof SprintParams>;

/** SPEC-721 — the pause card of SCR-15: end date and return diagnostic. */
export const PauseParams = z.strictObject({
  pauseUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date civile AAAA-MM-JJ attendue')
    .optional(),
  diagnosticOnReturn: z.boolean().default(true),
  diagnosticMinutes: z.number().int().min(5).max(30).default(10),
});
export type PauseParams = z.infer<typeof PauseParams>;

/** ET-4 — one canonical schema per automation, including the keys not registered yet. */
export const AUTOMATION_PARAM_SCHEMAS = {
  reprise: RepriseParams,
  micro_seance: MicroSeanceParams,
  echauffement: EchauffementParams,
  remediation: RemediationParams,
  jeu_lacune: JeuLacuneParams,
  questions_cartes: QuestionsCartesParams,
  plafond_quiz: PlafondQuizParams,
  sprint: SprintParams,
  bilan: BilanParams,
  pause: PauseParams,
} as const satisfies Record<AutomationKey, z.ZodType>;

/** The canonical schema of an automation; always defined for the ten keys of V1. */
export function automationParamsSchema(key: AutomationKey): z.ZodType {
  return AUTOMATION_PARAM_SCHEMAS[key];
}
