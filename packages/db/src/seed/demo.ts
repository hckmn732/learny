// Seed transactionnelle du jeu de démonstration (SPEC-115 EF-1 à EF-6, ET-1 à ET-6, ADR-0250).
//
// Ordre des FK : comptes auth → profils → formations → programme → groupe → données personnelles →
// contenus → agenda/notifications/automatismes. Les identifiants sont fixes (UUID v5) : les données
// mutables sont mises à jour (`on conflict do update`) et les journaux append-only conservent leur
// première écriture (`do nothing`). Une seule transaction : toute erreur annule l'ensemble (CL-2).
import { createHash } from 'node:crypto';

import { SQL, sql } from 'drizzle-orm';

import { serviceDb, type DbTx } from '../client';

import {
  DEMO_AGENDA,
  DEMO_AGENDA_DAYS,
  DEMO_AUTOMATION_ACTIONS,
  DEMO_AUTOMATIONS,
  DEMO_DAILY_ACTIVITY,
  DEMO_EXPECTED,
  DEMO_FORMATIONS,
  DEMO_NOTIFICATION_SETTINGS,
  DEMO_NOTIFICATIONS,
  DEMO_NOTION_LINKS,
  DEMO_NOW_ISO,
  DEMO_PREFERENCES,
  DEMO_PROFILE,
  DEMO_USERS,
  demoChapterId,
  demoFormationId,
  demoId,
  demoModuleId,
  demoNotionId,
  demoUserId,
  demoFixtureFingerprint,
  parisInstant,
  SAP_FORMATION,
  type DemoFormationFixture,
  type DemoModuleFixture,
  type DemoNotionFixture,
} from './demo-fixtures';
import {
  assertDemoEnvironment,
  demoNow,
  describeSeedFailure,
  type DemoEnvironmentInput,
} from './demo-guard';

type SqlValue = string | number | boolean | null | SQL;

function tuple(values: readonly SqlValue[]): SQL {
  return sql`(${sql.join(
    values.map((value) => (value instanceof SQL ? value : sql`${value}`)),
    sql`, `,
  )})`;
}

function json(value: unknown): SQL {
  return sql`${JSON.stringify(value)}::jsonb`;
}

