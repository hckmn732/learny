// Engine of the automations (SPEC-711, ADR-0190).
//
// A definition declares `key`, `triggers`, a Zod `params` schema, a side-effect-free `run`, a
// one-line `explain`, an optional `apply` and an `undo`. The engine is the only writer of
// `automation_actions`: it checks the per-learner settings and the global pause (CL-5), computes
// the summary from `explain` (≤ 160 characters, ET-3), applies the effect of a non-consent action
// immediately, and leaves every action needing an agreement in `pending_consent` (BR-AUT-11).
// Events go through the transactional outbox of SPEC-203 and the notification through the
// unified service of SPEC-209 (quiet hours and daily cap), after the commit.
//
// Transactions: the proposals run on the service role (creation is reserved to the automation
// role, SPEC-108); the decisions of the learner (accept, decline, undo) run under RLS through
// `userDb`, so an action of another learner answers 404 without revealing its existence (CL-1).
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  AutomationActionItem,
  AutomationActionKind,
  AutomationSummary,
  decodeCursor,
  encodeCursor,
  EVENT_AUTOMATION_KEYS,
  EVENT_NOTIFICATION_TYPES,
  type AutomationActionStatus,
  type AutomationKey,
} from '@learny/contracts';
import {
  AppError,
  ok,
  startOfUserDay,
  toInstant,
  toUserZone,
  userLocalDay,
  type Clock,
  type LearnyLogger,
  type Result,
} from '@learny/core';
import {
  consumeAutomationAction,
  countAutomationActions,
  decideAutomationAction,
  expireDueAutomationActions,
  getAutomationAction,
  schema,
  serviceDb,
  undoAutomationAction as undoActionRow,
  type AutomationAction,
  type Db,
  type DbTx,
  type UserDatabase,
} from '@learny/db';
import { withTransaction } from '@learny/jobs';
import { notify } from '@learny/notifications';
import {
  createAutomationActionQuiet,
  listAutomationActionsFiltered,
  readActivePause,
  readAutomationSettings,
  upsertAutomationSetting,
} from '@learny/services';
import type { ServiceContext } from '@learny/services';

const { profiles } = schema;

const MS_PER_DAY = 86_400_000;

/* ------------------------------------------------------------------ */
/* Types of the contract (ADR-0190 §1)                                 */
/* ------------------------------------------------------------------ */

export type AutomationTone = 'vous' | 'tu';

/** `event` (an Inngest event), `hourly` (the `cron/hourly-tick`), `nightly`, or `direct`. */
export type AutomationTrigger =
  | { type: 'event'; name: string }
  | { type: 'hourly'; localHour: number | ((params: Record<string, unknown>) => number) }
  | { type: 'nightly' }
  | { type: 'direct' };

export type NotificationTypeName = (typeof EVENT_NOTIFICATION_TYPES)[number];

export interface AutomationNotificationDraft {
  type: NotificationTypeName;
  /** Internal relative path the notification opens; validated by the template. */
  href: string;
  expiresAt?: string;
  /** Optional values read by the notification template (`summary`, `title`, …). */
  data?: Record<string, unknown>;
}

/** One proposal returned by `run`; never applied by itself. */
export interface AutomationActionDraft {
  kind: string;
  formationId: string | null;
  requiresConsent: boolean;
  payload: Record<string, unknown>;
  undoPayload?: Record<string, unknown> | null;
  /** Idempotence key of the proposal (unique per learner and automation, ADR-0190 §2). */
  dedupeKey: string;
  notification?: AutomationNotificationDraft;
  /** ISO instant after which a pending action expires (hourly tick). */
  expiresAt?: string;
}

/** Read-only view handed to `run`; `db` may be the transaction of the caller. */
export interface AutomationDomainContext<P> {
  requestId: string;
  userId: string;
  db: Db | DbTx;
  clock: Clock;
  logger: LearnyLogger;
  timeZone: string;
  tone: AutomationTone;
  now: Date;
  /** Validated settings parameters of the automation. */
  params: P;
}

/** Transactional context handed to `apply` and `undo`. */
export interface AutomationEffectContext {
  requestId: string;
  userId: string;
  tx: DbTx;
  clock: Clock;
  logger: LearnyLogger;
  timeZone: string;
  tone: AutomationTone;
  now: Date;
}

