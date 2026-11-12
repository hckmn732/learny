'use client';

import { useState } from 'react';

import { ENGINE } from '@learny/config/product';
import type {
  DailySession,
  DailySessionItem,
  DeferredNotion,
  ExhaustedNotion,
  GlobalQuizMode,
} from '@learny/learning-engine';
import { Badge, Button } from '@learny/ui';

import { fr } from '../../messages/fr';
import { BaseCard, BaseTokenStyle } from '../sdd/base-tokens';

import {
  DEMO_MODULE_LABELS,
  DEMO_NOTION_LABELS,
  SESSION_BANK,
  SESSION_CAP_BY_MODE,
  SESSION_DATE,
  SESSION_DUE_NOTIONS,
  SESSION_FORMATION,
  SESSION_GAPS,
  SESSION_LAST_FORMATS,
  SESSION_SEED,
  demoSession,
  emptySession,
  exhaustedSession,
  neverEvaluatedSession,
  tightCapSession,
} from './spec-406-data';

const t = fr.sdd.spec406;
const PARAMS = ENGINE.globalQuiz;

const instantFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  dateStyle: 'short',
  timeStyle: 'short',
});
const dayFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  dateStyle: 'short',
});

const instant = (iso: string): string => instantFormat.format(new Date(iso));
const day = (date: string | null): string =>
  date === null ? t.inputs.none : dayFormat.format(new Date(`${date}T12:00:00.000Z`));
const duration = (minutes: number): string => `${String(minutes)} min`;

const MODES: readonly GlobalQuizMode[] = ['full', 'micro', 'maintenance'];

const EMPTY = emptySession();
const TIGHT = tightCapSession();
const NEVER_EVALUATED = neverEvaluatedSession();
const EXHAUSTED = exhaustedSession();

function GapBadge({ nature }: Readonly<{ nature: NonNullable<DailySessionItem['gapNature']> }>) {
  const tone = nature === 'confusion' ? 'orange' : nature === 'forgetting' ? 'violet' : 'indigo';
  return (
    <Badge tone={tone} size="sm">
      {t.gapLabels[nature]}
    </Badge>
  );
}

function FormatBadge({ item }: Readonly<{ item: DailySessionItem }>) {
  return (
    <Badge
      data-testid={`session-format-${item.notionId}`}
      tone={item.formatReason === 'bank_constraint' ? 'orange' : 'indigo'}
      size="sm"
    >
      {t.formatLabels[item.format]}
    </Badge>
  );
}

function DeferredRow({ entry }: Readonly<{ entry: DeferredNotion }>) {
  return (
    <tr data-testid={`session-deferred-${entry.notionId}`}>
      <td className="border-b border-divider py-2 pr-3 font-600">
        {DEMO_NOTION_LABELS[entry.notionId] ?? entry.notionId}
      </td>
      <td className="border-b border-divider py-2 pr-3">
        {DEMO_MODULE_LABELS[entry.moduleId] ?? entry.moduleId}
      </td>
      <td className="border-b border-divider py-2 pr-3 tabular-nums">{instant(entry.dueAt)}</td>
      <td className="border-b border-divider py-2 pr-3">{t.deferred.reasons[entry.reason]}</td>
      <td className="border-b border-divider py-2 tabular-nums">{day(entry.proposedFor)}</td>
    </tr>
  );
}

function ExhaustedRow({ entry }: Readonly<{ entry: ExhaustedNotion }>) {
  return (
    <tr data-testid={`session-exhausted-${entry.notionId}`}>
      <td className="border-b border-divider py-2 pr-3 font-600">
        {DEMO_NOTION_LABELS[entry.notionId] ?? entry.notionId}
      </td>
      <td className="border-b border-divider py-2 pr-3">
        {t.deferred.exhaustedReasons[entry.reason]}
      </td>
      <td className="border-b border-divider py-2 pr-3">
        {entry.requiredFormats.length === 0
          ? t.inputs.none
          : entry.requiredFormats.map((format) => t.formatLabels[format]).join(' · ')}
      </td>
      <td className="border-b border-divider py-2 text-ink-muted">
        {entry.availableFormats.length === 0
          ? t.inputs.none
          : entry.availableFormats.map((format) => t.formatLabels[format]).join(' · ')}
      </td>
    </tr>
  );
}