function array(values: readonly string[], cast: string): SQL {
  const escaped = values
    .map((value) => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`)
    .join(',');
  return sql`${`{${escaped}}`}::${sql.raw(cast)}`;
}

function timestamp(value: string): SQL {
  return sql`${value}::timestamptz`;
}

interface InsertOptions {
  conflict: string;
  mode?: 'update' | 'nothing';
  update?: readonly string[];
}

async function insertRows(
  tx: DbTx,
  table: string,
  columns: readonly string[],
  rows: readonly (readonly SqlValue[])[],
  options: InsertOptions,
): Promise<void> {
  if (rows.length === 0) return;
  const conflict = options.conflict.split(',').map((column) => column.trim());
  const mode = options.mode ?? 'update';
  const updates = (
    options.update ??
    columns.filter((column) => !conflict.includes(column) && column !== 'created_at')
  ).map((column) => sql`${sql.raw(column)} = excluded.${sql.raw(column)}`);
  const action =
    mode === 'nothing' || updates.length === 0
      ? sql`nothing`
      : sql`update set ${sql.join(updates, sql`, `)}`;
  await tx.execute(
    sql`insert into ${sql.raw(table)} (${sql.raw(columns.join(', '))}) values ${sql.join(
      rows.map((row) => tuple(row)),
      sql`, `,
    )} on conflict (${sql.raw(options.conflict)}) do ${action}`,
  );
}

function fingerprintOf(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function moduleStatus(
  formation: DemoFormationFixture,
  position: number,
): 'locked' | 'open' | 'validated' {
  if (formation.status === 'completed') return 'validated';
  if (formation.status !== 'active' || formation.currentModulePosition === null) return 'locked';
  if (position < formation.currentModulePosition) return 'validated';
  if (position === formation.currentModulePosition) return 'open';
  return 'locked';
}

interface SeededCatalog {
  formationIds: Map<string, string>;
  moduleIds: Map<string, string>;
  chapterIds: Map<string, string>;
  notionIds: Map<string, string>;
  notionIdBySlug: Map<string, string>;
  courseIds: Map<string, string>;
  activityIds: Map<string, string>;
  attemptIds: Map<string, string>;
  brickIds: string[];
  brickVersionIds: Map<string, string>;
  conversationIds: string[];
  groupId: string;
}

function findChapterId(
  formation: DemoFormationFixture['key'],
  module: DemoModuleFixture,
  notion: DemoNotionFixture,
): string {
  const chapter = module.chapters.find((entry) => entry.key === notion.chapterKey);
  if (chapter === undefined) throw new Error(`chapitre introuvable pour ${notion.key}`);
  const index = module.chapters.indexOf(chapter);
  return demoChapterId(formation, module.position, index + 1);
}

function fsrsCard(mastery: number, dueAt: string, lastReview: string, lapses: number): unknown {
  return {
    due: dueAt,
    stability: Math.max(0.5, Math.round((mastery / 100) * 120) / 10),
    difficulty: Math.max(1, Math.round((9 - mastery / 20) * 10) / 10),
    elapsed_days: 3,
    scheduled_days: 5,
    reps: Math.max(1, Math.round(mastery / 10)),
    lapses,
    state: 2,
    last_review: lastReview,
  };
}

function chapterNotionIds(module: DemoModuleFixture, chapterKeyValue: string): string[] {
  return module.notions
    .filter((notion) => notion.chapterKey === chapterKeyValue)
    .map((notion) => demoNotionId(notion.key));
}

function courseKey(owner: string, formation: string, modulePosition: number): string {
  return `${owner}:${formation}:m${String(modulePosition)}`;
}

// ---------------------------------------------------------------------------------------------
// 1. Comptes, profils et réglages
// ---------------------------------------------------------------------------------------------

async function seedAccounts(tx: DbTx): Promise<void> {
  const created: Record<string, string> = {
    alex: '2026-10-28T09:00:00+01:00',
    camille: '2026-10-30T10:00:00+01:00',
    hugo: '2026-10-30T10:05:00+01:00',
  };
  await insertRows(
    tx,
    'auth.users',
    [
      'id',
      'instance_id',
      'aud',
      'role',
      'email',
      'email_confirmed_at',
      'confirmation_token',
      'recovery_token',
      'email_change_token_new',
      'email_change',
      'email_change_token_current',
      'reauthentication_token',
      'raw_user_meta_data',
      'raw_app_meta_data',
      'created_at',
      'updated_at',
    ],
    DEMO_USERS.map((user) => {
      const at = created[user.key] ?? '2026-10-28T09:00:00+01:00';
      return [
        demoUserId(user.key),
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        user.email,
        timestamp(at),
        '',
        '',
        '',
        '',
        '',
        '',
        json({
          first_name: user.firstName,
          last_name: user.lastName,
          timezone: 'Europe/Paris',
          course_language: 'fr',
        }),
        json({ provider: 'email', providers: ['email'] }),
        timestamp(at),
        timestamp(at),
      ];
    }),
    { conflict: 'id' },
  );

  await insertRows(
    tx,
    'public.profiles',
    [
      'id',
      'email',
      'first_name',
      'last_name',
      'course_language',
      'tutor_tone',
      'timezone',
      'onboarding_step',
      'onboarding_completed_at',
      'terms_version',
      'terms_accepted_at',
      'sidebar_collapsed',
      'streak_days',
      'streak_computed_on',
      'created_at',
      'updated_at',
    ],
    DEMO_USERS.map((user) => {
      const at = created[user.key] ?? '2026-10-28T09:00:00+01:00';
      return [
        demoUserId(user.key),
        user.email,
        user.firstName,
        user.lastName,
        'fr',
        'vous',
        'Europe/Paris',
        'done',
        timestamp('2026-10-28T09:05:00+01:00'),
        '2026-10-01',
        timestamp('2026-10-28T09:05:00+01:00'),
        false,
        user.key === 'alex' ? DEMO_PROFILE.streakDays : 0,
        user.key === 'alex' ? DEMO_PROFILE.streakComputedOn : null,
        timestamp(at),
        timestamp(at),
      ];
    }),
    { conflict: 'id' },
  );

  await insertRows(
    tx,
    'public.study_preferences',
    ['user_id', 'hours_per_day', 'study_days', 'preferred_slots', 'updated_at'],
    DEMO_USERS.map((user) => [
      demoUserId(user.key),
      user.key === 'alex' ? DEMO_PREFERENCES.hoursPerDay : user.key === 'camille' ? 3 : 2,
      array(
        (user.key === 'alex' ? DEMO_PREFERENCES.studyDays : [1, 2, 3, 4, 5]).map(String),
        'smallint[]',
      ),
      array(
        user.key === 'alex' ? DEMO_PREFERENCES.preferredSlots : ['soir'],
        'public.study_slot[]',
      ),
      timestamp('2026-11-11T07:15:00+01:00'),
    ]),
    { conflict: 'user_id' },
  );

  await insertRows(
    tx,
    'public.notification_settings',
    [
      'user_id',
      'channel_email',
      'channel_push',
      'digest_time',
      'quiet_start',
      'quiet_end',
      'weekend_quiet',
      'max_per_day',
      'updated_at',
    ],
    DEMO_USERS.map((user) => [
      demoUserId(user.key),
      true,
      true,
      DEMO_NOTIFICATION_SETTINGS.digestTime,
      DEMO_NOTIFICATION_SETTINGS.quietStart,
      DEMO_NOTIFICATION_SETTINGS.quietEnd,
      DEMO_NOTIFICATION_SETTINGS.weekendQuiet,
      DEMO_NOTIFICATION_SETTINGS.maxPerDay,
      timestamp('2026-11-11T07:15:00+01:00'),
    ]),
    { conflict: 'user_id' },
  );

  const settingsRows = DEMO_USERS.flatMap((user) =>
    DEMO_AUTOMATIONS.map((automation) => [
      demoUserId(user.key),
      automation.key,
      automation.enabled,
      json(automation.params),
      timestamp('2026-11-11T07:15:00+01:00'),
    ]),
  );
  await insertRows(
    tx,
    'public.automation_settings',
    ['user_id', 'key', 'enabled', 'params', 'updated_at'],
    settingsRows,
    { conflict: 'user_id, key' },
  );
}

// ---------------------------------------------------------------------------------------------
// 2. Formations, programme, groupe
// ---------------------------------------------------------------------------------------------

async function seedFormations(tx: DbTx, catalog: SeededCatalog): Promise<void> {
  const rows = DEMO_FORMATIONS.map((formation) => {
    const id = demoFormationId(formation.key);
    catalog.formationIds.set(formation.key, id);
    const createdAt = `${formation.startDate ?? '2026-10-28'}T09:00:00+01:00`;
    return [
      id,
      demoUserId('alex'),
      formation.title,
      formation.monogram,
      formation.accentColor,
      formation.description,
      array(formation.objectives, 'public.formation_objective[]'),
      formation.status,
      json({
        scope: { value: formation.description, state: 'done' },
        starting_point: {
          value: formation.key === 'sap' ? 'Module 2 validé' : 'Début',
          state: 'done',
        },
        target_level: { value: 'Opérationnel', state: 'done' },
        volume: {
          value: formation.volumeHours === null ? null : `${String(formation.volumeHours)} h`,
          state: 'done',
        },
        dates: { value: formation.endDate, state: 'done' },
      }),
      formation.volumeHours,
      formation.startDate,
      formation.endDate,
      formation.defaultThreshold,
      formation.key === 'sap'
        ? json({ questions: 80, durationMin: 180, threshold: 80, confirmed: true })
        : null,
      formation.maintenanceMode,
      'fr',
      formation.status === 'active' ? timestamp(DEMO_NOW_ISO_LOCAL) : null,
      null,
      formation.status === 'completed' && formation.endDate !== null
        ? timestamp(`${formation.endDate}T18:00:00+01:00`)
        : null,
      timestamp(createdAt),
      timestamp(createdAt),
    ];
  });
  await insertRows(
    tx,
    'public.formations',
    [
      'id',
      'owner_id',
      'title',
      'monogram',
      'accent_color',
      'description',
      'objectives',
      'status',
      'cadrage_profile',
      'volume_hours',
      'start_date',
      'end_date',
      'default_threshold',
      'exam_format',
      'maintenance_mode',
      'course_language',
      'last_opened_at',
      'paused_at',
      'completed_at',
      'created_at',
      'updated_at',
    ],
    rows,
    { conflict: 'id' },
  );

  const modulesRows: (readonly SqlValue[])[] = [];
  const chaptersRows: (readonly SqlValue[])[] = [];
  const notionsRows: (readonly SqlValue[])[] = [];

  for (const formation of DEMO_FORMATIONS) {
    const formationId = demoFormationId(formation.key);
    for (const module of formation.modules) {
      const moduleId = demoModuleId(formation.key, module.position);
      catalog.moduleIds.set(module.key, moduleId);
      const status = moduleStatus(formation, module.position);
      const validatedAt = status === 'validated' ? `${module.plannedEnd}T18:00:00+01:00` : null;
      const openedAt =
        status === 'validated' || status === 'open'
          ? `${module.plannedStart}T09:00:00+01:00`
          : null;
      modulesRows.push([
        moduleId,
        formationId,
        module.position,
        module.title,
        array([], 'text[]'),
        module.plannedStart,
        module.plannedEnd,
        80,
        status,
        openedAt === null ? null : timestamp(openedAt),
        validatedAt === null ? null : timestamp(validatedAt),
        timestamp(`${module.plannedStart}T08:00:00+01:00`),
        timestamp(`${module.plannedStart}T08:00:00+01:00`),
      ]);

      for (const [chapterIndex, chapter] of module.chapters.entries()) {
        const chapterId = demoChapterId(formation.key, module.position, chapterIndex + 1);
        catalog.chapterIds.set(chapter.key, chapterId);
        chaptersRows.push([
          chapterId,
          moduleId,
          formationId,
          chapterIndex + 1,
          chapter.title,
          timestamp(`${module.plannedStart}T08:00:00+01:00`),
          timestamp(`${module.plannedStart}T08:00:00+01:00`),
        ]);
      }

      const positions = new Map<string, number>();
      for (const notion of module.notions) {
        const notionId = demoNotionId(notion.key);
        catalog.notionIds.set(notion.key, notionId);
        catalog.notionIdBySlug.set(notion.slug, notionId);
        const chapterId = findChapterId(formation.key, module, notion);
        const position = (positions.get(chapterId) ?? 0) + 1;
        positions.set(chapterId, position);
        notionsRows.push([
          notionId,
          formationId,
          moduleId,
          chapterId,
          notion.label,
          notion.definition,
          position,
          'tutor',
          timestamp(`${module.plannedStart}T08:00:00+01:00`),
          timestamp(`${module.plannedStart}T08:00:00+01:00`),
        ]);
      }
    }
  }

  await insertRows(
    tx,
    'public.modules',
    [
      'id',
      'formation_id',
      'position',
      'title',
      'objectives',
      'planned_start',
      'planned_end',
      'threshold',
      'status',
      'opened_at',
      'validated_at',
      'created_at',
      'updated_at',
    ],
    modulesRows,
    { conflict: 'id' },
  );
  await insertRows(
    tx,
    'public.chapters',
    ['id', 'module_id', 'formation_id', 'position', 'title', 'created_at', 'updated_at'],
    chaptersRows,
    { conflict: 'id' },
  );
  await insertRows(
    tx,
    'public.notions',
    [
      'id',
      'formation_id',
      'module_id',
      'chapter_id',
      'label',
      'short_definition',
      'position',
      'created_by',
      'created_at',
      'updated_at',
    ],
    notionsRows,
    { conflict: 'id' },
  );

  const linkRows = DEMO_NOTION_LINKS.map((link) => {
    const from = catalog.notionIdBySlug.get(link.from);
    const to = catalog.notionIdBySlug.get(link.to);
    if (from === undefined || to === undefined) {
      throw new Error(`lien de notion introuvable : ${link.from} → ${link.to}`);
    }
    // Une confusion est symétrique : la contrainte canonique impose from < to.
    const [left, right] = link.kind === 'confusion' && from > to ? [to, from] : [from, to];
    return [
      demoId('notion-link', link.from, link.to, link.kind),
      demoFormationId('sap'),
      left,
      right,
      link.kind,
      link.personal ? demoUserId('alex') : null,
      link.rationale,
      timestamp('2026-11-01T10:00:00+01:00'),
    ];
  });
  await insertRows(
    tx,
    'public.notion_links',
    [
      'id',
      'formation_id',
      'from_notion_id',
      'to_notion_id',
      'kind',
      'owner_id',
      'rationale',
      'created_at',
    ],
    linkRows,
    { conflict: 'id' },
  );

  // Le groupe partage la formation agile ; la FK cyclique est posée après l'insertion du groupe.
  const groupId = demoId('group', 'agile');
  catalog.groupId = groupId;
  await insertRows(
    tx,
    'public.groups',
    [
      'id',
      'formation_id',
      'owner_id',
      'invite_code',
      'max_members',
      'created_at',
      'code_rotated_at',
    ],
    [
      [
        groupId,
        demoFormationId('agile'),
        demoUserId('alex'),
        'LRN-AG24',
        10,
        timestamp('2026-10-26T09:00:00+01:00'),
        timestamp('2026-10-26T09:00:00+01:00'),
      ],
    ],
    { conflict: 'id' },
  );
  await tx.execute(
    sql`update public.formations set group_id = ${groupId}::uuid where id = ${demoFormationId('agile')}::uuid`,
  );
  await insertRows(
    tx,
    'public.group_members',
    ['group_id', 'user_id', 'role', 'member_status', 'joined_at', 'left_at'],
    [
      [
        groupId,
        demoUserId('alex'),
        'owner',
        'active',
        timestamp('2026-10-26T09:00:00+01:00'),
        null,
      ],
      [
        groupId,
        demoUserId('camille'),
        'member',
        'active',
        timestamp('2026-10-27T10:00:00+01:00'),
        null,
      ],
      [
        groupId,
        demoUserId('hugo'),
        'member',
        'active',
        timestamp('2026-10-28T11:00:00+01:00'),
        null,
      ],
    ],
    { conflict: 'group_id, user_id' },
  );
}

/** `last_opened_at` de la formation active : 13:20 heure de Paris, pas l'heure réelle. */
const DEMO_NOW_ISO_LOCAL = '2026-11-11T13:20:00+01:00';

// ---------------------------------------------------------------------------------------------
// 3. Progression et mémorisation
// ---------------------------------------------------------------------------------------------

interface UserProgrammeProgress {
  user: string;
  formation: DemoFormationFixture;
  validated: number;
  scores: number[];
  current: number;
}

const USER_PROGRESS: readonly UserProgrammeProgress[] = [
  {
    user: 'alex',
    formation: SAP_FORMATION,
    validated: 2,
    scores: [86, 91],
    current: 3,
  },
  {
    user: 'alex',
    formation: DEMO_FORMATIONS[1] as DemoFormationFixture,
    validated: 4,
    scores: [82, 85, 88, 84],
    current: 5,
  },
  {
    user: 'camille',
    formation: DEMO_FORMATIONS[1] as DemoFormationFixture,
    validated: 3,
    scores: [78, 81, 84],
    current: 4,
  },
  {
    user: 'hugo',
    formation: DEMO_FORMATIONS[1] as DemoFormationFixture,
    validated: 2,
    scores: [72, 76],
    current: 3,
  },
];

function progressStatus(
  entry: UserProgrammeProgress,
  position: number,
): 'locked' | 'open' | 'validated' {
  if (position <= entry.validated) return 'validated';
  if (position === entry.current) return 'open';
  return 'locked';
}

async function seedProgress(tx: DbTx): Promise<void> {
  const moduleRows: (readonly SqlValue[])[] = [];
  const chapterRows: (readonly SqlValue[])[] = [];

  for (const entry of USER_PROGRESS) {
    for (const module of entry.formation.modules) {
      const status = progressStatus(entry, module.position);
      const score = entry.scores[module.position - 1];
      moduleRows.push([
        demoUserId(entry.user as 'alex' | 'camille' | 'hugo'),
        demoModuleId(entry.formation.key, module.position),
        status,
        status === 'locked' ? null : timestamp(`${module.plannedStart}T09:00:00+01:00`),
        status === 'validated' ? timestamp(`${module.plannedEnd}T18:00:00+01:00`) : null,
        score === undefined ? null : String(score),
        timestamp(`${module.plannedStart}T08:00:00+01:00`),
      ]);
      for (const [chapterIndex] of module.chapters.entries()) {
        const done =
          status === 'validated' ||
          (status === 'open' && chapterIndex === 0) ||
          (entry.user === 'alex' && entry.formation.key === 'sap' && module.position === 3);
        chapterRows.push([
          demoUserId(entry.user as 'alex' | 'camille' | 'hugo'),
          demoChapterId(entry.formation.key, module.position, chapterIndex + 1),
          done ? 'done' : 'in_progress',
          done ? timestamp(`${module.plannedStart}T12:00:00+01:00`) : null,
          timestamp(`${module.plannedStart}T08:00:00+01:00`),
        ]);
      }
    }
  }

  // Les formations terminées sont intégralement validées pour Alex.
  for (const formation of DEMO_FORMATIONS.filter((entry) => entry.status === 'completed')) {
    for (const module of formation.modules) {
      moduleRows.push([
        demoUserId('alex'),
        demoModuleId(formation.key, module.position),
        'validated',
        timestamp(`${module.plannedStart}T09:00:00+01:00`),
        timestamp(`${module.plannedEnd}T18:00:00+01:00`),
        String(formation.resultPercent ?? 80),
        timestamp(`${module.plannedStart}T08:00:00+01:00`),
      ]);
      for (const [chapterIndex] of module.chapters.entries()) {
        chapterRows.push([
          demoUserId('alex'),
          demoChapterId(formation.key, module.position, chapterIndex + 1),
          'done',
          timestamp(`${module.plannedStart}T12:00:00+01:00`),
          timestamp(`${module.plannedStart}T08:00:00+01:00`),
        ]);
      }
    }
  }

  await insertRows(
    tx,
    'public.module_progress',
    ['user_id', 'module_id', 'status', 'opened_at', 'validated_at', 'best_score', 'updated_at'],
    moduleRows,
    { conflict: 'user_id, module_id' },
  );
  await insertRows(
    tx,
    'public.chapter_progress',
    ['user_id', 'chapter_id', 'contributions_status', 'done_at', 'updated_at'],
    chapterRows,
    { conflict: 'user_id, chapter_id' },
  );

  const states: (readonly SqlValue[])[] = [];
  const reviewLogs: (readonly SqlValue[])[] = [];
  const gapEvents: (readonly SqlValue[])[] = [];

  const notionStatesFor = (
    user: 'alex' | 'camille' | 'hugo',
    formation: DemoFormationFixture,
    options: { maxModule: number; due: number[]; gaps?: number[] },
  ): void => {
    const seen = formation.modules
      .filter((module) => module.position <= options.maxModule)
      .flatMap((module) => module.notions);
    for (const [index, notion] of seen.entries()) {
      const mastery = notion.mastery ?? 70 + (index % 20);
      const due = options.due.includes(index);
      const dueAt = due ? parisInstant('2026-11-11', '08:00') : parisInstant('2026-11-18', '08:00');
      const lastReview = parisInstant('2026-11-09', '18:00');
      const gap = notion.gap;
      states.push([
        demoUserId(user),
        demoNotionId(notion.key),
        json(fsrsCard(mastery, dueAt, lastReview, gap === undefined ? 0 : 1)),
        timestamp(dueAt),
        String(mastery),
        timestamp(parisInstant('2026-10-20', '09:00')),
        timestamp(lastReview),
        Math.max(1, Math.round(mastery / 10)),
        gap?.nature ?? null,
        gap?.confusedWith === undefined
          ? null
          : demoId('notion', `sap:m3:c2:n${gap.confusedWith === 'type' ? '5' : '1'}`),
        gap === undefined ? null : timestamp(parisInstant('2026-11-10', '16:42')),
        gap?.evidence ?? null,
        null,
        false,
        due && (options.gaps ?? []).includes(index),
        0,
        timestamp(parisInstant('2026-10-20', '09:00')),
        timestamp(lastReview),
      ]);
      if (gap !== undefined && user === 'alex') {
        gapEvents.push([
          demoId('gap-event', notion.key),
          demoUserId('alex'),
          demoNotionId(notion.key),
          'detected',
          gap.nature,
          json({ evidence: gap.evidence ?? 'Lacune observée en quiz.' }),
          timestamp(parisInstant('2026-11-10', '16:42')),
        ]);
      }
      if (due) {
        reviewLogs.push([
          demoId('review-log', user, notion.key),
          demoUserId(user),
          demoNotionId(notion.key),
          null,
          'global_quiz',
          mastery >= 80 ? 'good' : 'hard',
          mastery >= 80,
          4200,
          timestamp(lastReview),
          json(
            fsrsCard(Math.max(0, mastery - 5), lastReview, parisInstant('2026-11-05', '18:00'), 0),
          ),
          json(fsrsCard(mastery, dueAt, lastReview, gap === undefined ? 0 : 1)),
        ]);
      }
    }
  };

  const sapSeen = SAP_FORMATION.modules.flatMap((module) =>
    module.position <= 3 ? module.notions : [],
  );
  const reviewIndexes = sapSeen
    .map((notion, index) => (notion.inReview === true ? index : -1))
    .filter((index) => index >= 0);
  const deferredIndexes = sapSeen
    .map((notion, index) =>
      notion.inReview !== true && notion.mastery !== null && index < 20 ? index : -1,
    )
    .filter((index) => index >= 0)
    .slice(0, 4);

  notionStatesFor('alex', SAP_FORMATION, {
    maxModule: 3,
    due: [...reviewIndexes, ...deferredIndexes],
    gaps: reviewIndexes,
  });
  notionStatesFor('alex', DEMO_FORMATIONS[1] as DemoFormationFixture, {
    maxModule: 5,
    due: [],
  });
  notionStatesFor('camille', DEMO_FORMATIONS[1] as DemoFormationFixture, {
    maxModule: 4,
    due: [2, 5, 9],
  });
  notionStatesFor('hugo', DEMO_FORMATIONS[1] as DemoFormationFixture, {
    maxModule: 3,
    due: [1, 4],
  });
  for (const formation of DEMO_FORMATIONS.filter((entry) => entry.status === 'completed')) {
    notionStatesFor('alex', formation, {
      maxModule: formation.modules.length,
      due: formation.key === 'excel' ? [0, 2, 4, 6, 7] : [],
    });
  }

  await insertRows(
    tx,
    'public.notion_states',
    [
      'user_id',
      'notion_id',
      'fsrs',
      'due_at',
      'mastery',
      'first_seen_at',
      'last_seen_at',
      'success_count',
      'gap_nature',
      'gap_confused_with',
      'gap_detected_at',
      'gap_evidence',
      'gap_cleared_at',
      'suspended',
      'in_review',
      'revision',
      'created_at',
      'updated_at',
    ],
    states,
    { conflict: 'user_id, notion_id' },
  );
  await insertRows(
    tx,
    'public.review_logs',
    [
      'id',
      'user_id',
      'notion_id',
      'answer_id',
      'source',
      'grade',
      'correct',
      'time_ms',
      'reviewed_at',
      'fsrs_before',
      'fsrs_after',
    ],
    reviewLogs,
    { conflict: 'id', mode: 'nothing' },
  );
  await insertRows(
    tx,
    'public.gap_events',
    ['id', 'user_id', 'notion_id', 'kind', 'nature', 'evidence', 'created_at'],
    gapEvents,
    { conflict: 'id', mode: 'nothing' },
  );

  await insertRows(
    tx,
    'public.milestones',
    ['id', 'user_id', 'formation_id', 'key', 'ref_id', 'achieved_at'],
    [
      [
        demoId('milestone', 'sap', '1'),
        demoUserId('alex'),
        demoFormationId('sap'),
        'module_validated',
        demoModuleId('sap', 1),
        timestamp('2026-11-04T18:00:00+01:00'),
      ],
      [
        demoId('milestone', 'sap', '2'),
        demoUserId('alex'),
        demoFormationId('sap'),
        'module_validated',
        demoModuleId('sap', 2),
        timestamp('2026-11-06T18:00:00+01:00'),
      ],
    ],
    { conflict: 'id', mode: 'nothing' },
  );

  await insertRows(
    tx,
    'public.daily_activity',
    ['user_id', 'day', 'minutes', 'qualifying', 'sources'],
    DEMO_DAILY_ACTIVITY.map((entry) => [
      demoUserId('alex'),
      entry.day,
      entry.minutes,
      true,
      array(['schedule_slots', 'attempts'], 'text[]'),
    ]),
    { conflict: 'user_id, day' },
  );
}

// ---------------------------------------------------------------------------------------------
// 4. Apports, cours, briques, activités et tentatives
// ---------------------------------------------------------------------------------------------

interface ResourceFixture {
  key: string;
  chapter: string;
  kind: string;
  title: string;
  content: string;
  mime: string;
  size: number;
}

const ALEX_SAP_RESOURCES: readonly ResourceFixture[] = [
  {
    key: 'guide-fi',
    chapter: 'sap:m3:c2',
    kind: 'pdf',
    title: 'Guide FI (PDF)',
    content:
      'Guide de comptabilité générale : pièces, en-têtes, postes et clés de comptabilisation.',
    mime: 'application/pdf',
    size: 184320,
  },
  {
    key: 'note-cle-type',
    chapter: 'sap:m3:c2',
    kind: 'note',
    title: 'Note vocale, 1:42',
    content: 'Distinction entre la clé de comptabilisation (40/50) et le type de pièce (SA, KR).',
    mime: 'audio/mpeg',
    size: 24576,
  },
  {
    key: 'tutoriel-poste',
    chapter: 'sap:m3:c2',
    kind: 'video',
    title: 'Tutoriel vidéo, 5:10',
    content: 'Saisie d’un poste équilibré et vérification du total débit-crédit.',
    mime: 'video/mp4',
    size: 5242880,
  },
  {
    key: 'notes-module-3',
    chapter: 'sap:m3:c2',
    kind: 'note',
    title: 'Vos notes · module 3',
    content: 'Journal universel, ledgers parallèles et ledger principal 0L.',
    mime: 'text/markdown',
    size: 4096,
  },
  {
    key: 'fiche-fiori',
    chapter: 'sap:m1:c2',
    kind: 'web',
    title: 'Fiche Fiori (lien web)',
    content: 'Launchpad et applications Fiori organisées par rôle.',
    mime: 'text/html',
    size: 2048,
  },
  {
    key: 'cours-organisation',
    chapter: 'sap:m2:c1',
    kind: 'web',
    title: 'Cours en ligne · organisation',
    content: 'Sociétés, plan comptable, périmètres, segments et centres de profit.',
    mime: 'text/html',
    size: 3072,
  },
  {
    key: 'notes-module-1',
    chapter: 'sap:m1:c1',
    kind: 'note',
    title: 'Vos notes · module 1',
    content: 'SAP S/4HANA, partenaire et données de base.',
    mime: 'text/markdown',
    size: 1536,
  },
  {
    key: 'pdf-exercices',
    chapter: 'sap:m2:c2',
    kind: 'pdf',
    title: 'PDF · exercices comptables',
    content: 'Exercices sur les variantes d’exercice et les dates comptables.',
    mime: 'application/pdf',
    size: 98304,
  },
] as const;

async function seedResources(tx: DbTx, catalog: SeededCatalog): Promise<void> {
  const location = (
    kind: string,
    key: string,
    mime: string,
    ownerId: string,
    resourceId: string,
  ) => {
    const file = ['pdf', 'image', 'audio', 'video'].includes(kind);
    const link = ['web', 'youtube'].includes(kind);
    return {
      storagePath: file ? `${ownerId}/${resourceId}/${key}.${mime.split('/')[1] ?? 'bin'}` : null,
      url: link ? `https://demo.learny.test/${key}` : null,
    };
  };
  const rows: (readonly SqlValue[])[] = ALEX_SAP_RESOURCES.map((resource) => {
    const resourceId = demoId('resource', 'alex', resource.key);
    const ownerId = demoUserId('alex');
    const { storagePath, url } = location(
      resource.kind,
      resource.key,
      resource.mime,
      ownerId,
      resourceId,
    );
    return [
      resourceId,
      ownerId,
      demoFormationId('sap'),
      catalog.chapterIds.get(resource.chapter) ?? demoChapterId('sap', 3, 2),
      resource.kind,
      'learner',
      null,
      resource.title,
      resource.content,
      storagePath,
      url,
      resource.mime,
      resource.size,
      'ready',
      null,
      null,
      json({ source: 'fixture', key: resource.key }),
      null,
      timestamp(parisInstant('2026-11-09', '10:00')),
      timestamp(parisInstant('2026-11-11', '11:05')),
    ];
  });

  rows.push(
    [
      demoId('resource', 'alex', 'agile-retro'),
      demoUserId('alex'),
      demoFormationId('agile'),
      catalog.chapterIds.get('agile:m5:c1') ?? null,
      'note',
      'learner',
      null,
      'Notes · rétrospective',
      'Format de la rétro et actions du collectif.',
      null,
      null,
      'text/markdown',
      2048,
      'ready',
      null,
      null,
      json({ source: 'fixture' }),
      null,
      timestamp(parisInstant('2026-11-10', '17:10')),
      timestamp(parisInstant('2026-11-10', '17:10')),
    ],
    [
      demoId('resource', 'camille', 'agile-retro-2'),
      demoUserId('camille'),
      demoFormationId('agile'),
      catalog.chapterIds.get('agile:m5:c2') ?? null,
      'note',
      'learner',
      null,
      'Rétrospective · actions de Camille',
      'Trois actions proposées pour le prochain sprint.',
      null,
      null,
      'text/markdown',
      1024,
      'ready',
      null,
      null,
      json({ source: 'fixture' }),
      null,
      timestamp(parisInstant('2026-11-10', '18:00')),
      timestamp(parisInstant('2026-11-10', '18:00')),
    ],
    [
      demoId('resource', 'hugo', 'agile-retro-3'),
      demoUserId('hugo'),
      demoFormationId('agile'),
      catalog.chapterIds.get('agile:m3:c1') ?? null,
      'note',
      'learner',
      null,
      'Notes de sprint · Hugo',
      'Points bloquants du sprint en cours.',
      null,
      null,
      'text/markdown',
      1024,
      'ready',
      null,
      null,
      json({ source: 'fixture' }),
      null,
      timestamp(parisInstant('2026-11-09', '14:00')),
      timestamp(parisInstant('2026-11-09', '14:00')),
    ],
  );

  await insertRows(
    tx,
    'public.resources',
    [
      'id',
      'owner_id',
      'formation_id',
      'chapter_id',
      'kind',
      'origin',
      'suggestion_status',
      'title',
      'content_text',
      'storage_path',
      'url',
      'mime',
      'size_bytes',
      'status',
      'error_code',
      'error_message',
      'metadata',
      'deleted_at',
      'created_at',
      'updated_at',
    ],
    rows,
    { conflict: 'id' },
  );
}

