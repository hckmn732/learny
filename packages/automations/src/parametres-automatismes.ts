// SCR-15 « Paramètres : Automatismes » (SPEC-710, BR-SET-04, BR-AUT-12).
//
// The screen reads the display catalogue of `@learny/contracts` and these pure helpers: grouping
// of the ten automations, weekly counter, last action per automation and a stable journal order.
// The writes reuse the engine of SPEC-711 (`listMyAutomations`, `listMyAutomationActions`,
// `updateMyAutomationSetting`, `undoAutomationAction`) instead of duplicating the routes.
import {
  AUTOMATION_DISPLAY_DEFINITIONS,
  AUTOMATION_GROUPS,
  automationParamsSchema,
  type AutomationActionItem,
  type AutomationDisplayDefinition,
  type AutomationGroupId,
  type AutomationKey,
  type AutomationSettingField,
} from '@learny/contracts';
import { ok, type Result } from '@learny/core';
import type { ServiceContext } from '@learny/services';

import {
  listMyAutomationActions,
  listMyAutomations,
  undoAutomationAction,
  updateMyAutomationSetting,
  type AutomationJournalPage,
  type AutomationSettingsValue,
} from './moteur-d-automatismes';

export interface AutomationLastAction {
  at: string;
  summary: string;
  status: AutomationActionItem['status'];
}

export interface AutomationItemView {
  key: AutomationKey;
  enabled: boolean;
  params: Record<string, unknown>;
  /** The fields the screen may edit; empty when the automation is disabled (EF-2). */
  settings: readonly AutomationSettingField[];
  /** Raw values of the settings, ready for a controlled select or switch. */
  values: Record<string, string>;
  lastAction: AutomationLastAction | null;
}

export interface AutomationGroupView {
  id: AutomationGroupId;
  items: AutomationItemView[];
}

export interface AutomationSettingsView {
  activeCount: number;
  /** Number of group automations (nine); the pause card is counted separately. */
  totalCount: number;
  weeklyCount: number;
  paused: boolean;
  groups: AutomationGroupView[];
  journal: AutomationActionItem[];
}

function isAutomationKey(value: string): value is AutomationKey {
  return AUTOMATION_DISPLAY_DEFINITIONS.some((definition) => definition.key === value);
}

/** BR-AUT-12 — newest first, with an explicit identifier tie-break: never a random order. */
export function sortAutomationActions(
  actions: readonly AutomationActionItem[],
): AutomationActionItem[] {
  return [...actions].sort((left, right) => {
    const byInstant = right.createdAt.localeCompare(left.createdAt);
    return byInstant !== 0 ? byInstant : left.id.localeCompare(right.id);
  });
}

/** The journal of the week: the first `weekCount` entries of the stable newest-first list. */
export function weekAutomationJournal(
  actions: readonly AutomationActionItem[],
  weekCount: number,
): AutomationActionItem[] {
  return sortAutomationActions(actions).slice(0, Math.max(0, weekCount));
}

/** EF-2 — the settings are editable only while the automation is enabled. */
export function visibleAutomationSettings(
  definition: AutomationDisplayDefinition,
  enabled: boolean,
): readonly AutomationSettingField[] {
  return enabled ? definition.settings : [];
}

/** EF-2 — current value of each field, falling back to the canonical default. */
export function automationSettingValues(
  definition: AutomationDisplayDefinition,
  params: Record<string, unknown>,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of definition.settings) {
    const raw = params[field.param];
    values[field.param] =
      typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean'
        ? String(raw)
        : field.defaultValue;
  }
  return values;
}

/** CL-4 — converts one select value back to the type of the stored parameter. */
export function automationParamsWithField(
  current: Record<string, unknown>,
  field: AutomationSettingField,
  value: string,
): Record<string, unknown> {
  const next = { ...current };
  if (field.valueType === 'number') next[field.param] = Number(value);
  else if (field.valueType === 'boolean') next[field.param] = value === 'true';
  else next[field.param] = value;
  return next;
}

function defaultsOf(key: AutomationKey): Record<string, unknown> {
  const parsed = automationParamsSchema(key).safeParse({});
  return parsed.success ? (parsed.data as Record<string, unknown>) : {};
}

/**
 * Builds the whole SCR-15 state from the two reads of SPEC-711. The counter comes from the
 * server (`weekCount`, computed in the profile time zone); the journal is exactly that prefix, so
 * the counter and the visible rows can never disagree (CA-2).
 */
export function buildAutomationSettingsView(
  settings: AutomationSettingsValue,
  page: AutomationJournalPage,
): AutomationSettingsView {
  const sorted = sortAutomationActions(page.items);
  const journal = sorted.slice(0, Math.max(0, page.weekCount));
  const lastByKey = new Map<AutomationKey, AutomationActionItem>();
  for (const action of sorted) {
    if (!lastByKey.has(action.automation)) lastByKey.set(action.automation, action);
  }
  const settingsByKey = new Map(settings.items.map((item) => [item.automation, item]));

  const groups: AutomationGroupView[] = AUTOMATION_GROUPS.map((group) => ({
    id: group.id,
    items: group.keys.map((key) => {
      const definition = AUTOMATION_DISPLAY_DEFINITIONS.find((entry) => entry.key === key);
      if (definition === undefined) throw new Error(`Automatisme inconnu : ${key}.`);
      const setting = settingsByKey.get(key);
      const enabled = setting?.enabled ?? true;
      const params = setting?.params ?? defaultsOf(key);
      const last = lastByKey.get(key);
      return {
        key,
        enabled,
        params,
        settings: visibleAutomationSettings(definition, enabled),
        values: automationSettingValues(definition, params),
        lastAction:
          last === undefined
            ? null
            : {
                at: last.createdAt,
                // SPEC-713 EF-8 — the last-action line of the settings screen is the frozen one.
                summary:
                  key === 'micro_seance' &&
                  last.status === 'consumed' &&
                  typeof last.payload.lastActionSummary === 'string'
                    ? last.payload.lastActionSummary
                    : last.summary,
                status: last.status,
              },
      };
    }),
  }));

  const items = groups.flatMap((group) => group.items);
  return {
    activeCount: items.filter((item) => item.enabled).length,
    totalCount: items.length,
    weeklyCount: page.weekCount,
    paused: settings.paused,
    groups,
    journal,
  };
}

/** EF-1, EF-3 — reads the settings and the journal of the connected learner in one view. */
export async function loadAutomationSettingsView(
  ctx: ServiceContext,
): Promise<Result<AutomationSettingsView>> {
  const settings = await listMyAutomations(ctx);
  if (!settings.ok) return settings;
  const actions = await listMyAutomationActions(ctx, { limit: 100 });
  if (!actions.ok) return actions;
  return ok(buildAutomationSettingsView(settings.value, actions.value));
}

/** EF-2, ET-3 — one immediate write through the engine, returning the stored setting. */
export function updateAutomationSetting(
  ctx: ServiceContext,
  input: {
    automation: AutomationKey;
    enabled?: boolean | undefined;
    params?: Record<string, unknown> | undefined;
  },
): ReturnType<typeof updateMyAutomationSetting> {
  return updateMyAutomationSetting(ctx, input);
}

/** BR-AUT-12 — « Annuler » reuses the engine; a consumed action answers 422. */
export function undoAutomation(
  ctx: ServiceContext,
  actionId: string,
): ReturnType<typeof undoAutomationAction> {
  return undoAutomationAction(ctx, { actionId });
}

/** Is the published key part of the ten automations? (guards a route parameter). */
export function isAutomationKeyValue(value: string): value is AutomationKey {
  return isAutomationKey(value);
}
