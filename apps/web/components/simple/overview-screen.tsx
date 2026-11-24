'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { api } from '@learny/api-client';
import type { ProgrammeProposalStateDto, SidebarFormation, SimpleState } from '@learny/contracts';
import { clock } from '@learny/core';
import { fr } from '@learny/i18n/fr/simple';
import { Button } from '@learny/ui';
import { colors } from '@learny/ui/tokens';

import { ActiveLimitDialog } from '../formations/ActiveLimitDialog';
import { addDays, formatDay, formatLongDate } from '../programme/dates';

import { CalendarIcon, ChatIcon, CheckIcon, QuoteIcon } from './icons';
import {
  civilDateOf,
  deadlineEndDate,
  errorMessage,
  formatHours,
  MIN_DEADLINE_DAYS,
  moduleMinutes,
  proposalEndDate,
  studyIndicators,
  visibleModules,
} from './simple-mode';

const t = fr.simple.overview;

export interface OverviewScreenProps {
  fid: string;
  state: SimpleState;
  programme: ProgrammeProposalStateDto;
  /** Formations actives proposées par la boîte de dialogue de BR-FOR-10 (CL-4). */
  activeFormations: readonly SidebarFormation[];
}

/**
 * SPEC-4002 EF-5 (SCR-23, étape 4) — l'aperçu du programme tiré du document : quatre indicateurs,
 * la liste des modules avec leurs pages, la seule question de l'échéance et les deux actions
 * « C'est parti » (validation du programme) et « Ajuster avec le tuteur » (ajustement existant).
 */