interface CourseDefinition {
  owner: 'alex' | 'camille' | 'hugo';
  formation: DemoFormationFixture;
  modulePosition: number;
  model: string;
}

const COURSES: readonly CourseDefinition[] = [
  { owner: 'alex', formation: SAP_FORMATION, modulePosition: 1, model: 'claude-sonnet' },
  { owner: 'alex', formation: SAP_FORMATION, modulePosition: 2, model: 'claude-sonnet' },
  { owner: 'alex', formation: SAP_FORMATION, modulePosition: 3, model: 'claude-sonnet' },
  {
    owner: 'alex',
    formation: DEMO_FORMATIONS[1] as DemoFormationFixture,
    modulePosition: 5,
    model: 'claude-sonnet',
  },
  {
    owner: 'camille',
    formation: DEMO_FORMATIONS[1] as DemoFormationFixture,
    modulePosition: 4,
    model: 'claude-haiku',
  },
  {
    owner: 'hugo',
    formation: DEMO_FORMATIONS[1] as DemoFormationFixture,
    modulePosition: 3,
    model: 'claude-haiku',
  },
];

async function seedCourses(tx: DbTx, catalog: SeededCatalog): Promise<void> {
  const courseRows: (readonly SqlValue[])[] = [];
  const sectionRows: (readonly SqlValue[])[] = [];
  const readingRows: (readonly SqlValue[])[] = [];
  const conversationRows: (readonly SqlValue[])[] = [];
  const messageRows: (readonly SqlValue[])[] = [];

  for (const definition of COURSES) {
    const key = courseKey(definition.owner, definition.formation.key, definition.modulePosition);
    const courseId = demoId('course', key);
    catalog.courseIds.set(key, courseId);
    const module = definition.formation.modules[definition.modulePosition - 1];
    if (module === undefined) throw new Error(`module de cours introuvable : ${key}`);
    const moduleId = demoModuleId(definition.formation.key, module.position);
    const createdAt = parisInstant('2026-11-09', '11:00');
    courseRows.push([
      courseId,
      demoUserId(definition.owner),
      demoFormationId(definition.formation.key),
      moduleId,
      1,
      true,
      'ready',
      definition.model,
      null,
      timestamp(createdAt),
      timestamp(createdAt),
    ]);

    let position = 0;
    for (const [chapterIndex, chapter] of module.chapters.entries()) {
      const chapterId = demoChapterId(definition.formation.key, module.position, chapterIndex + 1);
      const notionIds = chapterNotionIds(module, chapter.key);
      const chapterNumber = chapterIndex + 1;
      const sections: Array<{
        kind: string;
        title: string;
        content: string | null;
        data: unknown;
      }> = [
        {
          kind: 'text',
          title: chapter.title,
          content: `## ${chapter.title}\n\nCe chapitre présente ${chapter.title.toLowerCase()} et les notions associées.`,
          data: null,
        },
      ];
      if (
        definition.owner === 'alex' &&
        definition.formation.key === 'sap' &&
        module.position === 3
      ) {
        if (chapterNumber === 2) {
          sections.push(
            {
              kind: 'flash_question',
              title: 'Question éclair',
              content: null,
              data: {
                question: 'Quelle clé de comptabilisation utilise-t-on pour un compte général ?',
                answer: '40 au débit et 50 au crédit.',
              },
            },
            {
              kind: 'dont_confuse',
              title: 'Ne pas confondre',
              content: null,
              data: {
                left: {
                  title: 'Clé de comptabilisation',
                  body: 'Code à deux chiffres porté par chaque poste.',
                  example: '40 / 50',
                },
                right: {
                  title: 'Type de pièce',
                  body: 'Classe toute la pièce et fixe sa numérotation.',
                  example: 'SA, KR, DR',
                },
              },
            },
            {
              kind: 'retain',
              title: 'À retenir',
              content: null,
              data: {
                points: [
                  'Une pièce est équilibrée : débits = crédits.',
                  'La clé de comptabilisation appartient au poste, le type à l’en-tête.',
                ],
                mnemonic: 'Clé au poste, type à l’en-tête.',
              },
            },
          );
        }
        if (chapterNumber === 4) {
          sections.push({
            kind: 'summary_prompt',
            title: 'Résumez le chapitre',
            content: 'Expliquez la différence entre ledgers parallèles et ledger principal.',
            data: null,
          });
        }
      }
      for (const section of sections) {
        position += 1;
        sectionRows.push([
          demoId('section', key, String(chapterNumber), String(position)),
          courseId,
          demoUserId(definition.owner),
          chapterId,
          position,
          section.kind,
          `chapitre-${String(chapterNumber)}-${section.kind.replaceAll('_', '-')}`,
          section.title,
          section.content,
          section.data === null ? null : json(section.data),
          array(notionIds, 'uuid[]'),
          'tutor',
          1,
          false,
          timestamp(createdAt),
          timestamp(createdAt),
        ]);
      }
      if (definition.owner === 'alex' && definition.formation.key === 'sap') {
        readingRows.push([
          demoUserId('alex'),
          courseId,
          chapterId,
          chapterNumber <= 2 ? 100 : 35,
          chapterNumber <= 2 ? 4200 : 1200,
          timestamp(parisInstant('2026-11-11', `1${String(1 + chapterNumber)}:00`)),
        ]);
      }
    }

    const conversationId = demoId('conversation', definition.owner, key);
    catalog.conversationIds.push(conversationId);
    conversationRows.push([
      conversationId,
      demoUserId(definition.owner),
      courseId,
      `Discussion · ${module.title}`,
      timestamp(createdAt),
    ]);
    messageRows.push(
      [
        demoId('message', key, '1'),
        conversationId,
        demoUserId(definition.owner),
        'tutor',
        `Bonjour, voici le cours du module ${String(module.position)}. Commencez par le chapitre 2.`,
        json({ chapter: 2 }),
        json([]),
        array(['Question éclair', 'À retenir'], 'text[]'),
        null,
        timestamp(createdAt),
      ],
      [
        demoId('message', key, '2'),
        conversationId,
        demoUserId(definition.owner),
        'learner',
        'Je confonds encore la clé de comptabilisation et le type de pièce.',
        json({ chapter: 2 }),
        json([]),
        array(['Ne pas confondre'], 'text[]'),
        null,
        timestamp(parisInstant('2026-11-09', '11:10')),
      ],
      [
        demoId('message', key, '3'),
        conversationId,
        demoUserId(definition.owner),
        'tutor',
        'La clé est portée par le poste, le type par l’en-tête. Vérifions avec un exemple.',
        json({ chapter: 2, notionId: demoNotionId('sap:m3:c2:n4') }),
        json([]),
        array(['Réessayer', 'Voir un exemple'], 'text[]'),
        null,
        timestamp(parisInstant('2026-11-09', '11:11')),
      ],
    );
  }

  await insertRows(
    tx,
    'public.courses',
    [
      'id',
      'owner_id',
      'formation_id',
      'module_id',
      'version',
      'is_current',
      'status',
      'model',
      'error',
      'created_at',
      'updated_at',
    ],
    courseRows,
    { conflict: 'id' },
  );
  await insertRows(
    tx,
    'public.course_sections',
    [
      'id',
      'course_id',
      'owner_id',
      'chapter_id',
      'position',
      'kind',
      'anchor',
      'title',
      'content_md',
      'data',
      'notion_ids',
      'origin',
      'version',
      'reported',
      'created_at',
      'updated_at',
    ],
    sectionRows,
    { conflict: 'id', mode: 'nothing' },
  );
  await insertRows(
    tx,
    'public.reading_progress',
    ['user_id', 'course_id', 'chapter_id', 'percent', 'seconds_spent', 'updated_at'],
    readingRows,
    { conflict: 'user_id, course_id, chapter_id' },
  );
  await insertRows(
    tx,
    'public.tutor_conversations',
    ['id', 'user_id', 'course_id', 'title', 'created_at'],
    conversationRows,
    { conflict: 'id' },
  );
  await insertRows(
    tx,
    'public.tutor_messages',
    [
      'id',
      'conversation_id',
      'user_id',
      'role',
      'content',
      'context',
      'sources',
      'follow_ups',
      'self_test',
      'created_at',
    ],
    messageRows,
    { conflict: 'id', mode: 'nothing' },
  );
}

