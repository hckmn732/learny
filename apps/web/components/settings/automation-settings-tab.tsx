'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import type { PauseStateDto } from '@learny/contracts/automatisme-10-mode-pause-et-retour';
import type {
  AutomationActionItem,
  AutomationKey,
  AutomationSettingsDto,
} from '@learny/contracts/moteur-d-automatismes';
import {
  AUTOMATION_GROUPS,
  AUTOMATION_PAUSE_KEY,
  automationDisplayDefinition,
  type AutomationDisplayDefinition,
} from '@learny/contracts/parametres-automatismes';
import type { NotificationSettingsDto } from '@learny/contracts/parametres-notifications';
import { addCivilDays, clock, formatUserDate, startOfUserDay, toUserZone } from '@learny/core';
import { Button, Card, ErrorState, FormError, Select, SkeletonGroup, Switch } from '@learny/ui';
import { cn } from '@learny/ui';

import { ApiError, api } from '../../lib/api-client';
import { fr } from '../../messages/fr/settings';

const t = fr.settings.automations;

const GROUP_TILE: Record<'decrochage' | 'memoire' | 'quiz', string> = {
  decrochage: 'bg-orange',
  memoire: 'bg-green',
  quiz: 'bg-indigo',
};

interface FieldMessages {
  label: string;
  options: Record<string, string>;
}

function fieldMessages(key: AutomationKey, param: string): FieldMessages {
  const item = t.items[key] as unknown as { settings: Record<string, FieldMessages> };
  return item.settings[param] ?? { label: param, options: {} };
}