/** A journal row projected for the definitions and the interface. */
export type AutomationActionView = z.infer<typeof AutomationActionItem>;

export interface AppliedEffect {
  payload?: Record<string, unknown>;
  undoPayload?: Record<string, unknown> | null;
}

export interface AutomationDefinition<
  P extends z.ZodType = z.ZodType<Record<string, unknown>, Record<string, unknown>>,
> {
  key: AutomationKey;
  triggers: AutomationTrigger[];
  /** Schema of the per-learner parameters; defaults must make `parse({})` succeed. */
  params: P;
  /** Reads the state and drafts the actions; no side effect (ADR-0190 §1). */
  run(
    ctx: AutomationDomainContext<z.output<P>>,
    trigger: AutomationTrigger,
  ): Promise<readonly AutomationActionDraft[]>;
  /** The one-line explanation (≤ 160 characters) stored as `summary`. */
  explain(action: AutomationActionView, tone: AutomationTone, timeZone: string): string;
  /** Applies the effect inside the engine transaction, without consent or at consent time. */
  apply?(
    ctx: AutomationEffectContext,
    action: AutomationActionView,
  ): Promise<Result<AppliedEffect>>;
  /** Cancels the effect; `AUTOMATION_ACTION_CONSUMED` once the effect was used (ADR-0190 §1). */
  undo?(
    ctx: AutomationEffectContext,
    action: AutomationActionView,
  ): Promise<Result<Record<string, unknown> | null>>;
  /**
   * SPEC-712 EF-9 — after an undo from the home banner, the engine runs the definition again in
   * `direct` mode so the proposal comes back with a suffixed `dedupeKey` (ADR-0191 §3). Other
   * definitions keep the default `false`: their behavior is unchanged.
   */
  reproposeAfterUndo?: boolean;
}

/** Identity helper that keeps the parameter and payload types of a definition. */
export function defineAutomation<
  P extends z.ZodType = z.ZodType<Record<string, unknown>, Record<string, unknown>>,
>(definition: AutomationDefinition<P>): AutomationDefinition<P> {
  return definition;
}

/* ------------------------------------------------------------------ */
/* Registry (ET-3)                                                     */
/* ------------------------------------------------------------------ */

export class AutomationRegistry {
  private readonly definitions = new Map<AutomationKey, AutomationDefinition<z.ZodType>>();

  /** Registers one definition per key at most (CA-1); an unknown key is a defect. */
  register(definition: AutomationDefinition<z.ZodType>): void {
    if (!z.enum(EVENT_AUTOMATION_KEYS).safeParse(definition.key).success) {
      throw new AppError('VALIDATION_FAILED', `Clé d'automatisme inconnue : ${definition.key}.`);
    }
    if (this.definitions.has(definition.key)) {
      throw new AppError(
        'CONFLICT',
        `Deux définitions pour l'automatisme « ${definition.key} » : le registre refuse le doublon.`,
      );
    }
    this.definitions.set(definition.key, definition);
  }

  get(key: AutomationKey): AutomationDefinition<z.ZodType> | undefined {
    return this.definitions.get(key);
  }

  /** The definition of a registered key, or a `NOT_FOUND` for a key without definition yet. */
  require(key: AutomationKey): AutomationDefinition<z.ZodType> {
    const definition = this.definitions.get(key);
    if (definition === undefined) {
      throw new AppError(
        'NOT_FOUND',
        `Aucune définition enregistrée pour l'automatisme « ${key} ».`,
      );
    }
    return definition;
  }

  keys(): AutomationKey[] {
    return [...this.definitions.keys()];
  }

  get size(): number {
    return this.definitions.size;
  }
}

export function createAutomationRegistry(): AutomationRegistry {
  return new AutomationRegistry();
}

/** The product registry: SPEC-712 to SPEC-721 register their definitions here. */
export const automationRegistry = createAutomationRegistry();

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

const pad = (value: number): string => String(value).padStart(2, '0');