interface BrickDefinition {
  key: string;
  type: string;
  purpose: string;
  notionSlugs: readonly string[];
  payload: unknown;
}

interface ActivityDefinition {
  key: string;
  kind: string;
  modulePosition: number | null;
  brickKeys: readonly string[];
  config: unknown;
  forDate?: string;
}

const BRICKS: readonly BrickDefinition[] = [
  {
    key: 'm1-q1',
    type: 'choice_question',
    purpose: 'validation',
    notionSlugs: ['s4', 'fiori'],
    payload: {
      question: 'Quelle interface organise SAP S/4HANA par rôle ?',
      choices: ['SAP GUI', 'SAP Fiori', 'ALV', 'SE38'],
      answer: 'SAP Fiori',
    },
  },
  {
    key: 'm1-q2',
    type: 'choice_question',
    purpose: 'validation',
    notionSlugs: ['launchpad'],
    payload: {
      question: 'Où trouve-t-on les applications Fiori d’un rôle ?',
      choices: ['Launchpad', 'Table ACDOCA', 'Plan comptable', 'Ledger 0L'],
      answer: 'Launchpad',
    },
  },
  {
    key: 'm1-q3',
    type: 'choice_question',
    purpose: 'validation',
    notionSlugs: ['bp'],
    payload: {
      question: 'Que désigne un partenaire (Business Partner) ?',
      choices: ['Un compte général', 'Un fournisseur ou client', 'Un ledger', 'Une variante'],
      answer: 'Un fournisseur ou client',
    },
  },
  {
    key: 'm2-q1',
    type: 'choice_question',
    purpose: 'validation',
    notionSlugs: ['societe'],
    payload: {
      question: 'Quelle unité établit ses propres états financiers ?',
      choices: ['La société', 'Le centre de profit', 'Le segment', 'La division'],
      answer: 'La société',
    },
  },
  {
    key: 'm2-q2',
    type: 'choice_question',
    purpose: 'validation',
    notionSlugs: ['variante'],
    payload: {
      question: 'Que définit la variante d’exercice ?',
      choices: ['Les périodes comptables', 'Les comptes généraux', 'Les rôles', 'Les devises'],
      answer: 'Les périodes comptables',
    },
  },
  {
    key: 'm2-q3',
    type: 'choice_question',
    purpose: 'validation',
    notionSlugs: ['pc'],
    payload: {
      question: 'Que contient le plan comptable ?',
      choices: [
        'La liste des comptes généraux',
        'Les pièces',
        'Les paiements',
        'Les immobilisations',
      ],
      answer: 'La liste des comptes généraux',
    },
  },
  {
    key: 'm3-q1',
    type: 'choice_question',
    purpose: 'validation',
    notionSlugs: ['cle', 'type'],
    payload: {
      question: 'Quelle clé utilise-t-on pour un compte général au débit ?',
      choices: ['40', '50', 'SA', 'KR'],
      answer: '40',
      explanation: 'La clé 40 porte le débit, la clé 50 le crédit.',
    },
  },
  {
    key: 'm3-q2',
    type: 'choice_question',
    purpose: 'validation',
    notionSlugs: ['type'],
    payload: {
      question: 'Où choisit-on le type de pièce ?',
      choices: ['Dans l’en-tête', 'Dans chaque poste', 'Dans le plan comptable', 'Dans le ledger'],
      answer: 'Dans l’en-tête',
    },
  },
  {
    key: 'm3-q3',
    type: 'choice_question',
    purpose: 'validation',
    notionSlugs: ['equilibre'],
    payload: {
      question: 'Une pièce est enregistrée si…',
      choices: [
        'les débits égalent les crédits',
        'le total dépasse 1 000 €',
        'elle contient deux postes',
        'elle est en devise locale',
      ],
      answer: 'les débits égalent les crédits',
    },
  },
  {
    key: 'm3-q4',
    type: 'choice_question',
    purpose: 'validation',
    notionSlugs: ['acdoca'],
    payload: {
      question: 'Que contient ACDOCA ?',
      choices: ['Tous les postes', 'Seulement les immobilisations', 'Les rôles', 'Les devises'],
      answer: 'Tous les postes',
    },
  },
  {
    key: 'm3-q5',
    type: 'choice_question',
    purpose: 'validation',
    notionSlugs: ['ledgers'],
    payload: {
      question: 'À quoi servent les ledgers parallèles ?',
      choices: [
        'Tenir la comptabilité selon plusieurs normes',
        'Créer des sociétés',
        'Numéroter les pièces',
        'Gérer les rôles',
      ],
      answer: 'Tenir la comptabilité selon plusieurs normes',
    },
  },
  ...Array.from({ length: 14 }, (_, index) => {
    const notion = [
      'cle',
      'ledgers',
      'equilibre',
      'variante',
      'segment',
      'perimetre',
      'type',
      'division',
      'role',
      'acdoca',
      'cdp',
      'dates',
      'devise',
      'bp',
    ][index] as string;
    return {
      key: `global-${String(index + 1)}`,
      type: 'recall_card',
      purpose: 'review',
      notionSlugs: [notion],
      payload: {
        prompt: `Rappeler la notion « ${notion} »`,
        answer: 'Réponse attendue du jeu de démonstration.',
      },
    } satisfies BrickDefinition;
  }),
  {
    key: 'exercise-1',
    type: 'open_question',
    purpose: 'exercise',
    notionSlugs: ['piece', 'equilibre'],
    payload: {
      prompt: 'Saisissez une pièce équilibrée de 1 200 € au débit du compte 411.',
      criteria: ['Deux postes', 'Débit = crédit', 'Clé 40 au débit'],
    },
  },
  {
    key: 'exercise-2',
    type: 'cloze',
    purpose: 'exercise',
    notionSlugs: ['cle'],
    payload: {
      text: 'La clé __ complète le poste ; le type __ complète l’en-tête.',
      answers: ['de comptabilisation', 'de pièce'],
    },
  },
  {
    key: 'exam-1',
    type: 'choice_question',
    purpose: 'exam',
    notionSlugs: ['societe', 'pc', 'compte'],
    payload: {
      question: 'Quel objet relie une société à ses comptes ?',
      choices: ['Le plan comptable', 'Le ledger', 'La division', 'Le rôle'],
      answer: 'Le plan comptable',
    },
  },
  {
    key: 'exam-2',
    type: 'choice_question',
    purpose: 'exam',
    notionSlugs: ['cle'],
    payload: {
      question: 'Quelle clé porte le crédit d’un compte général ?',
      choices: ['40', '50', 'SA', 'DR'],
      answer: '50',
    },
  },
  {
    key: 'exam-3',
    type: 'choice_question',
    purpose: 'exam',
    notionSlugs: ['dates'],
    payload: {
      question: 'Que fixe la date comptable ?',
      choices: [
        'La période de l’écriture',
        'La date du document',
        'La date de paiement',
        'La date de clôture',
      ],
      answer: 'La période de l’écriture',
    },
  },
  {
    key: 'warmup-1',
    type: 'choice_question',
    purpose: 'warmup',
    notionSlugs: ['cle'],
    payload: {
      question: 'Clé 40 : débit ou crédit ?',
      choices: ['Débit', 'Crédit'],
      answer: 'Débit',
    },
  },
  {
    key: 'warmup-2',
    type: 'choice_question',
    purpose: 'warmup',
    notionSlugs: ['type'],
    payload: {
      question: 'Le type de pièce est-il porté par le poste ?',
      choices: ['Oui', 'Non, par l’en-tête'],
      answer: 'Non, par l’en-tête',
    },
  },
  {
    key: 'warmup-3',
    type: 'choice_question',
    purpose: 'warmup',
    notionSlugs: ['equilibre'],
    payload: {
      question: 'Débit 100, crédit 80 : la pièce est-elle équilibrée ?',
      choices: ['Oui', 'Non'],
      answer: 'Non',
    },
  },
  {
    key: 'remediation-1',
    type: 'recall_card',
    purpose: 'remediation',
    notionSlugs: ['ledgers'],
    payload: {
      prompt: 'Que retenez-vous des ledgers parallèles ?',
      answer: 'Plusieurs normes comptables tenues en parallèle.',
    },
  },
  {
    key: 'remediation-2',
    type: 'recall_card',
    purpose: 'remediation',
    notionSlugs: ['variante'],
    payload: {
      prompt: 'À quoi sert la variante d’exercice ?',
      answer: 'À définir les périodes comptables de la société.',
    },
  },
];