function automationValues(
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

function paramsWithField(
  current: Record<string, unknown>,
  param: string,
  valueType: 'string' | 'number' | 'boolean',
  value: string,
): Record<string, unknown> {
  return {
    ...current,
    [param]:
      valueType === 'number' ? Number(value) : valueType === 'boolean' ? value === 'true' : value,
  };
}

function sortActions(actions: readonly AutomationActionItem[]): AutomationActionItem[] {
  return [...actions].sort((left, right) => {
    const byInstant = right.createdAt.localeCompare(left.createdAt);
    return byInstant !== 0 ? byInstant : left.id.localeCompare(right.id);
  });
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function journalDate(iso: string, timeZone: string): string {
  return capitalize(
    formatUserDate(iso, timeZone, {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }),
  );
}

function lastActionDate(iso: string, timeZone: string): string {
  return capitalize(
    formatUserDate(iso, timeZone, {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }),
  );
}

/** Upcoming Sundays of the profile zone, from the injected clock (ADR-0047). */
function pauseOptions(timeZone: string): { value: string; label: string }[] {
  const zone = toUserZone(clock.now(), timeZone);
  const toSunday = (7 - zone.weekday) % 7;
  return [0, 1, 2].map((offset) => {
    const day = addCivilDays(zone.date, toSunday + offset * 7);
    return {
      value: day,
      label: formatUserDate(startOfUserDay(day, timeZone), timeZone, {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
      }),
    };
  });
}

function pauseLabel(day: string, timeZone: string): string {
  return formatUserDate(startOfUserDay(day, timeZone), timeZone, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

export interface AutomationSettingsTabProps {
  timeZone: string;
  initialNotifications: NotificationSettingsDto | null;
  requestId?: string;
}

/** SCR-15, onglet Automatismes — groupes, interrupteurs, réglages, pause, garde-fous et journal. */
export function AutomationSettingsTab({
  timeZone,
  initialNotifications,
  requestId,
}: AutomationSettingsTabProps) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['automations', 'settings'],
    queryFn: () => api.meAutomationsList({}),
    retry: false,
  });
  const actionsQuery = useQuery({
    queryKey: ['automation-actions', 'week'],
    queryFn: () => api.meAutomationActionsList({ query: { limit: 100 } }),
    retry: false,
  });
  const pauseStateQuery = useQuery({
    queryKey: ['pause', 'state'],
    queryFn: () => api.mePauseGet({}),
    retry: false,
  });
  const [pending, setPending] = useState<string | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pauseUntil, setPauseUntil] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

  const settings = settingsQuery.data;
  const actions = actionsQuery.data;
  const pauseState = pauseStateQuery.data;
  const sortedActions = useMemo(() => sortActions(actions?.items ?? []), [actions]);
  const weekly = sortedActions.slice(0, actions?.weekCount ?? 0);
  const lastByKey = useMemo(() => {
    const map = new Map<AutomationKey, AutomationActionItem>();
    for (const action of sortedActions) {
      if (!map.has(action.automation)) map.set(action.automation, action);
    }
    return map;
  }, [sortedActions]);
  const settingsByKey = useMemo(
    () => new Map((settings?.items ?? []).map((item) => [item.automation, item])),
    [settings],
  );

  const refetchSettings = async (): Promise<void> => {
    try {
      await settingsQuery.refetch();
    } catch {
      // The current screen stays; the error and the retry remain visible.
    }
  };

  const saveSetting = async (
    automation: AutomationKey,
    body: { enabled?: boolean; params?: Record<string, unknown> },
    key: string,
  ): Promise<boolean> => {
    if (pending !== null) return false;
    setPending(key);
    setError(null);
    setStatus(null);
    try {
      const next = await api.meAutomationsUpdate({ body: { automation, ...body } });
      queryClient.setQueryData<AutomationSettingsDto>(['automations', 'settings'], (current) => {
        if (current === undefined) return current;
        return {
          ...current,
          items: current.items.map((item) => (item.automation === next.automation ? next : item)),
        };
      });
      setStatus(t.saved);
      return true;
    } catch (cause) {
      await refetchSettings();
      setError(cause instanceof ApiError ? cause.detail : t.saveError);
      return false;
    } finally {
      setPending(null);
    }
  };

  const startPauseMode = async (): Promise<void> => {
    if (pending !== null || selectedPauseUntil === '') return;
    setPending('pause-start');
    setError(null);
    setStatus(null);
    try {
      const state = await api.mePauseStart({
        body: {
          endDate: selectedPauseUntil,
          diagnosticEnabled: diagnosticValue === 'true',
        },
      });
      queryClient.setQueryData<PauseStateDto>(['pause', 'state'], state);
      await Promise.all([refetchSettings(), actionsQuery.refetch()]);
      setStatus(t.pauseScheduled(pauseLabel(state.endsOn ?? selectedPauseUntil, timeZone)));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.detail : t.saveError);
    } finally {
      setPending(null);
    }
  };

  const resumePauseMode = async (): Promise<void> => {
    if (pending !== null) return;
    setPending('pause-resume');
    setError(null);
    setStatus(null);
    try {
      const state = await api.mePauseEnd({});
      queryClient.setQueryData<PauseStateDto>(['pause', 'state'], state);
      await Promise.all([
        refetchSettings(),
        actionsQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ['home'] }),
        queryClient.invalidateQueries({ queryKey: ['agenda'] }),
      ]);
      setStatus(
        state.diagnostic === null
          ? t.pauseResumed
          : t.pauseDiagnosticProposed(state.diagnostic.minutes),
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.detail : t.saveError);
    } finally {
      setPending(null);
    }
  };

  const undo = async (actionId: string): Promise<void> => {
    if (undoing !== null) return;
    setUndoing(actionId);
    setError(null);
    setStatus(null);
    try {
      await api.meAutomationActionUndo({ params: { id: actionId } });
      await Promise.all([
        actionsQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ['home'] }),
        queryClient.invalidateQueries({ queryKey: ['agenda'] }),
      ]);
      setStatus(t.saved);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.detail : t.undoError);
    } finally {
      setUndoing(null);
    }
  };

  if (settingsQuery.isPending || actionsQuery.isPending || pauseStateQuery.isPending) {
    return (
      <Card as="section" data-testid="automation-panel" aria-busy="true">
        <SkeletonGroup label={t.loading}>
          <div className="h-96" />
          <div className="h-96" />
        </SkeletonGroup>
        <p className="m-0 text-14 text-ink-muted">{t.loading}</p>
      </Card>
    );
  }

  if (
    settingsQuery.isError ||
    actionsQuery.isError ||
    pauseStateQuery.isError ||
    settings === undefined ||
    actions === undefined
  ) {
    const request =
      requestId ??
      (settingsQuery.error instanceof ApiError ? settingsQuery.error.requestId : undefined);
    return (
      <Card as="section" data-testid="automation-panel">
        <ErrorState
          data-testid="automation-error-state"
          title={t.errorTitle}
          {...(request === undefined ? {} : { requestId: request })}
          onRetry={() => {
            void Promise.all([
              settingsQuery.refetch(),
              actionsQuery.refetch(),
              pauseStateQuery.refetch(),
            ]);
          }}
        />
      </Card>
    );
  }

  const pauseSetting = settingsByKey.get(AUTOMATION_PAUSE_KEY);
  const pauseEnabled = pauseSetting?.enabled ?? true;
  const pauseParams = pauseSetting?.params ?? {};
  const pauseDates = pauseOptions(timeZone);
  const storedPauseUntil =
    typeof pauseParams.pauseUntil === 'string' ? pauseParams.pauseUntil : null;
  const selectedPauseUntil =
    pauseUntil ??
    (storedPauseUntil !== null && pauseDates.some((option) => option.value === storedPauseUntil)
      ? storedPauseUntil
      : (pauseDates[1]?.value ?? pauseDates[0]?.value ?? ''));
  const diagnosticValue =
    diagnostic ?? (pauseParams.diagnosticOnReturn === false ? 'false' : 'true');

  return (
    <div className="flex flex-col gap-24" data-testid="automation-panel">
      <section
        aria-label="Principe des automatismes"
        className="flex flex-wrap items-center gap-20 rounded-24 bg-ink px-28 py-24 text-white"
        data-testid="automation-principle"
      >
        <div className="flex flex-[2_1_380px] flex-col gap-8">
          <p className="m-0 font-display text-22 font-600 leading-1.25">{t.principle}</p>
          <p className="m-0 text-14 font-600 text-lime" data-testid="automation-summary">
            {settings.paused ? <span>{t.pausedPrefix}</span> : null}
            <span data-testid="automation-active-count">
              {t.activeCount(
                AUTOMATION_GROUPS.flatMap((group) => group.keys).filter(
                  (key) => settingsByKey.get(key)?.enabled ?? true,
                ).length,
                AUTOMATION_GROUPS.flatMap((group) => group.keys).length,
              )}
            </span>
            {' · '}
            <span data-testid="automation-count">{t.count(actions.weekCount)}</span>
          </p>
        </div>
        <ul className="m-0 flex flex-[1_1_260px] list-none flex-col gap-8 p-0 text-13 text-white/75">
          {t.principlePoints.map((point) => (
            <li className="flex gap-8" key={point}>
              <span aria-hidden="true" className="text-lime">
                ✓
              </span>
              {point}
            </li>
          ))}
        </ul>
      </section>

      {AUTOMATION_GROUPS.map((group) => (
        <section
          aria-labelledby={`automation-group-${group.id}`}
          className="flex flex-col gap-10 rounded-24 border border-solid border-border bg-surface px-24 py-22"
          data-testid="automation-group"
          key={group.id}
        >
          <div className="flex items-center gap-12">
            <span
              aria-hidden="true"
              className={cn('h-12 w-12 flex-none rounded-4', GROUP_TILE[group.id])}
            />
            <div className="flex flex-col gap-2">
              <h2 className="m-0 text-18 font-600" id={`automation-group-${group.id}`}>
                {t.groups[group.id].title}
              </h2>
              <p className="m-0 text-13 text-ink-muted">{t.groups[group.id].description}</p>
            </div>
          </div>
          {group.keys.map((key) => {
            const definition = automationDisplayDefinition(key);
            if (definition === undefined) return null;
            const setting = settingsByKey.get(key);
            const enabled = setting?.enabled ?? true;
            const params = setting?.params ?? {};
            const values = automationValues(definition, params);
            const last = lastByKey.get(key);
            const titleId = `automation-title-${key}`;
            return (
              <article
                // A disabled automation keeps its text fully opaque: dimming the whole row pushed
                // `text-ink-secondary` down to 3.15:1 against the card (WCAG 2.2 AA requires 4.5:1).
                // The switch off, the disabled fields and `data-disabled` carry the state instead.
                className="flex flex-col gap-12 border-t border-solid border-border-subtle pt-16"
                data-disabled={enabled ? undefined : 'true'}
                data-testid={`automation-row-${key}`}
                key={key}
              >
                <div className="flex items-start gap-14">
                  <div className="flex min-w-0 flex-1 flex-col gap-4">
                    <h3 className="m-0 text-15 font-700" id={titleId}>
                      {t.items[key].title}
                    </h3>
                    <p className="m-0 text-13 leading-1.5 text-ink-secondary">
                      {t.items[key].rule}
                    </p>
                  </div>
                  <Switch
                    aria-labelledby={titleId}
                    checked={enabled}
                    data-testid="automation-switch"
                    disabled={pending !== null}
                    onCheckedChange={(checked) => {
                      void saveSetting(key, { enabled: checked }, `toggle-${key}`);
                    }}
                  />
                </div>
                {enabled ? (
                  <div className="flex flex-wrap gap-12 gap-y-20">
                    {definition.settings
                      .filter((field) => field.type === 'select')
                      .map((field) => {
                        const messages = fieldMessages(key, field.param);
                        const options =
                          field.optionsSource === 'pauseDates'
                            ? pauseDates
                            : field.options.map((value) => ({
                                value,
                                label: messages.options[value] ?? value,
                              }));
                        return (
                          <Select
                            className="min-w-[150px] flex-none"
                            data-testid={`automation-setting-${key}-${field.param}`}
                            disabled={pending !== null}
                            key={field.param}
                            label={messages.label}
                            onChange={(event) => {
                              const next = paramsWithField(
                                params,
                                field.param,
                                field.valueType,
                                event.target.value,
                              );
                              void saveSetting(
                                key,
                                { params: next },
                                `field-${key}-${field.param}`,
                              );
                            }}
                            options={options}
                            value={values[field.param] ?? field.defaultValue}
                          />
                        );
                      })}
                  </div>
                ) : null}
                <p
                  className="m-0 rounded-10 bg-canvas px-12 py-8 text-12 leading-1.5 text-ink-secondary"
                  data-testid={`automation-last-${key}`}
                >
                  <strong>{t.lastAction} :</strong>{' '}
                  {last === undefined
                    ? t.noLastAction
                    : `${lastActionDate(last.createdAt, timeZone)}, ${last.summary}`}
                </p>
              </article>
            );
          })}
        </section>
      ))}

      <section
        aria-labelledby="automation-title-pause"
        className="flex flex-col gap-14 rounded-24 border border-solid border-border bg-surface px-24 py-22"
        data-testid="automation-group"
      >
        <div className="flex items-center gap-12">
          <span aria-hidden="true" className="h-12 w-12 flex-none rounded-4 bg-indigo" />
          <div className="flex flex-col gap-2">
            <h2 className="m-0 text-18 font-600" id="automation-title-pause">
              {t.items.pause.title}
            </h2>
            <p className="m-0 text-13 text-ink-muted">{t.items.pause.rule}</p>
          </div>
        </div>
        <article className="flex flex-col gap-14" data-testid="automation-row-pause">
          <div className="flex flex-col gap-14" data-testid="pause-mode">
            {/* The rule is shown once, under the section title (maquette Parametres « t-pause »). */}
            <div className="flex justify-end">
              <Switch
                aria-labelledby="automation-title-pause"
                checked={pauseEnabled}
                data-testid="automation-switch"
                disabled={pending !== null}
                onCheckedChange={(checked) => {
                  void saveSetting(AUTOMATION_PAUSE_KEY, { enabled: checked }, 'toggle-pause');
                }}
              />
            </div>
            {pauseEnabled && pauseState?.status !== 'active' ? (
              <div className="flex flex-wrap items-end gap-14 gap-y-24">
                <Select
                  className="min-w-[180px] flex-none"
                  data-testid="pause-end-date"
                  disabled={pending !== null}
                  label={t.pauseUntil}
                  onChange={(event) => {
                    setPauseUntil(event.target.value);
                    setStatus(null);
                  }}
                  options={pauseDates}
                  value={selectedPauseUntil}
                />
                <div className="flex min-h-44 items-center gap-10">
                  <Switch
                    aria-label={t.diagnose}
                    checked={diagnosticValue === 'true'}
                    data-testid="pause-diagnostic"
                    disabled={pending !== null}
                    onCheckedChange={(checked) => {
                      setDiagnostic(checked ? 'true' : 'false');
                      setStatus(null);
                    }}
                  />
                  <span className="text-14 font-600">{t.diagnose}</span>
                </div>
                <Button
                  className="ml-auto"
                  data-testid="automation-pause-start"
                  disabled={pending !== null || selectedPauseUntil === ''}
                  onClick={() => {
                    void startPauseMode();
                  }}
                  size="lg"
                  type="button"
                  variant="dark"
                >
                  {t.startPause}
                </Button>
              </div>
            ) : null}
            {pauseState?.status === 'active' ? (
              <div
                className="flex flex-wrap items-center justify-between gap-12 rounded-14 bg-indigo-soft px-14 py-12 text-14 text-indigo-ink-strong"
                data-testid="automation-pause-active"
                role="status"
              >
                <span>
                  <strong>{t.pauseActive(pauseLabel(pauseState.endsOn ?? '', timeZone))}</strong>{' '}
                  {pauseState.diagnosticOnReturn
                    ? t.pauseDiagnosticPlanned
                    : t.pauseWithoutDiagnostic}
                </span>
                <Button
                  data-testid="pause-resume"
                  disabled={pending !== null}
                  onClick={() => {
                    void resumePauseMode();
                  }}
                  size="sm"
                  type="button"
                  variant="dark"
                >
                  {t.resumeNow}
                </Button>
              </div>
            ) : null}
            {pauseState?.status === 'ended' &&
            pauseState.diagnostic !== null &&
            pauseState.diagnostic.completedAt === null ? (
              <p
                className="m-0 rounded-14 bg-indigo-soft px-14 py-12 text-14 text-indigo-ink-strong"
                data-testid="pause-diagnostic-proposed"
                role="status"
              >
                {t.pauseDiagnosticProposed(pauseState.diagnostic.minutes)}
              </p>
            ) : null}
            {pauseState?.status === 'ended' &&
            pauseState.diagnostic !== null &&
            pauseState.diagnostic.completedAt !== null ? (
              <p
                className="m-0 rounded-14 bg-canvas px-14 py-12 text-14 text-ink-secondary"
                data-testid="pause-diagnostic-done"
                role="status"
              >
                {t.pauseDiagnosticDone(
                  pauseState.diagnostic.answered ?? 0,
                  pauseState.diagnostic.notionIds.length,
                )}
              </p>
            ) : null}
            <p
              className="m-0 rounded-10 bg-canvas px-12 py-8 text-12 leading-1.5 text-ink-secondary"
              data-testid="automation-last-pause"
            >
              <strong>{t.lastAction} :</strong>{' '}
              {lastByKey.get(AUTOMATION_PAUSE_KEY) === undefined
                ? t.noLastAction
                : `${lastActionDate(lastByKey.get(AUTOMATION_PAUSE_KEY)?.createdAt ?? '', timeZone)}, ${lastByKey.get(AUTOMATION_PAUSE_KEY)?.summary ?? ''}`}
            </p>
          </div>
        </article>
      </section>

      <div className="flex flex-wrap items-start gap-20">
        <Card className="flex flex-[1_1_320px] flex-col gap-14" data-testid="automation-guardrails">
          <h2 className="m-0 text-18 font-600">{t.guardrails.title}</h2>
          <div className="flex flex-col gap-4">
            <span className="text-13 font-700">{t.guardrails.maxPerDay}</span>
            <span className="text-14 font-600" data-testid="automation-guardrail-cap">
              {t.guardrails.maxPerDayValue(initialNotifications?.maxPerDay ?? 5)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-12 border-t border-solid border-border-subtle pt-12">
            <span className="flex flex-col gap-2">
              <span className="text-14 font-700">{t.guardrails.bigChanges}</span>
              <span className="text-12 text-ink-muted">{t.guardrails.bigChangesHint}</span>
            </span>
            <span className="rounded-full bg-canvas px-10 py-3 text-12 font-700 text-ink-secondary">
              {t.guardrails.alwaysConsent}
            </span>
          </div>
          <div className="flex items-center justify-between gap-12 border-t border-solid border-border-subtle pt-12">
            <span className="flex flex-col gap-2">
              <span className="text-14 font-700">{t.guardrails.quietHours}</span>
              <span className="text-12 text-ink-muted" data-testid="automation-guardrail-quiet">
                {t.guardrails.quietRange(
                  initialNotifications?.quiet.start ?? '21:00',
                  initialNotifications?.quiet.end ?? '08:00',
                )}
              </span>
            </span>
            <a className="touch-target text-14 font-600" href="#notifications">
              {t.guardrails.edit}
            </a>
          </div>
        </Card>

        <Card className="flex flex-[2_1_420px] flex-col gap-10" data-testid="automation-history">
          <div className="flex flex-col gap-2">
            <h2 className="m-0 text-18 font-600">{t.journal.title}</h2>
            <p className="m-0 text-13 text-ink-muted">{t.journal.description}</p>
          </div>
          {weekly.length === 0 ? (
            <p className="m-0 text-14 text-ink-muted" data-testid="automation-history-empty">
              {t.journal.empty}
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {weekly.map((row) => {
                const definition = automationDisplayDefinition(row.automation);
                const undoable =
                  row.status === 'applied' &&
                  row.undoPayload !== null &&
                  definition?.canUndo !== false;
                const showStatus = row.status !== 'applied';
                return (
                  <li
                    className="flex items-center gap-12 border-t border-solid border-border-subtle py-12"
                    data-testid="automation-journal-row"
                    key={row.id}
                  >
                    <span
                      className="flex-[0_0_74px] text-12 font-700 text-ink-muted tabular-nums"
                      data-testid="automation-journal-date"
                    >
                      {journalDate(row.createdAt, timeZone)}
                    </span>
                    <span
                      className="min-w-0 flex-1 text-14 leading-1.45"
                      data-testid="automation-journal-summary"
                    >
                      {row.summary}
                    </span>
                    {showStatus ? (
                      <span
                        className="flex-none text-12 font-700 text-orange-ink"
                        data-testid="automation-journal-status"
                      >
                        {t.journal.statuses[row.status]}
                      </span>
                    ) : null}
                    {undoable ? (
                      <Button
                        data-testid="automation-undo"
                        disabled={undoing !== null || pending !== null}
                        onClick={() => {
                          void undo(row.id);
                        }}
                        size="sm"
                        variant="outline"
                      >
                        {t.journal.undo}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-12">
        {error === null ? null : <FormError data-testid="automation-error">{error}</FormError>}
        {status === null ? null : (
          <span
            className="text-14 font-600 text-green-ink"
            data-testid="automation-save-status"
            role="status"
          >
            {status}
          </span>
        )}
      </div>
    </div>
  );
}