function shiftCivilDay(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  if (year === undefined || month === undefined || date === undefined) {
    throw new AppError('VALIDATION_FAILED', 'Date civile invalide.');
  }
  const shifted = new Date(Date.UTC(year, month - 1, date) + days * MS_PER_DAY);
  return `${String(shifted.getUTCFullYear())}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/**
 * BR-AUT-12 — first instant of the learner's local week (Monday 00:00). Computed from the
 * injected instant and the IANA zone, never from the process (ADR-0047, ADR-0030).
 */
export function startOfUserWeek(at: Date | string, timeZone: string): Date {
  const zone = toUserZone(toInstant(at), timeZone);
  const monday = shiftCivilDay(zone.date, -(zone.weekday - 1));
  return startOfUserDay(monday, timeZone);
}

function validationError(path: string, message: string): AppError {
  return new AppError('VALIDATION_FAILED', `Champ « ${path} » invalide : ${message}`, {
    errors: [{ path, message }],
  });
}

function toView(action: AutomationAction): AutomationActionView {
  return AutomationActionItem.parse({
    id: action.id,
    automation: action.automation,
    kind: action.kind,
    summary: action.summary,
    formationId: action.formationId,
    payload: action.payload,
    undoPayload: action.undoPayload,
    requiresConsent: action.requiresConsent,
    status: action.status,
    decidedAt: action.decidedAt === null ? null : new Date(String(action.decidedAt)).toISOString(),
    createdAt: new Date(String(action.createdAt)).toISOString(),
  });
}

/** Validates a draft before any write (ET-3, CL-1); throws one clear `VALIDATION_FAILED`. */
export function validateDraft(
  definition: AutomationDefinition<z.ZodType>,
  draft: AutomationActionDraft,
  tone: AutomationTone,
  timeZone: string,
): { summary: string; payload: Record<string, unknown> } {
  if (
    typeof draft.dedupeKey !== 'string' ||
    draft.dedupeKey.trim().length === 0 ||
    draft.dedupeKey.length > 200
  ) {
    throw validationError(
      'dedupeKey',
      'une clé de déduplication de 1 à 200 caractères est requise',
    );
  }
  if (!AutomationActionKind.safeParse(draft.kind).success) {
    throw validationError('kind', 'type d’action snake_case de 1 à 80 caractères attendu');
  }
  const summary = definition.explain(
    {
      id: '',
      automation: definition.key,
      kind: draft.kind,
      summary: '',
      formationId: draft.formationId,
      payload: draft.payload,
      undoPayload: draft.undoPayload ?? null,
      requiresConsent: draft.requiresConsent,
      status: 'pending_consent',
      decidedAt: null,
      createdAt: '',
    },
    tone,
    timeZone,
  );
  const checked = AutomationSummary.safeParse(summary);
  if (!checked.success) {
    const message = checked.error.issues[0]?.message ?? 'résumé invalide';
    throw validationError('summary', `l'explication d'une ligne est refusée (${message})`);
  }
  const payload = { ...draft.payload, dedupeKey: draft.dedupeKey } as Record<string, unknown>;
  if (draft.expiresAt !== undefined) {
    const instant = z.iso.datetime({ offset: true }).safeParse(draft.expiresAt);
    if (!instant.success) throw validationError('expiresAt', 'instant ISO 8601 attendu');
    payload.expiresAt = new Date(draft.expiresAt).toISOString();
  }
  if (draft.notification !== undefined && !draft.notification.href.startsWith('/')) {
    throw validationError('notification.href', 'chemin interne commençant par « / » attendu');
  }
  return { summary: checked.data, payload };
}

/* ------------------------------------------------------------------ */
/* Proposal (EF-2, EF-4, ET-4)                                         */
/* ------------------------------------------------------------------ */

export interface AutomationEngineContext {
  requestId: string;
  sdb: Db;
  clock: Clock;
  logger: LearnyLogger;
}

export interface RunAutomationInput {
  key: AutomationKey;
  userId: string;
  trigger: AutomationTrigger;
}

export interface RunAutomationResult {
  /** Number of actions written by this call. */
  created: number;
  /** Why nothing was proposed: the setting is off, or the account is paused (CL-5). */
  skipped: 'disabled' | 'paused' | null;
  /** Identifiers of the actions created by this call. */
  actionIds: string[];
  /** Identifiers of the actions already known for the same `dedupeKey` (EF-4). */
  duplicateIds: string[];
}

async function toResult<T>(flow: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await flow());
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error };
    throw error;
  }
}

interface Profile {
  timeZone: string;
  tone: AutomationTone;
}

async function readProfile(db: Db, userId: string): Promise<Profile> {
  const rows = await db
    .select({ timezone: profiles.timezone, tutorTone: profiles.tutorTone })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  const row = rows[0];
  if (row === undefined) throw new AppError('NOT_FOUND', 'Profil introuvable.');
  return { timeZone: row.timezone, tone: row.tutorTone === 'tu' ? 'tu' : 'vous' };
}

interface SettingsRow {
  enabled: boolean;
  params: Record<string, unknown> | null;
}

function readSetting(
  rows: { key: AutomationKey; enabled: boolean; params: Record<string, unknown> }[],
  key: AutomationKey,
): SettingsRow {
  const row = rows.find((entry) => entry.key === key);
  if (row === undefined) return { enabled: true, params: null };
  return { enabled: row.enabled, params: row.params };
}

/**
 * EF-2 — one proposal per draft, written in one transaction with the outbox entries. The setting
 * and the global pause are checked first (CL-5); a replayed trigger finds the same `dedupeKey`
 * and creates nothing (EF-4, CA-2).
 */
export function runAutomation(
  engine: AutomationEngineContext,
  input: RunAutomationInput,
  opts: { registry?: AutomationRegistry } = {},
): Promise<Result<RunAutomationResult>> {
  return toResult(async () => {
    const registry = opts.registry ?? automationRegistry;
    const definition = registry.require(input.key);
    const now = engine.clock.now();
    const profile = await readProfile(engine.sdb, input.userId);
    const settings = readSetting(
      await engine.sdb.transaction((tx) => readAutomationSettings(tx, input.userId)),
      input.key,
    );
    if (!settings.enabled) {
      return { created: 0, skipped: 'disabled', actionIds: [], duplicateIds: [] };
    }
    const parsed = definition.params.safeParse(settings.params ?? {});
    if (!parsed.success) {
      throw validationError(
        'params',
        'réglages invalides : recharger les réglages de l’automatisme',
      );
    }
    // CL-5 — a global pause suspends every key except `pause`; the journal stays intact.
    if (input.key !== 'pause') {
      const paused = await engine.sdb.transaction((tx) =>
        readActivePause(tx, input.userId, userLocalDay(now, profile.timeZone)),
      );
      if (paused !== null)
        return { created: 0, skipped: 'paused', actionIds: [], duplicateIds: [] };
    }

    const drafts = await definition.run(
      {
        requestId: engine.requestId,
        userId: input.userId,
        db: engine.sdb,
        clock: engine.clock,
        logger: engine.logger,
        timeZone: profile.timeZone,
        tone: profile.tone,
        now,
        params: parsed.data,
      },
      input.trigger,
    );

    const actionIds: string[] = [];
    const duplicateIds: string[] = [];
    const notified: { actionId: string; draft: AutomationActionDraft }[] = [];

    await withTransaction(engine.sdb, async (tx, outbox) => {
      for (const draft of drafts) {
        const checked = validateDraft(definition, draft, profile.tone, profile.timeZone);
        const inserted = await createAutomationActionQuiet(tx, {
          userId: input.userId,
          formationId: draft.formationId,
          automation: input.key,
          kind: draft.kind,
          summary: checked.summary,
          payload: checked.payload,
          undoPayload: draft.undoPayload ?? null,
          requiresConsent: draft.requiresConsent,
          createdAt: now,
        });
        if (!inserted.created || inserted.action === null) {
          duplicateIds.push(inserted.action?.id ?? '');
          continue;
        }
        const action = inserted.action;
        actionIds.push(action.id);
        if (!draft.requiresConsent && definition.apply !== undefined) {
          const applied = await definition.apply(
            {
              requestId: engine.requestId,
              userId: input.userId,
              tx,
              clock: engine.clock,
              logger: engine.logger,
              timeZone: profile.timeZone,
              tone: profile.tone,
              now,
            },
            toView({ ...action, status: 'applied' }),
          );
          if (!applied.ok) throw applied.error;
          if (applied.value.undoPayload !== undefined || applied.value.payload !== undefined) {
            const appliedView = toView({ ...action, status: 'applied' });
            await tx
              .update(schema.automationActions)
              .set({
                summary: definition.explain(appliedView, profile.tone, profile.timeZone),
                ...(applied.value.payload === undefined ? {} : { payload: applied.value.payload }),
                ...(applied.value.undoPayload === undefined
                  ? {}
                  : { undoPayload: applied.value.undoPayload ?? null }),
              })
              .where(eq(schema.automationActions.id, action.id));
          }
        }
        outbox.add(
          draft.requiresConsent ? 'automation/action-proposed' : 'automation/action-applied',
          { userId: input.userId, actionId: action.id, automation: input.key },
          { id: `automation-action:${action.id}` },
        );
        if (draft.notification !== undefined) notified.push({ actionId: action.id, draft });
      }
    });

    // After the commit: the notification goes through the unified service (SPEC-209), which
    // applies the quiet hours and the daily cap; its dedupe key is the action identifier (EF-4).
    for (const item of notified) {
      const draft = item.draft;
      if (draft.notification === undefined) continue;
      const result = await notify(engine, {
        userId: input.userId,
        type: draft.notification.type,
        formationId: draft.formationId,
        data: {
          ...(draft.notification.data ?? {}),
          href: draft.notification.href,
          automation: input.key,
        },
        dedupeKey: `automation:${item.actionId}`,
        eligibleAt: now.toISOString(),
      });
      if (!result.ok)
        engine.logger.warn('automation notification failed', {
          outcome: 'automation_notify_failed',
        });
    }

    return { created: actionIds.length, skipped: null, actionIds, duplicateIds };
  });
}

/* ------------------------------------------------------------------ */
/* Decisions of the learner (EF-2, EF-3, ET-5, CL-1 to CL-4)            */
/* ------------------------------------------------------------------ */

/** Output types of the settings service, mirroring the contracts. */
export interface AutomationSettingValue {
  automation: AutomationKey;
  enabled: boolean;
  params: Record<string, unknown>;
  updatedAt: string | null;
}

export interface AutomationSettingsValue {
  items: AutomationSettingValue[];
  paused: boolean;
}

function requireUser(ctx: ServiceContext): { userId: string; db: UserDatabase } {
  if (ctx.userId === null || ctx.db === null) {
    throw new AppError('UNAUTHENTICATED', 'Vous devez être connecté pour effectuer cette action.');
  }
  return { userId: ctx.userId, db: ctx.db };
}

/** BR-AUT-12 — journal of the learner, newest first, with the weekly counter. */
export interface AutomationJournalQuery {
  status?: AutomationActionStatus | undefined;
  kind?: string | undefined;
  automation?: AutomationKey | undefined;
  formationId?: string | undefined;
  since?: string | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

export interface AutomationJournalPage {
  items: AutomationActionView[];
  weekCount: number;
  nextCursor: string | null;
}

export type AcceptAutomationInput = {
  actionId: string;
  choice?: Record<string, unknown> | undefined;
};
export type RefAutomationInput = { actionId: string };

const LIMIT_MAX = 100;

function definitionOf(
  registry: AutomationRegistry,
  key: AutomationKey,
): AutomationDefinition<z.ZodType> | undefined {
  return registry.get(key);
}

async function decisionProfile(tx: DbTx, userId: string): Promise<Profile> {
  const rows = await tx
    .select({ timezone: profiles.timezone, tutorTone: profiles.tutorTone })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  const row = rows[0];
  if (row === undefined) throw new AppError('NOT_FOUND', 'Profil introuvable.');
  return { timeZone: row.timezone, tone: row.tutorTone === 'tu' ? 'tu' : 'vous' };
}

/** EF-3, ET-5 — the ten settings of the learner, with the defaults of the registry. */
export function listMyAutomations(ctx: ServiceContext): Promise<Result<AutomationSettingsValue>> {
  return toResult(async () => {
    const user = requireUser(ctx);
    const now = ctx.clock.now();
    return user.db.run(async (tx) => {
      const profile = await decisionProfile(tx, user.userId);
      const rows = await readAutomationSettings(tx, user.userId);
      const items = EVENT_AUTOMATION_KEYS.map((key) => {
        const row = rows.find((entry) => entry.key === key);
        const definition = definitionOf(automationRegistry, key);
        let params: Record<string, unknown> = row?.params ?? {};
        if (definition !== undefined) {
          const parsed = definition.params.safeParse(row?.params ?? {});
          if (parsed.success) params = parsed.data as Record<string, unknown>;
        }
        return {
          automation: key,
          enabled: row?.enabled ?? true,
          params,
          updatedAt: row === undefined ? null : row.updatedAt.toISOString(),
        };
      });
      // CL-5 — the pause state is surfaced so the interface can explain a suspended automatism.
      const paused =
        (await readActivePause(tx, user.userId, userLocalDay(now, profile.timeZone))) !== null;
      return { items, paused };
    });
  });
}

/** EF-3, ET-5 — validates `params` with the schema of the automation, then upserts the row. */
export function updateMyAutomationSetting(
  ctx: ServiceContext,
  input: {
    automation: AutomationKey;
    enabled?: boolean | undefined;
    params?: Record<string, unknown> | undefined;
  },
): Promise<Result<AutomationSettingValue>> {
  return toResult(async () => {
    const user = requireUser(ctx);
    const now = ctx.clock.now();
    return user.db.run(async (tx) => {
      const rows = await readAutomationSettings(tx, user.userId);
      const current = rows.find((entry) => entry.key === input.automation);
      const definition = definitionOf(automationRegistry, input.automation);
      let params = current?.params ?? {};
      if (input.params !== undefined) {
        if (definition === undefined) {
          throw validationError(
            'params',
            'cet automatisme ne définit pas encore de paramètres (SPEC-712 à 721)',
          );
        }
        const parsed = definition.params.safeParse(input.params);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          throw validationError(
            `params.${issue?.path.map(String).join('.') ?? '(racine)'}`,
            issue?.message ?? 'paramètres invalides',
          );
        }
        params = parsed.data as Record<string, unknown>;
      }
      const row = await upsertAutomationSetting(tx, {
        userId: user.userId,
        key: input.automation,
        enabled: input.enabled ?? current?.enabled ?? true,
        params,
        now,
      });
      return {
        automation: row.key,
        enabled: row.enabled,
        params: row.params,
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  });
}

/** ET-5, BR-AUT-12 — the filtered journal page and the « N actions cette semaine » counter. */
export function listMyAutomationActions(
  ctx: ServiceContext,
  query: AutomationJournalQuery,
): Promise<Result<AutomationJournalPage>> {
  return toResult(async () => {
    const user = requireUser(ctx);
    const now = ctx.clock.now();
    return user.db.run(async (tx) => {
      const profile = await decisionProfile(tx, user.userId);
      const limit = Math.min(Math.max(query.limit ?? 20, 1), LIMIT_MAX);
      const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
      const page = await listAutomationActionsFiltered(tx, {
        userId: user.userId,
        status: query.status,
        kind: query.kind,
        automation: query.automation,
        formationId: query.formationId,
        since: query.since === undefined ? undefined : toInstant(query.since),
        limit,
        cursorK: cursor?.k ?? undefined,
        cursorId: cursor?.id ?? undefined,
      });
      const weekCount = await countAutomationActions(tx, {
        userId: user.userId,
        since: startOfUserWeek(now, profile.timeZone),
      });
      return {
        items: page.rows.map(toView),
        weekCount,
        nextCursor:
          page.nextCursorK === null || page.nextCursorId === null
            ? null
            : encodeCursor({ k: page.nextCursorK, id: page.nextCursorId }),
      };
    });
  });
}

/**
 * EF-2, ET-5 — one decision inside the learner's RLS transaction: the repository locks the row,
 * refuses a foreign or already-decided action with 404/409 (CL-1, CL-3), flips the status, the
 * definition applies the effect at consent time, and the domain event is queued in the same
 * transaction and sent after the commit (CA-2).
 */
function decide(
  ctx: ServiceContext,
  decision: 'accept' | 'decline',
  input: AcceptAutomationInput,
  opts: { registry?: AutomationRegistry },
): Promise<Result<AutomationActionView>> {
  return toResult(async () => {
    const registry = opts.registry ?? automationRegistry;
    const user = requireUser(ctx);
    const now = ctx.clock.now();
    const view = await withTransaction(user.db, async (tx, outbox) => {
      const profile = await decisionProfile(tx, user.userId);
      // CL-1, CA-2 — lock the row first: a foreign identifier is a 404, a concurrent second
      // decision sees the committed status and changes nothing (idempotent replay).
      const locked = await tx.execute<{ status: AutomationActionStatus }>(sql`
        select status::text as status from public.automation_actions
        where id = ${input.actionId}::uuid and user_id = ${user.userId}::uuid
        for update
      `);
      const before = locked[0];
      if (before === undefined) {
        throw new AppError('NOT_FOUND', 'Action introuvable.');
      }
      const target: AutomationActionStatus = decision === 'accept' ? 'applied' : 'declined';
      if (before.status === target) {
        // Idempotent replay: the committed answer is returned as is, with no second effect.
        const existing = await getAutomationAction(tx, {
          userId: user.userId,
          actionId: input.actionId,
        });
        if (existing === null) throw new AppError('NOT_FOUND', 'Action introuvable.');
        return toView(existing);
      }
      if (before.status !== 'pending_consent') {
        // CL-3 — an expired, consumed, undone or declined action no longer waits for consent.
        throw new AppError(
          'CONFLICT',
          'Cette action n’attend plus d’accord : rechargez le journal pour voir son état.',
        );
      }
      const action = await decideAutomationAction(tx, {
        userId: user.userId,
        actionId: input.actionId,
        decision,
        decidedAt: now,
      });
      const definition = definitionOf(registry, action.automation);
      if (decision === 'accept' && definition?.apply !== undefined) {
        const payload =
          input.choice === undefined ? action.payload : { ...action.payload, choice: input.choice };
        const applied = await definition.apply(
          {
            requestId: ctx.requestId,
            userId: user.userId,
            tx,
            clock: ctx.clock,
            logger: ctx.logger,
            timeZone: profile.timeZone,
            tone: profile.tone,
            now,
          },
          toView({ ...action, payload, status: 'applied' }),
        );
        if (!applied.ok) throw applied.error;
        const payloadAfter = applied.value.payload;
        const undoAfter = applied.value.undoPayload;
        // EF-8 — the one-line summary follows the new status, so the journal reads
        // « C’est noté : … » once the learner accepted the proposal.
        const finalPayload = payloadAfter ?? payload;
        const summaryAfter = definition.explain(
          toView({ ...action, payload: finalPayload, status: 'applied' }),
          profile.tone,
          profile.timeZone,
        );
        if (payloadAfter !== undefined || undoAfter !== undefined) {
          await tx
            .update(schema.automationActions)
            .set({
              summary: summaryAfter,
              ...(payloadAfter === undefined ? {} : { payload: payloadAfter }),
              ...(undoAfter === undefined ? {} : { undoPayload: undoAfter ?? null }),
            })
            .where(eq(schema.automationActions.id, action.id));
        } else {
          await tx
            .update(schema.automationActions)
            .set({ summary: summaryAfter })
            .where(eq(schema.automationActions.id, action.id));
        }
      }
      if (decision === 'accept') {
        // One committed effect, one event: the explicit identifier makes a replay a no-op (CA-2).
        outbox.add(
          'automation/action-applied',
          { userId: user.userId, actionId: action.id, automation: action.automation },
          { id: `automation-action-applied:${action.id}` },
        );
      }
      if (decision === 'decline' && definition !== undefined) {
        // EF-8 — the journal reads « Refusé : … » from the first render after the decision.
        const declined = toView({ ...action, status: 'declined' });
        await tx
          .update(schema.automationActions)
          .set({ summary: definition.explain(declined, profile.tone, profile.timeZone) })
          .where(eq(schema.automationActions.id, action.id));
      }
      const final = await getAutomationAction(tx, {
        userId: user.userId,
        actionId: input.actionId,
      });
      if (final === null) throw new AppError('NOT_FOUND', 'Action introuvable.');
      return toView(final);
    });
    return view;
  });
}

/** EF-3, ET-5 — accepts a pending action and applies the effect once (CA-2, CL-3). */
export function acceptAutomationAction(
  ctx: ServiceContext,
  input: AcceptAutomationInput,
  opts: { registry?: AutomationRegistry } = {},
): Promise<Result<AutomationActionView>> {
  return decide(ctx, 'accept', input, opts);
}

/** EF-2, ET-5 — declines a pending action; the journal keeps the row (BR-AUT-12). */
export function declineAutomationAction(
  ctx: ServiceContext,
  input: RefAutomationInput,
  opts: { registry?: AutomationRegistry } = {},
): Promise<Result<AutomationActionView>> {
  return decide(ctx, 'decline', { actionId: input.actionId }, opts);
}

/**
 * EF-3, CL-4 — undoes an applied action through the definition; a consumed action answers 422
 * `AUTOMATION_ACTION_CONSUMED` and keeps its history (BR-AUT-11).
 */
export function undoAutomationAction(
  ctx: ServiceContext,
  input: RefAutomationInput,
  opts: { registry?: AutomationRegistry } = {},
): Promise<Result<AutomationActionView>> {
  return toResult(async () => {
    const registry = opts.registry ?? automationRegistry;
    const user = requireUser(ctx);
    const now = ctx.clock.now();
    const repropose: { key: AutomationKey; definition: AutomationDefinition<z.ZodType> }[] = [];
    const view = await withTransaction(user.db, async (tx, outbox) => {
      const current = await getAutomationAction(tx, {
        userId: user.userId,
        actionId: input.actionId,
      });
      if (current === null) throw new AppError('NOT_FOUND', 'Action introuvable.');
      if (current.status === 'consumed') {
        throw new AppError(
          'AUTOMATION_ACTION_CONSUMED',
          'Cette action a déjà été consommée : elle ne peut plus être annulée.',
        );
      }
      const profile = await decisionProfile(tx, user.userId);
      const definition = definitionOf(registry, current.automation);
      if (definition?.undo !== undefined) {
        const undone = await definition.undo(
          {
            requestId: ctx.requestId,
            userId: user.userId,
            tx,
            clock: ctx.clock,
            logger: ctx.logger,
            timeZone: profile.timeZone,
            tone: profile.tone,
            now,
          },
          toView(current),
        );
        if (!undone.ok) throw undone.error;
      }
      const action = await undoActionRow(tx, {
        userId: user.userId,
        actionId: input.actionId,
        undoneAt: now,
      });
      // EF-8 — the summary follows the new status, so the journal reads « Annulé : … ».
      if (definition !== undefined) {
        const summaryAfter = definition.explain(
          toView({ ...action, status: 'undone' }),
          profile.tone,
          profile.timeZone,
        );
        await tx
          .update(schema.automationActions)
          .set({ summary: summaryAfter })
          .where(eq(schema.automationActions.id, action.id));
        if (definition.reproposeAfterUndo === true && current.status === 'applied') {
          repropose.push({ key: current.automation, definition });
        }
      }
      // BR-AUT-12 — the journal keeps the cancelled row; the event goes out after the commit.
      outbox.add(
        'automation/action-undone',
        { userId: user.userId, actionId: action.id, automation: action.automation },
        { id: `automation-action-undone:${action.id}` },
      );
      return toView({ ...action });
    });
    // ADR-0191 §3 — the proposal comes back right after the undo, with a suffixed dedupe key.
    // The proposal is written on the service role, like every other proposal of the engine; a
    // failure never cancels the committed undo.
    const againWith = repropose[0];
    if (againWith !== undefined) {
      const again = await runAutomation(
        { requestId: ctx.requestId, sdb: serviceDb(), clock: ctx.clock, logger: ctx.logger },
        { key: againWith.key, userId: user.userId, trigger: { type: 'direct' } },
        opts,
      );
      if (!again.ok) {
        ctx.logger.warn('automation repropose failed', { outcome: 'repropose_failed' });
      }
    }
    return view;
  });
}

/* ------------------------------------------------------------------ */
/* Expiry and consumption (ET-4, ADR-0190 §2)                          */
/* ------------------------------------------------------------------ */

/** CL-3 — expires the pending actions whose `expiresAt` has passed; the tick calls it hourly. */
export function expirePendingActions(engine: AutomationEngineContext): Promise<Result<number>> {
  return toResult(async () => {
    const rows = await expireDueAutomationActions(engine.sdb, { now: engine.clock.now() });
    return rows.length;
  });
}

/**
 * BR-AUT-11 — marks an applied action as consumed (the effect was used, e.g. a micro-session was
 * done); the learner can no longer undo it. The caller runs it inside its own transaction when
 * one is open; `userId` is always given explicitly.
 */
export async function markConsumed(
  db: Db | DbTx,
  input: { actionId: string; userId: string },
): Promise<AutomationAction> {
  return consumeAutomationAction(db, { userId: input.userId, actionId: input.actionId });
}