const ACTIVITIES: readonly ActivityDefinition[] = [
  {
    key: 'm1-quiz',
    kind: 'validation_quiz',
    modulePosition: 1,
    brickKeys: ['m1-q1', 'm1-q2', 'm1-q3'],
    config: { threshold: 80, questionCount: 3 },
  },
  {
    key: 'm2-quiz',
    kind: 'validation_quiz',
    modulePosition: 2,
    brickKeys: ['m2-q1', 'm2-q2', 'm2-q3'],
    config: { threshold: 80, questionCount: 3 },
  },
  {
    key: 'm3-quiz',
    kind: 'validation_quiz',
    modulePosition: 3,
    brickKeys: ['m3-q1', 'm3-q2', 'm3-q3', 'm3-q4', 'm3-q5'],
    config: { threshold: 80, questionCount: 5 },
  },
  {
    key: 'global-quiz',
    kind: 'global_quiz_session',
    modulePosition: 3,
    brickKeys: Array.from({ length: 14 }, (_, index) => `global-${String(index + 1)}`),
    config: { durationSec: 600, questionCount: 14 },
    forDate: '2026-11-11',
  },
  {
    key: 'exercise',
    kind: 'exercise',
    modulePosition: 3,
    brickKeys: ['exercise-1', 'exercise-2'],
    config: { hintsMax: 2 },
  },
  {
    key: 'mock-exam',
    kind: 'mock_exam',
    modulePosition: 7,
    brickKeys: ['exam-1', 'exam-2', 'exam-3'],
    config: { durationSec: 10800, threshold: 80 },
  },
  {
    key: 'warmup',
    kind: 'warmup',
    modulePosition: 3,
    brickKeys: ['warmup-1', 'warmup-2', 'warmup-3'],
    config: { durationSec: 120 },
    forDate: '2026-11-11',
  },
  {
    key: 'remediation',
    kind: 'remediation',
    modulePosition: 3,
    brickKeys: ['remediation-1', 'remediation-2'],
    config: { durationSec: 3600 },
  },
];