function EdgeRow({
  testId,
  label,
  session,
  detail,
}: Readonly<{ testId: string; label: string; session: DailySession; detail?: string }>) {
  return (
    <tr data-testid={testId}>
      <td className="border-b border-divider py-2 pr-3 font-600">{label}</td>
      <td className="border-b border-divider py-2 pr-3 tabular-nums">
        {String(session.items.length)} {t.edge.items} · {duration(session.estimatedMinutes)}
      </td>
      <td className="border-b border-divider py-2 pr-3 tabular-nums">
        {String(session.deferred.length)} {t.edge.deferred}
      </td>
      <td className="border-b border-divider py-2 text-ink-muted">
        {detail ??
          (session.exhausted.length === 0
            ? t.edge.none
            : `${String(session.exhausted.length)} ${t.edge.exhaustion}`)}
      </td>
    </tr>
  );
}

export default function Spec406Demo() {
  const [mode, setMode] = useState<GlobalQuizMode>('full');
  const session = demoSession(mode);

  return (
    <>
      <BaseTokenStyle />
      <BaseCard testId="session-inputs" title={t.inputs.title}>
        <p className="text-sm text-ink-muted">{t.inputs.intro}</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">{t.inputs.formation}</dt>
            <dd data-testid="session-formation" className="font-600">
              SAP S/4HANA Finance ({SESSION_FORMATION})
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">{t.inputs.date}</dt>
            <dd data-testid="session-date" className="font-mono font-600">
              {day(SESSION_DATE)}
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">{t.inputs.seed}</dt>
            <dd data-testid="session-seed" className="font-mono font-600">
              {SESSION_SEED}
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">{t.inputs.dueCount}</dt>
            <dd data-testid="session-due-count" className="font-mono font-600">
              {String(SESSION_DUE_NOTIONS.length)}
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">{t.inputs.cap}</dt>
            <dd data-testid="session-requested-cap" className="font-mono font-600">
              {duration(SESSION_CAP_BY_MODE[mode])}
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">{t.inputs.preference}</dt>
            <dd data-testid="session-preference" className="font-mono font-600">
              {PARAMS.gamePreferenceDefault}
            </dd>
          </div>
        </dl>
        <fieldset className="mt-4">
          <legend className="text-sm font-600">{t.modeLegend}</legend>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t.modeLegend}>
            {MODES.map((candidate) => (
              <Button
                key={candidate}
                data-testid={`session-mode-${candidate}`}
                aria-pressed={mode === candidate}
                onClick={() => {
                  setMode(candidate);
                }}
              >
                {t.modes[candidate]}
              </Button>
            ))}
          </div>
        </fieldset>
        <div
          className="mt-4 overflow-x-auto"
          role="region"
          aria-label={t.inputs.title}
          tabIndex={0}
        >
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">{t.inputs.title}</caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  {t.inputs.notion}
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  {t.inputs.module}
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  {t.inputs.status}
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  {t.inputs.evaluated}
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  {t.inputs.dueAt}
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  {t.inputs.gap}
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  {t.inputs.lastFormat}
                </th>
                <th scope="col" className="border-b border-border py-2 font-600">
                  {t.inputs.bank}
                </th>
              </tr>
            </thead>
            <tbody>
              {SESSION_DUE_NOTIONS.map((notion) => {
                const gap = SESSION_GAPS.find((entry) => entry.notionId === notion.notionId);
                const last = SESSION_LAST_FORMATS.find(
                  (entry) => entry.notionId === notion.notionId,
                );
                const formats = SESSION_BANK.find(
                  (entry) => entry.notionId === notion.notionId,
                )?.formats;
                return (
                  <tr key={notion.notionId} data-testid={`session-due-${notion.notionId}`}>
                    <td className="border-b border-divider py-2 pr-3 font-600">
                      {DEMO_NOTION_LABELS[notion.notionId] ?? notion.notionId}
                    </td>
                    <td className="border-b border-divider py-2 pr-3">
                      {DEMO_MODULE_LABELS[notion.moduleId] ?? notion.moduleId}
                    </td>
                    <td className="border-b border-divider py-2 pr-3">
                      {t.inputs.statusLabels[notion.moduleStatus]}
                    </td>
                    <td className="border-b border-divider py-2 pr-3">
                      {notion.evaluated ? t.inputs.yes : t.inputs.no}
                    </td>
                    <td className="border-b border-divider py-2 pr-3 tabular-nums">
                      {instant(notion.dueAt)}
                    </td>
                    <td className="border-b border-divider py-2 pr-3">
                      {gap === undefined ? t.inputs.none : <GapBadge nature={gap.nature} />}
                    </td>
                    <td className="border-b border-divider py-2 pr-3">
                      {last === undefined ? t.inputs.none : t.formatLabels[last.format]}
                    </td>
                    <td className="border-b border-divider py-2 text-ink-muted">
                      {formats === undefined || formats.length === 0
                        ? t.inputs.none
                        : formats.map((format) => t.formatLabels[format]).join(' · ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </BaseCard>

      <BaseCard testId="session-selected" title={t.session.title} role="status">
        <p className="text-sm text-ink-muted">{t.session.intro}</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">{t.session.duration}</dt>
            <dd data-testid="session-duration" className="font-mono font-600">
              {duration(session.estimatedMinutes)}
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">{t.session.cap}</dt>
            <dd data-testid="session-cap" className="font-mono font-600">
              {duration(session.capMinutes)}
            </dd>
          </div>
          <div className="rounded-18 bg-canvas p-4">
            <dt className="text-ink-muted">{t.session.count}</dt>
            <dd data-testid="session-count" className="font-mono font-600">
              {String(session.items.length)}
            </dd>
          </div>
        </dl>
        {session.items.length === 0 ? (
          <p data-testid="session-empty" className="mt-4 text-sm">
            {t.session.empty}
          </p>
        ) : (
          <div
            className="mt-4 overflow-x-auto"
            role="region"
            aria-label={t.session.title}
            tabIndex={0}
          >
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">{t.session.title}</caption>
              <thead>
                <tr>
                  <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                    {t.session.rank}
                  </th>
                  <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                    {t.session.notion}
                  </th>
                  <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                    {t.session.module}
                  </th>
                  <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                    {t.session.format}
                  </th>
                  <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                    {t.session.gap}
                  </th>
                  <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                    {t.session.reason}
                  </th>
                  <th scope="col" className="border-b border-border py-2 font-600">
                    {t.session.estimated}
                  </th>
                </tr>
              </thead>
              <tbody>
                {session.items.map((item, index) => (
                  <tr key={item.notionId} data-testid={`session-item-${item.notionId}`}>
                    <td className="border-b border-divider py-2 pr-3 tabular-nums">
                      {String(index + 1)}
                    </td>
                    <td className="border-b border-divider py-2 pr-3 font-600">
                      {DEMO_NOTION_LABELS[item.notionId] ?? item.notionId}
                    </td>
                    <td className="border-b border-divider py-2 pr-3">
                      {DEMO_MODULE_LABELS[item.moduleId] ?? item.moduleId}
                    </td>
                    <td className="border-b border-divider py-2 pr-3">
                      <FormatBadge item={item} />
                    </td>
                    <td className="border-b border-divider py-2 pr-3">
                      {item.gapNature === null ? (
                        t.inputs.none
                      ) : (
                        <GapBadge nature={item.gapNature} />
                      )}
                    </td>
                    <td className="border-b border-divider py-2 pr-3">
                      {t.session.selectionReasons[item.selectionReason]} ·{' '}
                      {t.session.formatReasons[item.formatReason]}
                      {item.variantRequested ? ` · ${t.session.variant}` : null}
                    </td>
                    <td className="border-b border-divider py-2 tabular-nums">
                      {String(item.estimatedSeconds)} s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </BaseCard>

      <BaseCard testId="session-deferred" title={t.deferred.title} role="status">
        <p className="text-sm text-ink-muted">{t.deferred.intro}</p>
        {session.deferred.length === 0 ? (
          <p data-testid="session-deferred-empty" className="mt-4 text-sm">
            {t.deferred.empty}
          </p>
        ) : (
          <div
            className="mt-4 overflow-x-auto"
            role="region"
            aria-label={t.deferred.title}
            tabIndex={0}
          >
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">{t.deferred.title}</caption>
              <thead>
                <tr>
                  <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                    {t.deferred.notion}
                  </th>
                  <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                    {t.deferred.module}
                  </th>
                  <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                    {t.deferred.dueAt}
                  </th>
                  <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                    {t.deferred.reason}
                  </th>
                  <th scope="col" className="border-b border-border py-2 font-600">
                    {t.deferred.proposedFor}
                  </th>
                </tr>
              </thead>
              <tbody>
                {session.deferred.map((entry) => (
                  <DeferredRow key={entry.notionId} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h3 className="mt-5 font-display text-lg font-semibold">{t.deferred.exhaustedTitle}</h3>
        {session.exhausted.length === 0 ? (
          <p data-testid="session-exhausted-empty" className="mt-2 text-sm">
            {t.deferred.exhaustedEmpty}
          </p>
        ) : (
          <div
            className="mt-2 overflow-x-auto"
            role="region"
            aria-label={t.deferred.exhaustedTitle}
            tabIndex={0}
          >
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">{t.deferred.exhaustedTitle}</caption>
              <thead>
                <tr>
                  <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                    {t.deferred.notion}
                  </th>
                  <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                    {t.deferred.reason}
                  </th>
                  <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                    {t.deferred.required}
                  </th>
                  <th scope="col" className="border-b border-border py-2 font-600">
                    {t.deferred.available}
                  </th>
                </tr>
              </thead>
              <tbody>
                {session.exhausted.map((entry) => (
                  <ExhaustedRow key={entry.notionId} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </BaseCard>

      <BaseCard testId="session-edge" title={t.edge.title}>
        <p className="text-sm text-ink-muted">{t.edge.intro}</p>
        <div className="mt-4 overflow-x-auto" role="region" aria-label={t.edge.title} tabIndex={0}>
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">{t.edge.title}</caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  {t.edge.title}
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  {t.session.duration}
                </th>
                <th scope="col" className="border-b border-border py-2 pr-3 font-600">
                  {t.deferred.title}
                </th>
                <th scope="col" className="border-b border-border py-2 font-600">
                  {t.deferred.exhaustedTitle}
                </th>
              </tr>
            </thead>
            <tbody>
              <EdgeRow testId="session-edge-no-due" label={t.edge.noDue} session={EMPTY} />
              <EdgeRow testId="session-edge-tight-cap" label={t.edge.tightCap} session={TIGHT} />
              <EdgeRow
                testId="session-edge-never-evaluated"
                label={t.edge.neverEvaluated}
                session={NEVER_EVALUATED}
                detail={t.deferred.reasons.module_not_eligible}
              />
              <EdgeRow
                testId="session-edge-exhausted"
                label={t.edge.exhausted}
                session={EXHAUSTED}
                detail={`${String(EXHAUSTED.exhausted.length)} ${t.edge.exhaustion} · ${t.deferred.exhaustedReasons.imposed_format_unavailable}`}
              />
            </tbody>
          </table>
        </div>
      </BaseCard>
    </>
  );
}