export function OverviewScreen({ fid, state, programme, activeFormations }: OverviewScreenProps) {
  const router = useRouter();
  const proposal = programme.proposal;
  const modules = proposal?.modules ?? [];
  const volumeHours = proposal?.volumeHours ?? null;
  const today = civilDateOf(clock.now());
  const [deadline, setDeadline] = useState<string | null>(null);
  const [savingDeadline, setSavingDeadline] = useState(false);
  const [deadlineError, setDeadlineError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [limitOpen, setLimitOpen] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [notice, setNotice] = useState('');

  const endDate = deadline === null ? proposalEndDate(modules) : deadlineEndDate(deadline, today);
  const indicators = studyIndicators({ volumeHours, endDate, today });
  const { visible, hidden } = visibleModules(modules);
  const totalChapters = modules.reduce((count, module) => count + module.chapters.length, 0);
  const sources = useMemo(
    () => state.sources.filter((source) => source.status !== 'failed'),
    [state.sources],
  );
  const title = proposal?.title ?? programme.title;

  const applyDeadline = async (value: string | null): Promise<void> => {
    if (savingDeadline) return;
    setSavingDeadline(true);
    setDeadlineError(null);
    try {
      await api.formationUpdate(
        { params: { fid }, body: { endDate: value } },
        { idempotencyKey: crypto.randomUUID() },
      );
      setDeadline(value);
      if (value === null) {
        setNotice('');
      } else {
        const nextEnd = deadlineEndDate(value, today);
        const next = studyIndicators({ volumeHours, endDate: nextEnd, today });
        setNotice(t.announce.deadline(formatLongDate(nextEnd), next.perDay));
      }
    } catch (error) {
      setDeadlineError(errorMessage(error, fr.simple.errors.generic));
    } finally {
      setSavingDeadline(false);
    }
  };

  const start = async (): Promise<void> => {
    if (starting || proposal === null) return;
    setStarting(true);
    setStartError(null);
    try {
      await api.programmeValidate(
        { params: { fid }, body: { expectedVersion: proposal.version } },
        { idempotencyKey: crypto.randomUUID() },
      );
      setNotice(t.announce.validated);
      router.push(`/formations/${fid}/diagnostic`);
    } catch (error) {
      const message = errorMessage(error, fr.simple.errors.generic);
      if (message.includes(fr.simple.errors.FORMATION_LIMIT_REACHED)) setLimitOpen(true);
      else setStartError(message);
    } finally {
      setStarting(false);
    }
  };

  const pauseAndRetry = async (formationId: string): Promise<void> => {
    setPausing(true);
    try {
      await api.formationPause(
        { params: { fid: formationId }, body: {} },
        { idempotencyKey: crypto.randomUUID() },
      );
      setLimitOpen(false);
      await start();
    } catch (error) {
      setStartError(errorMessage(error, fr.simple.errors.generic));
    } finally {
      setPausing(false);
    }
  };

  const minDeadline = addDays(today, MIN_DEADLINE_DAYS);

  return (
    <main className="mx-auto w-full px-16 pb-40 nav:px-40" data-testid="simple-overview">
      <div className="mx-auto flex w-full max-w-[1160px] flex-col gap-18 py-24">
        <span className="self-start rounded-full border border-solid border-lime-border bg-lime-soft px-9 py-3 text-12 font-600 text-lime-ink-strong">
          <span className="mr-6 inline-flex">
            <CheckIcon color={colors['lime-ink-strong']} />
          </span>
          {t.badge}
        </span>
        <header className="flex flex-col gap-4">
          <h1 className="m-0 font-display text-32 font-600 tracking-title">{title}</h1>
          <p className="m-0 text-15 text-ink-muted">
            {t.sourcePrefix}{' '}
            <strong className="text-ink">
              {sources.length === 0 ? '—' : sources.map((source) => source.title).join(', ')}
            </strong>
          </p>
        </header>

        <div className="grid grid-cols-2 gap-10 lg:grid-cols-4" data-testid="simple-kpis">
          <div className="rounded-14 border border-solid border-border bg-surface-subtle px-14 py-12">
            <b className="block font-display text-22 font-600">{modules.length}</b>
            <span className="text-12 text-ink-muted">{t.kpis.modules}</span>
          </div>
          <div className="rounded-14 border border-solid border-border bg-surface-subtle px-14 py-12">
            <b className="block font-display text-22 font-600">{indicators.studyHours}</b>
            <span className="text-12 text-ink-muted">{t.kpis.hours}</span>
          </div>
          <div
            className="rounded-14 border border-solid border-border bg-surface-subtle px-14 py-12"
            data-testid="simple-kpi-per-day"
          >
            <b className="block font-display text-22 font-600">{indicators.perDay}</b>
            <span className="text-12 text-ink-muted">{t.kpis.perDay}</span>
          </div>
          <div
            className="rounded-14 border border-solid border-border bg-surface-subtle px-14 py-12"
            data-testid="simple-kpi-end"
          >
            <b className="block font-display text-22 font-600">
              {endDate === null ? '—' : formatDay(endDate)}
            </b>
            <span className="text-12 text-ink-muted">{t.kpis.end}</span>
          </div>
        </div>

        <div className="grid items-start gap-20 lg:grid-cols-[1.5fr_1fr]">
          <section
            aria-labelledby="simple-modules-title"
            className="flex flex-col gap-8 rounded-18 border border-solid border-border bg-surface p-18"
            data-testid="simple-modules"
          >
            <div className="flex items-baseline justify-between">
              <h2 className="m-0 text-16 font-600" id="simple-modules-title">
                {t.modulesTitle}
              </h2>
              <span className="text-13 text-ink-muted">{t.modulesOrder}</span>
            </div>
            <ol className="m-0 flex list-none flex-col gap-8 p-0">
              {visible.map((module) => (
                <li
                  className="flex items-center gap-14 rounded-14 border border-solid border-border bg-surface-subtle px-14 py-12"
                  data-testid={`simple-module-${String(module.position)}`}
                  key={module.position}
                >
                  <span className="flex size-30 shrink-0 items-center justify-center rounded-9 border border-solid border-border bg-surface text-13 font-700">
                    {module.position}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="text-14 font-600">{module.title}</span>
                    <span className="text-12 text-ink-muted">
                      {t.moduleMeta(
                        module.chapters.length,
                        formatHours(
                          moduleMinutes(volumeHours, module.chapters.length, totalChapters),
                        ),
                      )}
                    </span>
                  </div>
                  {module.pageFrom == null || module.pageTo == null ? null : (
                    <span className="inline-flex items-center gap-6 rounded-full border border-solid border-border bg-surface px-9 py-3 text-12 font-600">
                      <QuoteIcon />
                      {t.pages(module.pageFrom, module.pageTo)}
                    </span>
                  )}
                </li>
              ))}
            </ol>
            {hidden.length === 0 ? null : (
              <p className="m-0 px-4 py-6 text-13 text-ink-muted">
                {t.moreModules(hidden.length, hidden.at(-1)?.title ?? '')}
              </p>
            )}
          </section>

          <aside className="flex flex-col gap-14">
            <div
              className="flex flex-col gap-10 rounded-18 border border-solid border-border bg-surface-subtle px-18 py-14"
              data-testid="simple-deadline"
            >
              <p className="m-0 text-15 font-600">{t.deadline.title}</p>
              <p className="m-0 text-13 text-ink-muted">{t.deadline.body}</p>
              <div className="flex flex-wrap items-center gap-8">
                <Button
                  aria-pressed={deadline === null}
                  data-testid="simple-deadline-none"
                  disabled={savingDeadline}
                  onClick={() => void applyDeadline(null)}
                  size="md"
                  type="button"
                  variant={deadline === null ? 'dark' : 'outline'}
                >
                  {t.deadline.no}
                </Button>
                <Button
                  aria-pressed={deadline !== null}
                  data-testid="simple-deadline-yes"
                  disabled={savingDeadline}
                  onClick={() => void applyDeadline(minDeadline)}
                  size="md"
                  type="button"
                  variant={deadline === null ? 'outline' : 'dark'}
                >
                  {t.deadline.yes}
                </Button>
                {deadline === null ? null : (
                  <label className="inline-flex items-center gap-8 rounded-11 border border-solid border-border-strong bg-surface px-12 py-8 text-14 font-600">
                    <CalendarIcon color={colors.ink} />
                    <span className="sr-only">{t.deadline.dateLabel}</span>
                    <input
                      className="border-0 bg-transparent text-14 font-600 outline-none"
                      data-testid="simple-deadline-date"
                      min={minDeadline}
                      onChange={(event) => {
                        void applyDeadline(event.target.value);
                      }}
                      type="date"
                      value={deadline}
                    />
                  </label>
                )}
              </div>
              {deadline === null ? null : (
                <p className="m-0 text-12 text-lime-ink-strong">{t.deadline.note}</p>
              )}
              {deadlineError === null ? null : (
                <p className="m-0 text-12 font-600 text-orange-ink" role="alert">
                  {deadlineError}
                </p>
              )}
            </div>

            <Button
              data-testid="simple-start"
              disabled={starting}
              loading={starting}
              onClick={() => void start()}
              size="lg"
              type="button"
              variant="lime"
            >
              {starting ? t.startPending : t.start}
            </Button>
            <Button asChild size="lg" variant="outline">
              <a data-testid="simple-adjust" href={`/formations/${fid}/programme`}>
                <ChatIcon size={16} />
                {t.adjust}
              </a>
            </Button>
            {startError === null ? null : (
              <p className="m-0 text-12 font-600 text-orange-ink" role="alert">
                {startError}
              </p>
            )}
            <p className="m-0 text-12 leading-1.5 text-ink-muted">{t.generationNote}</p>
          </aside>
        </div>

        <p aria-live="polite" className="sr-only" data-testid="simple-overview-announce">
          {notice}
        </p>
      </div>

      <ActiveLimitDialog
        formations={activeFormations}
        onConfirm={(formationId) => void pauseAndRetry(formationId)}
        onOpenChange={setLimitOpen}
        open={limitOpen}
        pending={pausing}
        targetTitle={title}
      />
    </main>
  );
}