async function seedBricksAndActivities(tx: DbTx, catalog: SeededCatalog): Promise<void> {
  const brickRows: (readonly SqlValue[])[] = [];
  const versionRows: (readonly SqlValue[])[] = [];
  const brickIdByKey = new Map<string, string>();

  for (const brick of BRICKS) {
    const brickId = demoId('brick', brick.key);
    brickIdByKey.set(brick.key, brickId);
    catalog.brickIds.push(brickId);
    const notionIds = brick.notionSlugs
      .map((slug) => catalog.notionIdBySlug.get(slug))
      .filter((value): value is string => value !== undefined);
    brickRows.push([
      brickId,
      demoUserId('alex'),
      demoFormationId('sap'),
      brick.type,
      array(notionIds, 'uuid[]'),
      brick.purpose,
      'active',
      1,
      timestamp(parisInstant('2026-11-02', '08:00')),
    ]);
    const versionId = demoId('brick-version', brick.key);
    catalog.brickVersionIds.set(brick.key, versionId);
    versionRows.push([
      versionId,
      brickId,
      1,
      json(brick.payload),
      fingerprintOf(brick.payload),
      'tutor',
      'tutor',
      timestamp(parisInstant('2026-11-02', '08:00')),
    ]);
  }

  await insertRows(
    tx,
    'public.bricks',
    [
      'id',
      'owner_id',
      'formation_id',
      'type',
      'notion_ids',
      'purpose',
      'status',
      'current_version',
      'created_at',
    ],
    brickRows,
    { conflict: 'id' },
  );
  await insertRows(
    tx,
    'public.brick_versions',
    ['id', 'brick_id', 'version', 'payload', 'fingerprint', 'origin', 'created_by', 'created_at'],
    versionRows,
    { conflict: 'id', mode: 'nothing' },
  );

  const activityRows: (readonly SqlValue[])[] = [];
  const activityIdByKey = new Map<string, string>();
  for (const activity of ACTIVITIES) {
    const activityId = demoId('activity', activity.key);
    activityIdByKey.set(activity.key, activityId);
    catalog.activityIds.set(activity.key, activityId);
    const items = activity.brickKeys.map((key) => {
      const brickId = brickIdByKey.get(key);
      const brickVersionId = catalog.brickVersionIds.get(key);
      if (brickId === undefined || brickVersionId === undefined) {
        throw new Error(`brique d’activité introuvable : ${key}`);
      }
      return { brickId, brickVersionId };
    });
    const moduleId =
      activity.modulePosition === null ? null : demoModuleId('sap', activity.modulePosition);
    activityRows.push([
      activityId,
      demoUserId('alex'),
      demoFormationId('sap'),
      moduleId,
      activity.kind,
      json(activity.config),
      json(items),
      'ready',
      activity.forDate ?? null,
      timestamp(parisInstant('2026-11-02', '08:00')),
    ]);
  }
  await insertRows(
    tx,
    'public.activities',
    [
      'id',
      'owner_id',
      'formation_id',
      'module_id',
      'kind',
      'config',
      'items',
      'status',
      'for_date',
      'created_at',
    ],
    activityRows,
    { conflict: 'id', mode: 'nothing' },
  );

  const attemptRows: (readonly SqlValue[])[] = [];
  const answerRows: (readonly SqlValue[])[] = [];
  const attempts = [
    {
      key: 'm1-attempt',
      activity: 'm1-quiz',
      attemptNo: 1,
      score: 86,
      passed: true,
      at: '2026-11-04T17:30:00+01:00',
    },
    {
      key: 'm2-attempt',
      activity: 'm2-quiz',
      attemptNo: 1,
      score: 91,
      passed: true,
      at: '2026-11-06T17:30:00+01:00',
    },
    {
      key: 'm3-attempt-1',
      activity: 'm3-quiz',
      attemptNo: 1,
      score: 58,
      passed: false,
      at: '2026-11-10T16:30:00+01:00',
    },
    {
      key: 'global-attempt',
      activity: 'global-quiz',
      attemptNo: 1,
      score: 86,
      passed: true,
      at: '2026-11-10T17:20:00+01:00',
    },
  ] as const;

  for (const attempt of attempts) {
    const activityId = activityIdByKey.get(attempt.activity);
    if (activityId === undefined)
      throw new Error(`activité de tentative introuvable : ${attempt.activity}`);
    const attemptId = demoId('attempt', attempt.key);
    catalog.attemptIds.set(attempt.key, attemptId);
    attemptRows.push([
      attemptId,
      demoUserId('alex'),
      activityId,
      attempt.attemptNo,
      'graded',
      timestamp(attempt.at),
      null,
      timestamp(attempt.at),
      480000,
      String(attempt.score),
      attempt.passed,
      json({
        [demoNotionId('sap:m3:c2:n4')]: {
          correct: attempt.score >= 80 ? 4 : 1,
          total: 5,
          score: attempt.score,
        },
      }),
      0,
      json({
        verdict: attempt.passed ? 'good' : 'partial',
        message: attempt.passed ? 'Module validé.' : 'Revoir la clé de comptabilisation.',
      }),
      timestamp(attempt.at),
    ]);
  }
  await insertRows(
    tx,
    'public.attempts',
    [
      'id',
      'user_id',
      'activity_id',
      'attempt_no',
      'status',
      'started_at',
      'deadline_at',
      'submitted_at',
      'duration_ms',
      'score',
      'passed',
      'per_notion',
      'hints_used',
      'review_feedback',
      'created_at',
    ],
    attemptRows,
    { conflict: 'id', mode: 'nothing' },
  );

  const m3Attempt = catalog.attemptIds.get('m3-attempt-1');
  if (m3Attempt !== undefined) {
    for (const [index, key] of ['m3-q1', 'm3-q2', 'm3-q3', 'm3-q4', 'm3-q5'].entries()) {
      const versionId = catalog.brickVersionIds.get(key);
      if (versionId === undefined) continue;
      answerRows.push([
        demoId('answer', key, String(index + 1)),
        m3Attempt,
        versionId,
        index + 1,
        json({ answer: index === 0 ? 'SA' : 'Réponse de démonstration' }),
        index < 3,
        index < 3 ? '1' : '0',
        '1',
        45000,
        'code',
        json({ explanation: index < 3 ? 'Correct.' : 'À revoir avec le tuteur.' }),
        index === 0 ? demoId('notion', 'sap:m3:c2:n5') : null,
        false,
        timestamp('2026-11-10T16:30:00+01:00'),
      ]);
    }
    await insertRows(
      tx,
      'public.answers',
      [
        'id',
        'attempt_id',
        'brick_version_id',
        'position',
        'response',
        'is_correct',
        'score',
        'max_score',
        'time_ms',
        'graded_by',
        'feedback',
        'chosen_distractor_notion_id',
        'marked_for_review',
        'answered_at',
      ],
      answerRows,
      { conflict: 'id', mode: 'nothing' },
    );
  }
}

// ---------------------------------------------------------------------------------------------
// 5. Agenda, notifications, automatismes
// ---------------------------------------------------------------------------------------------

async function seedAgendaAndNotifications(tx: DbTx, catalog: SeededCatalog): Promise<void> {
  const slotRows: (readonly SqlValue[])[] = DEMO_AGENDA.map((slot) => {
    const formationKey = slot.formation;
    const date = DEMO_AGENDA_DAYS[slot.day].date;
    const activityKey =
      slot.kind === 'validation_quiz' && slot.modulePosition === 3
        ? 'm3-quiz'
        : slot.kind === 'global_quiz'
          ? 'global-quiz'
          : slot.kind === 'exercise'
            ? 'exercise'
            : slot.kind === 'warmup'
              ? 'warmup'
              : null;
    return [
      demoId('slot', slot.key),
      demoUserId('alex'),
      demoFormationId(formationKey),
      slot.modulePosition === null ? null : demoModuleId(formationKey, slot.modulePosition),
      slot.kind,
      slot.title,
      slot.meta,
      timestamp(parisInstant(date, slot.start)),
      timestamp(parisInstant(date, slot.end)),
      slot.status,
      activityKey === null ? null : (catalog.activityIds.get(activityKey) ?? null),
      slot.createdBy,
      null,
      false,
      timestamp(parisInstant('2026-11-08', '18:00')),
      timestamp(parisInstant('2026-11-08', '18:00')),
    ];
  });

  slotRows.push(
    [
      demoId('slot', 'camille-mon'),
      demoUserId('camille'),
      demoFormationId('agile'),
      demoModuleId('agile', 4),
      'contributions',
      'Apports · tests',
      'Chapitre 1 · fait',
      timestamp(parisInstant('2026-11-09', '18:00')),
      timestamp(parisInstant('2026-11-09', '19:00')),
      'done',
      null,
      'planner',
      null,
      false,
      timestamp(parisInstant('2026-11-08', '18:00')),
      timestamp(parisInstant('2026-11-08', '18:00')),
    ],
    [
      demoId('slot', 'hugo-tue'),
      demoUserId('hugo'),
      demoFormationId('agile'),
      demoModuleId('agile', 3),
      'course',
      'Lecture du cours',
      'Module 3 · fait',
      timestamp(parisInstant('2026-11-10', '12:30')),
      timestamp(parisInstant('2026-11-10', '13:30')),
      'done',
      null,
      'planner',
      null,
      false,
      timestamp(parisInstant('2026-11-08', '18:00')),
      timestamp(parisInstant('2026-11-08', '18:00')),
    ],
  );

  await insertRows(
    tx,
    'public.schedule_slots',
    [
      'id',
      'user_id',
      'formation_id',
      'module_id',
      'kind',
      'title',
      'meta',
      'starts_at',
      'ends_at',
      'status',
      'activity_id',
      'created_by',
      'moved_from_id',
      'group_milestone',
      'created_at',
      'updated_at',
    ],
    slotRows,
    { conflict: 'id', mode: 'nothing' },
  );

  const notificationRows: (readonly SqlValue[])[] = DEMO_NOTIFICATIONS.map((notification) => [
    demoId('notification', notification.key),
    demoUserId('alex'),
    notification.formation === null ? null : demoFormationId(notification.formation),
    notification.type,
    notification.title,
    notification.body,
    notification.href,
    notification.icon,
    `demo:${notification.key}`,
    notification.read ? timestamp(notification.createdAt) : null,
    timestamp(notification.createdAt),
  ]);
  notificationRows.push(
    [
      demoId('notification', 'camille-gap'),
      demoUserId('camille'),
      demoFormationId('agile'),
      'new_gap',
      'Nouvelle lacune repérée',
      'Rétrospective : action non mesurable.',
      '/formations/agile/lacunes',
      'gap',
      'demo:camille-gap',
      null,
      timestamp(parisInstant('2026-11-10', '19:00')),
    ],
    [
      demoId('notification', 'hugo-session'),
      demoUserId('hugo'),
      demoFormationId('agile'),
      'session_planned',
      'Session demain à 12:30',
      'Lecture du cours, module 3.',
      '/agenda?vue=semaine&date=2026-11-11',
      'session',
      'demo:hugo-session',
      null,
      timestamp(parisInstant('2026-11-09', '18:00')),
    ],
  );

  await insertRows(
    tx,
    'public.notifications',
    [
      'id',
      'user_id',
      'formation_id',
      'type',
      'title',
      'body',
      'href',
      'icon',
      'dedupe_key',
      'read_at',
      'created_at',
    ],
    notificationRows,
    { conflict: 'id', mode: 'nothing' },
  );

  const actionRows: (readonly SqlValue[])[] = DEMO_AUTOMATION_ACTIONS.map((action) => [
    demoId('automation-action', action.key),
    demoUserId('alex'),
    action.formation === null ? null : demoFormationId(action.formation),
    action.automation,
    action.kind,
    action.summary,
    json({ source: 'fixture', key: action.key }),
    null,
    action.requiresConsent,
    action.status,
    action.status === 'pending_consent' ? null : timestamp(action.createdAt),
    timestamp(action.createdAt),
  ]);
  await insertRows(
    tx,
    'public.automation_actions',
    [
      'id',
      'user_id',
      'formation_id',
      'automation',
      'kind',
      'summary',
      'payload',
      'undo_payload',
      'requires_consent',
      'status',
      'decided_at',
      'created_at',
    ],
    actionRows,
    { conflict: 'id', mode: 'nothing' },
  );
}

// ---------------------------------------------------------------------------------------------
// 6. Résumé, contrôles et point d'entrée
// ---------------------------------------------------------------------------------------------

export interface SeedDemoSummary {
  fingerprint: string;
  fixedAt: string;
  tableCounts: Record<string, number>;
  checks: Record<string, { expected: number; observed: number; ok: boolean }>;
}

async function countRows(
  tx: DbTx,
  table: string,
  column: string,
  values: readonly string[],
): Promise<number> {
  if (values.length === 0) return 0;
  const rows = await tx.execute<{ count: number }>(
    sql`select count(*)::int as count from ${sql.raw(table)} where ${sql.raw(column)} = any(${array(values, 'uuid[]')})`,
  );
  return rows[0]?.count ?? 0;
}

async function tableCounts(tx: DbTx, catalog: SeededCatalog): Promise<Record<string, number>> {
  const users = DEMO_USERS.map((user) => demoUserId(user.key));
  const formations = [...catalog.formationIds.values()];
  const conversations = catalog.conversationIds;
  const attempts = [...catalog.attemptIds.values()];
  const bricks = catalog.brickIds;
  const counts: Record<string, number> = {};
  const scope: Array<[string, string, readonly string[]]> = [
    ['auth.users', 'id', users],
    ['public.profiles', 'id', users],
    ['public.study_preferences', 'user_id', users],
    ['public.notification_settings', 'user_id', users],
    ['public.automation_settings', 'user_id', users],
    ['public.formations', 'owner_id', users],
    ['public.modules', 'formation_id', formations],
    ['public.chapters', 'formation_id', formations],
    ['public.notions', 'formation_id', formations],
    ['public.notion_links', 'formation_id', formations],
    ['public.groups', 'owner_id', users],
    ['public.group_members', 'user_id', users],
    ['public.module_progress', 'user_id', users],
    ['public.chapter_progress', 'user_id', users],
    ['public.resources', 'owner_id', users],
    ['public.courses', 'owner_id', users],
    ['public.course_sections', 'owner_id', users],
    ['public.reading_progress', 'user_id', users],
    ['public.tutor_conversations', 'user_id', users],
    ['public.tutor_messages', 'conversation_id', conversations],
    ['public.bricks', 'owner_id', users],
    ['public.brick_versions', 'brick_id', bricks],
    ['public.activities', 'owner_id', users],
    ['public.attempts', 'user_id', users],
    ['public.answers', 'attempt_id', attempts],
    ['public.notion_states', 'user_id', users],
    ['public.review_logs', 'user_id', users],
    ['public.gap_events', 'user_id', users],
    ['public.schedule_slots', 'user_id', users],
    ['public.automation_actions', 'user_id', users],
    ['public.daily_activity', 'user_id', users],
    ['public.milestones', 'user_id', users],
    ['public.notifications', 'user_id', users],
  ];
  for (const [table, column, values] of scope) {
    counts[table] = await countRows(tx, table, column, values);
  }
  return counts;
}

async function verifySeed(tx: DbTx, catalog: SeededCatalog): Promise<SeedDemoSummary['checks']> {
  const sapId = demoFormationId('sap');
  const alex = demoUserId('alex');
  const modules = await tx.execute<{ count: number }>(
    sql`select count(*)::int as count from public.modules where formation_id = ${sapId}::uuid`,
  );
  const notions = await tx.execute<{ count: number }>(
    sql`select count(*)::int as count from public.notions where formation_id = ${sapId}::uuid`,
  );
  const activeOrProposed = await tx.execute<{ count: number }>(
    sql`select count(*)::int as count from public.formations
        where owner_id = ${alex}::uuid and status in ('active', 'programme_proposed')`,
  );
  const completed = await tx.execute<{ count: number }>(
    sql`select count(*)::int as count from public.formations
        where owner_id = ${alex}::uuid and status = 'completed'`,
  );
  const members = await tx.execute<{ count: number }>(
    sql`select count(*)::int as count from public.group_members
        where group_id = ${catalog.groupId}::uuid and left_at is null`,
  );
  const slots = await tx.execute<{ count: number }>(
    sql`select count(*)::int as count from public.schedule_slots
        where user_id = ${alex}::uuid
          and formation_id in (${demoFormationId('sap')}::uuid, ${demoFormationId('agile')}::uuid)
          and (starts_at at time zone 'Europe/Paris')::date between date '2026-11-09' and date '2026-11-13'`,
  );
  const days = await tx.execute<{ count: number }>(
    sql`select count(distinct (starts_at at time zone 'Europe/Paris')::date)::int as count
        from public.schedule_slots
        where user_id = ${alex}::uuid
          and formation_id in (${demoFormationId('sap')}::uuid, ${demoFormationId('agile')}::uuid)
          and (starts_at at time zone 'Europe/Paris')::date between date '2026-11-09' and date '2026-11-13'`,
  );
  const unread = await tx.execute<{ count: number }>(
    sql`select count(*)::int as count from public.notifications
        where user_id = ${alex}::uuid and read_at is null`,
  );
  const due = await tx.execute<{ count: number }>(
    sql`select count(*)::int as count from public.notion_states
        where user_id = ${alex}::uuid
          and notion_id in (select id from public.notions where formation_id = ${sapId}::uuid)
          and due_at <= ${DEMO_NOW_ISO}::timestamptz`,
  );
  const review = await tx.execute<{ count: number }>(
    sql`select count(*)::int as count from public.notion_states
        where user_id = ${alex}::uuid
          and notion_id in (select id from public.notions where formation_id = ${sapId}::uuid)
          and in_review`,
  );
  const gaps = await tx.execute<{ count: number }>(
    sql`select count(*)::int as count from public.notion_states
        where user_id = ${alex}::uuid
          and notion_id in (select id from public.notions where formation_id = ${sapId}::uuid)
          and gap_nature is not null`,
  );

  const values: Record<string, number> = {
    'sap.modules': modules[0]?.count ?? 0,
    'sap.notions': notions[0]?.count ?? 0,
    'formations.active_or_proposed': activeOrProposed[0]?.count ?? 0,
    'formations.completed': completed[0]?.count ?? 0,
    'group.members': members[0]?.count ?? 0,
    'agenda.slots': slots[0]?.count ?? 0,
    'agenda.days': days[0]?.count ?? 0,
    'notifications.unread': unread[0]?.count ?? 0,
    'notions.due': due[0]?.count ?? 0,
    'notions.review': review[0]?.count ?? 0,
    'notions.gaps': gaps[0]?.count ?? 0,
  };
  const expected: Record<string, number> = {
    'sap.modules': DEMO_EXPECTED.sapModules,
    'sap.notions': DEMO_EXPECTED.sapNotions,
    'formations.active_or_proposed': DEMO_EXPECTED.activeOrProposed,
    'formations.completed': DEMO_EXPECTED.completed,
    'group.members': DEMO_EXPECTED.groupMembers,
    'agenda.slots': DEMO_EXPECTED.agendaSlots,
    'agenda.days': DEMO_EXPECTED.agendaDays,
    'notifications.unread': DEMO_EXPECTED.unreadNotifications,
    'notions.due': DEMO_EXPECTED.dueNotions,
    'notions.review': DEMO_EXPECTED.reviewNotions,
    'notions.gaps': DEMO_EXPECTED.gaps,
  };

  const checks: SeedDemoSummary['checks'] = {};
  for (const [key, value] of Object.entries(expected)) {
    const observed = values[key] ?? 0;
    checks[key] = { expected: value, observed, ok: observed === value };
  }
  const failed = Object.entries(checks).filter(([, check]) => !check.ok);
  if (failed.length > 0) {
    throw new Error(
      `contrôles de seed en échec : ${failed
        .map(
          ([key, check]) => `${key}=${String(check.observed)} (attendu ${String(check.expected)})`,
        )
        .join(', ')}`,
    );
  }
  return checks;
}

async function runSeed(tx: DbTx, fixedAt: string): Promise<SeedDemoSummary> {
  const catalog: SeededCatalog = {
    formationIds: new Map(),
    moduleIds: new Map(),
    chapterIds: new Map(),
    notionIds: new Map(),
    notionIdBySlug: new Map(),
    courseIds: new Map(),
    activityIds: new Map(),
    attemptIds: new Map(),
    brickIds: [],
    brickVersionIds: new Map(),
    conversationIds: [],
    groupId: '',
  };

  await seedAccounts(tx);
  await seedFormations(tx, catalog);
  await tx.execute(
    sql`update public.profiles
        set current_formation_id = case id
          when ${demoUserId('alex')}::uuid then ${demoFormationId('sap')}::uuid
          else ${demoFormationId('agile')}::uuid
        end
        where id = any(${array(
          DEMO_USERS.map((user) => demoUserId(user.key)),
          'uuid[]',
        )})`,
  );
  await seedProgress(tx);
  await seedResources(tx, catalog);
  await seedCourses(tx, catalog);
  await seedBricksAndActivities(tx, catalog);
  await seedAgendaAndNotifications(tx, catalog);

  const counts = await tableCounts(tx, catalog);
  const checks = await verifySeed(tx, catalog);
  return {
    fingerprint: demoFixtureFingerprint(),
    fixedAt,
    tableCounts: counts,
    checks,
  };
}

export interface SeedDemoOptions {
  /** Transaction existante (tests `withRollback`) ; sinon une transaction service est ouverte. */
  tx?: DbTx;
  env?: DemoEnvironmentInput;
}

/** Charge le jeu de démonstration ; deux exécutions produisent les mêmes identifiants et comptes. */
export async function seedDemo(options: SeedDemoOptions = {}): Promise<SeedDemoSummary> {
  const env = assertDemoEnvironment(options.env ?? process.env);
  demoNow(options.env ?? process.env);
  try {
    if (options.tx !== undefined) return await runSeed(options.tx, env.fixedAt);
    return await serviceDb().transaction(async (tx) => runSeed(tx, env.fixedAt));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Seed de démonstration')) throw error;
    throw new Error(describeSeedFailure(error), { cause: error });
  }
}

/** Résumé lisible par la commande locale (une ligne par table + contrôles). */
export function formatSeedSummary(summary: SeedDemoSummary): string {
  const lines = [
    `✔ Jeu de démonstration chargé (empreinte ${summary.fingerprint.slice(0, 12)}…, horloge ${summary.fixedAt}).`,
    '',
    'Table                                  Lignes',
    ...Object.entries(summary.tableCounts).map(
      ([table, count]) => `${table.padEnd(38)} ${String(count).padStart(5)}`,
    ),
    '',
    ...Object.entries(summary.checks).map(
      ([key, check]) =>
        `${check.ok ? '✔' : '✖'} ${key} : ${String(check.observed)} (attendu ${String(check.expected)})`,
    ),
  ];
  return lines.join('\n');
}
