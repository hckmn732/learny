'use client';

import { useQuery } from '@tanstack/react-query';
import NextLink from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import type {
  CompletedFormationRow,
  HomeDto,
  HomeGlobalQuiz,
  HomeSlot as HomeSlotDto,
  OngoingFormationRow,
} from '@learny/contracts';
import { clock } from '@learny/core';
import {
  formatDuration,
  highlightedSlot,
  minutesUntil,
  slotState,
} from '@learny/services/home/derive';
import {
  Button,
  EmptyState,
  ErrorState,
  ProgressRing,
  SkeletonCard,
  SkeletonGroup,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
  cn,
  formationAccentClass,
  formationAccents,
  slotKinds,
} from '@learny/ui';

import { api } from '../../lib/api-client';
import { fr } from '../../messages/fr';

import { TutorProposalPanel } from './TutorProposalBanner';
import { WarmupPanel } from './WarmupCard';

const t = fr.home;

const MODULE_STATUS_CLASS = {
  green: 'bg-green-soft text-green-ink-alt',
  indigo: 'bg-indigo-soft text-indigo-ink-strong',
  violet: 'bg-violet-soft text-violet-ink',
  orange: 'bg-orange-soft text-orange-ink-strong',
} as const;

function Sigil({
  title,
  monogram,
  accent,
}: Readonly<{ title: string; monogram: string; accent: OngoingFormationRow['accent'] }>) {
  return (
    <span
      aria-hidden="true"
      data-testid="home-sigil"
      className={cn(
        'flex size-42 shrink-0 items-center justify-center rounded-12 font-display text-13 font-700',
        formationAccentClass[accent],
      )}
      title={title}
    >
      {monogram}
    </span>
  );
}

function DayStatus({ slot }: Readonly<{ slot: HomeSlotDto }>) {
  if (slot.state === 'done') {
    return (
      <span className="rounded-full bg-dark-700 px-10 py-4 text-12 font-600 text-lime">
        {t.day.done}
      </span>
    );
  }
  if (slot.state === 'missed') {
    return (
      <span className="rounded-full bg-orange-dark px-10 py-4 text-12 font-600 text-orange-on-dark">
        {t.day.missed}
      </span>
    );
  }
  if (slot.state === 'next') {
    return (
      <span className="rounded-full bg-lime px-10 py-4 text-12 font-700 text-ink">
        {slot.minutesUntil !== null && slot.minutesUntil <= 120
          ? t.day.inMinutes(slot.minutesUntil)
          : t.day.upcoming}
      </span>
    );
  }
  if (slot.state === 'ongoing') {
    return (
      <span className="rounded-full bg-lime px-10 py-4 text-12 font-700 text-ink">
        {t.day.ongoing}
      </span>
    );
  }
  if (slot.state === 'todo') {
    return (
      <NextLink
        className="rounded-full bg-dark-700 px-10 py-4 text-12 font-600 text-lime"
        href={slot.href}
      >
        {t.day.doIt}
      </NextLink>
    );
  }
  return (
    <span className="rounded-full bg-dark-700 px-10 py-4 text-12 font-600 text-on-dark-secondary">
      {t.day.upcoming}
    </span>
  );
}

export function DayCard({
  data,
  liveSlots,
  primaryAction,
}: Readonly<{
  data: HomeDto['today'];
  liveSlots: HomeSlotDto[];
  primaryAction: HomeDto['today']['primaryAction'];
}>) {
  return (
    <section
      data-testid="home-day"
      aria-labelledby="home-day-title"
      className="flex min-w-0 flex-[2_1_520px] flex-col gap-20 rounded-24 bg-ink p-28 text-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-12">
        <h2
          id="home-day-title"
          className="m-0 text-12 font-700 tracking-kicker text-lime uppercase"
        >
          {t.day.title(liveSlots.length)}
        </h2>
        <span className="text-13 text-on-dark-muted">
          {t.day.summary(formatDuration(data.plannedMinutes), formatDuration(data.doneMinutes))}
        </span>
      </div>
      {liveSlots.length === 0 ? (
        <p className="m-0 text-14 text-on-dark-muted">{t.day.empty}</p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-6 p-0">
          {liveSlots.map((slot) => {
            const next = slot.state === 'next';
            return (
              <li
                key={slot.id}
                data-testid={`home-slot-${slot.id}`}
                data-state={slot.state}
                className={cn(
                  'flex flex-wrap items-center gap-16 rounded-16 px-16 py-14',
                  next ? 'bg-surface text-ink' : 'bg-dark-800',
                )}
              >
                <span
                  className={cn(
                    'flex-[0_0_52px] font-display text-16 font-600 tabular-nums',
                    next ? 'text-ink' : 'text-on-dark-muted',
                  )}
                >
                  {slot.time}
                </span>
                <span
                  aria-hidden="true"
                  className="size-10 shrink-0 rounded-full"
                  style={{ backgroundColor: slotKinds[slot.kind].color }}
                />
                <span className="flex min-w-[200px] flex-1 flex-col gap-2">
                  <span
                    className={cn(
                      'text-15 text-on-dark-secondary',
                      next ? 'font-700 text-ink' : 'font-600',
                    )}
                  >
                    {slot.title}
                  </span>
                  <span className={cn('text-13', next ? 'text-ink-muted' : 'text-on-dark-muted')}>
                    {slot.meta}
                  </span>
                </span>
                <DayStatus slot={slot} />
              </li>
            );
          })}
        </ol>
      )}
      <div className="flex flex-wrap gap-10">
        {primaryAction === null ? null : (
          <Button asChild variant="lime" size="lg">
            <NextLink prefetch={false} href={primaryAction.href}>
              {primaryAction.label}
            </NextLink>
          </Button>
        )}
        <Button asChild variant="outline-on-dark" size="lg">
          <NextLink prefetch={false} href="/agenda">
            {t.day.agenda}
          </NextLink>
        </Button>
      </div>
    </section>
  );
}

export function RetentionCard({ data }: Readonly<{ data: HomeDto['retention'] }>) {
  return (
    <section
      data-testid="home-retention"
      aria-labelledby="home-retention-title"
      className="flex flex-wrap items-center gap-20 rounded-24 border border-solid border-border bg-surface p-24"
    >
      <ProgressRing
        className="text-ink"
        label={t.retention.ringLabel(data.oneMonth)}
        value={data.oneMonth}
      />
      <div className="flex min-w-[140px] flex-1 flex-col gap-6">
        <h2 id="home-retention-title" className="m-0 text-16 font-600">
          {t.retention.title}
        </h2>
        <p className="m-0 text-13 leading-1.5 text-ink-muted">
          {data.twoMonths === null
            ? t.retention.noTwoMonths
            : t.retention.twoMonths(data.twoMonths)}
        </p>
        {data.oneMonth === null ? (
          <p className="m-0 text-13 leading-1.5 text-ink-muted">{t.retention.noMeasure}</p>
        ) : null}
      </div>
    </section>
  );
}

export function GlobalQuizCard({ data }: Readonly<{ data: HomeGlobalQuiz }>) {
  const nothing = data.notionCount === 0;
  return (
    <section
      data-testid="home-global-quiz"
      aria-labelledby="home-global-quiz-title"
      className="flex flex-[1_1_auto] flex-col gap-10 rounded-24 bg-lime p-24 text-ink"
    >
      <h2 id="home-global-quiz-title" className="m-0 text-12 font-700 tracking-kicker uppercase">
        {t.quiz.title}
      </h2>
      <p className="m-0 font-display text-30 leading-1.1 font-600 tracking-heading">
        {nothing ? t.quiz.nothing : t.quiz.notions(data.notionCount)}
      </p>
      {nothing ? (
        <p className="m-0 text-14">
          {data.nextReviewOn === null
            ? t.quiz.startAfterModule
            : t.quiz.nextReview(data.nextReviewOn)}
        </p>
      ) : (
        <>
          <p className="m-0 text-14">
            {t.quiz.line(data.formationTitle, data.gamesCount, data.durationMin)}
            {data.hasGaps ? ` · ${t.quiz.gaps}` : ''}
          </p>
          {data.deferred === null ? null : (
            <p className="m-0 text-13 text-lime-ink-strong">
              {t.quiz.deferred(
                data.deferred.dueCount,
                data.deferred.deferredCount,
                data.deferred.dayLabel,
                data.deferred.capMin,
              )}
            </p>
          )}
          <Button asChild variant="dark" size="md" className="mt-6 self-start">
            <NextLink prefetch={false} href={`/formations/${data.formationId}/quiz-global`}>
              {t.quiz.play}
            </NextLink>
          </Button>
        </>
      )}
    </section>
  );
}

function ProgressCell({ row }: Readonly<{ row: OngoingFormationRow }>) {
  const label =
    row.status === 'paused'
      ? t.formations.paused
      : row.status === 'programme_proposed'
        ? t.formations.programmeToValidate
        : row.status === 'cadrage'
          ? t.formations.cadrage
          : t.formations.progress(row.progressPercent, row.modulePosition, row.moduleCount);
  return (
    <div className="flex items-center gap-10">
      <ProgressRing
        label={t.formations.ringLabel(row.title, row.progressPercent)}
        size="xs"
        tone="indigo"
        color={formationAccents[row.accent].ring}
        value={row.progressPercent}
      />
      <span className="flex flex-col">
        <span className="font-700 tabular-nums">{`${String(row.progressPercent)} %`}</span>
        <span className="text-12 text-ink-muted">{label}</span>
      </span>
    </div>
  );
}

function NextActivityCell({ row }: Readonly<{ row: OngoingFormationRow }>) {
  if (row.nextActivity === null) {
    return <span className="text-ink-muted">{t.formations.noModule}</span>;
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="font-600">{row.nextActivity.when}</span>
      <span className="text-13 text-ink-muted">{row.nextActivity.detail}</span>
    </div>
  );
}

function EndCell({ day }: Readonly<{ day: string | null }>) {
  if (day === null) return <span className="text-ink-muted">{t.formations.noModule}</span>;
  return <span className="tabular-nums">{shortDate(day)}</span>;
}

function shortDate(day: string): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, date)));
}

export function FormationsTable({
  rows,
  empty,
}: Readonly<{ rows: OngoingFormationRow[]; empty: ReactNode }>) {
  if (rows.length === 0) return <>{empty}</>;
  return (
    <div
      className="w-full max-w-full min-w-0 overflow-x-auto"
      role="region"
      tabIndex={0}
      aria-label={t.formations.tableLabel}
      data-testid="home-table-ongoing"
    >
      <table className="w-full min-w-[920px] border-separate border-spacing-y-6 text-14">
        <thead>
          <tr className="text-left text-12 text-ink-muted">
            <th scope="col" className="px-16 py-8 font-600">
              {t.formations.columns.formation}
            </th>
            <th scope="col" className="px-16 py-8 font-600">
              {t.formations.columns.progress}
            </th>
            <th scope="col" className="px-16 py-8 font-600">
              {t.formations.columns.module}
            </th>
            <th scope="col" className="px-16 py-8 font-600">
              {t.formations.columns.next}
            </th>
            <th scope="col" className="px-16 py-8 font-600">
              {t.formations.columns.end}
            </th>
            <th scope="col" className="px-16 py-8 text-right font-600">
              <span className="sr-only">{t.formations.columns.action}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} data-testid={`home-formation-row-${row.id}`}>
              <td className="rounded-l-16 bg-surface-subtle px-16 py-14">
                <div className="flex items-center gap-12">
                  <Sigil accent={row.accent} monogram={row.monogram} title={row.title} />
                  <span className="flex min-w-0 flex-col gap-2">
                    <span className="font-600">{row.title}</span>
                    <span className="text-13 text-ink-muted">{row.subtitle}</span>
                  </span>
                </div>
              </td>
              <td className="bg-surface-subtle px-16 py-14">
                <ProgressCell row={row} />
              </td>
              <td className="bg-surface-subtle px-16 py-14">
                <div className="flex flex-col items-start gap-4">
                  <span>{row.moduleTitle ?? t.formations.noModule}</span>
                  {row.moduleStatus === null ? null : (
                    <span
                      className={cn(
                        'rounded-full px-8 py-2 text-12 font-600',
                        MODULE_STATUS_CLASS[row.moduleStatus.tone],
                      )}
                    >
                      {row.moduleStatus.label}
                    </span>
                  )}
                </div>
              </td>
              <td className="bg-surface-subtle px-16 py-14">
                <NextActivityCell row={row} />
              </td>
              <td className="bg-surface-subtle px-16 py-14">
                <EndCell day={row.endDate} />
              </td>
              <td className="rounded-r-16 bg-surface-subtle px-16 py-14 text-right">
                <Button
                  asChild
                  data-testid={`home-formation-action-${row.id}`}
                  variant={row.primaryAction ? 'dark' : 'outline'}
                  size="md"
                >
                  <NextLink prefetch={false} href={row.action.href}>
                    {row.action.label}
                  </NextLink>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CompletedTable({
  rows,
  empty,
}: Readonly<{ rows: CompletedFormationRow[]; empty: ReactNode }>) {
  if (rows.length === 0) return <>{empty}</>;
  return (
    <div
      className="w-full max-w-full min-w-0 overflow-x-auto"
      role="region"
      tabIndex={0}
      aria-label={t.formations.tableLabel}
      data-testid="home-table-completed"
    >
      <table className="w-full min-w-[920px] border-separate border-spacing-y-6 text-14">
        <thead>
          <tr className="text-left text-12 text-ink-muted">
            <th scope="col" className="px-16 py-8 font-600">
              {t.formations.columns.formation}
            </th>
            <th scope="col" className="px-16 py-8 font-600">
              {t.formations.columns.result}
            </th>
            <th scope="col" className="px-16 py-8 font-600">
              {t.formations.columns.memory}
            </th>
            <th scope="col" className="px-16 py-8 font-600">
              {t.formations.columns.revisions}
            </th>
            <th scope="col" className="px-16 py-8 font-600">
              {t.formations.columns.completedOn}
            </th>
            <th scope="col" className="px-16 py-8 text-right font-600">
              <span className="sr-only">{t.formations.columns.action}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} data-testid={`home-formation-row-${row.id}`}>
              <td className="rounded-l-16 bg-surface-subtle px-16 py-14">
                <div className="flex items-center gap-12">
                  <Sigil accent={row.accent} monogram={row.monogram} title={row.title} />
                  <span className="flex min-w-0 flex-col gap-2">
                    <span className="font-600">{row.title}</span>
                    <span className="text-13 text-ink-muted">{row.subtitle}</span>
                  </span>
                </div>
              </td>
              <td className="bg-surface-subtle px-16 py-14">
                <span className="rounded-full bg-indigo-soft px-10 py-3 text-12 font-700 text-indigo-ink-strong">
                  {t.formations.validated(row.resultPercent)}
                </span>
              </td>
              <td className="bg-surface-subtle px-16 py-14">
                <div className="flex flex-col gap-2">
                  <span className="font-700 tabular-nums">
                    {row.retentionPercent === null ? '—' : `${String(row.retentionPercent)} %`}
                  </span>
                  <span className="text-12 text-ink-muted">
                    {row.retentionPercent === null
                      ? t.formations.measurementComing
                      : t.formations.retained}
                  </span>
                </div>
              </td>
              <td className="bg-surface-subtle px-16 py-14">
                {row.maintenanceMode === 'light' ? (
                  <div className="flex flex-col gap-2">
                    <span className="font-600">{t.formations.dueToday(row.dueCount)}</span>
                    <span className="text-13 text-ink-muted">{t.formations.memoryInterview}</span>
                  </div>
                ) : row.maintenanceMode === 'stopped' ? (
                  <div className="flex flex-col gap-2">
                    <span className="font-600">{t.formations.stopped}</span>
                    <span className="text-13 text-ink-muted">{t.formations.stoppedDetail}</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <span className="font-600">{t.formations.reportToDo}</span>
                    <span className="text-13 text-ink-muted">{t.formations.reportDetail}</span>
                  </div>
                )}
              </td>
              <td className="bg-surface-subtle px-16 py-14">
                <div className="flex flex-col gap-2 tabular-nums">
                  <span>{row.completedOn === null ? '—' : shortDate(row.completedOn)}</span>
                  <span className="text-12 text-ink-muted">
                    {row.weeks === null ? '' : t.formations.weeks(row.weeks)}
                    {row.weeks !== null && row.volumeHours !== null ? ' · ' : ''}
                    {row.volumeHours === null ? '' : formatDuration(row.volumeHours * 60)}
                  </span>
                </div>
              </td>
              <td className="rounded-r-16 bg-surface-subtle px-16 py-14 text-right">
                <Button
                  asChild
                  data-testid={`home-formation-action-${row.id}`}
                  variant="outline"
                  size="md"
                >
                  <NextLink prefetch={false} href={row.action.href}>
                    {row.action.label}
                  </NextLink>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mx-16 mb-12 text-13 text-ink-muted">{t.formations.completedHint}</p>
    </div>
  );
}

export function HomeSlot({ name, children }: Readonly<{ name: string; children?: ReactNode }>) {
  if (children === undefined || children === null) return null;
  return <div data-testid={`home-slot-${name}`}>{children}</div>;
}

export function HomeView({
  initialData,
  initialError,
  requestId,
  initialTab,
}: Readonly<{
  initialData: HomeDto | null;
  initialError: boolean;
  requestId?: string;
  initialTab: 'en-cours' | 'terminees';
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const [now, setNow] = useState<string | null>(null);
  const [tab, setTab] = useState(initialTab);
  const networkToast = useRef(false);
  const query = useQuery({
    queryKey: ['home'],
    queryFn: () => api.homeGet({}),
    ...(initialData === null ? {} : { initialData }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  useEffect(() => {
    const tick = () => {
      setNow(clock.now().toISOString());
    };
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!query.isError || query.data === undefined || networkToast.current) return;
    networkToast.current = true;
    toast({ title: t.networkLost, tone: 'error' });
  }, [query.isError, query.data]);

  if (query.data === undefined) {
    if (initialError || query.isError) {
      return (
        <main className="mx-auto w-full max-w-content px-16 pb-56 shell:px-40">
          <ErrorState
            className="mt-24 rounded-24 border border-solid border-border bg-surface"
            title={t.errorTitle}
            {...(requestId === undefined ? {} : { requestId })}
            onRetry={() => void query.refetch()}
          />
        </main>
      );
    }
    return (
      <main className="mx-auto w-full max-w-content px-16 pb-56 shell:px-40">
        <SkeletonGroup className="mt-24 flex flex-col gap-20" label={t.loading}>
          <SkeletonCard />
          <SkeletonCard />
        </SkeletonGroup>
      </main>
    );
  }

  const data = query.data;
  const liveSlots = data.today.slots.map((slot) => {
    if (now === null) return slot;
    const state = slotState(slot, now, {
      ...(highlightedSlot(data.today.slots, now)?.id === slot.id ? { highlightId: slot.id } : {}),
    });
    return {
      ...slot,
      state,
      minutesUntil: state === 'next' ? minutesUntil(slot, now) : null,
    };
  });
  const livePrimary = data.today.primaryAction;

  const changeTab = (value: string) => {
    const next = value === 'terminees' ? 'terminees' : 'en-cours';
    setTab(next);
    const search = next === 'terminees' ? '?onglet=terminees' : '';
    router.replace(`${pathname}${search}`, { scroll: false });
  };

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-24 overflow-x-hidden px-16 pt-24 pb-56 shell:px-0">
      <header
        data-testid="home-header"
        className="flex flex-wrap items-center justify-between gap-16 py-8"
      >
        <div className="flex flex-col gap-4">
          <p className="m-0 text-14 text-ink-muted">{data.today.label}</p>
          <h1 className="m-0 font-display text-34 font-600 tracking-title">{t.header.title}</h1>
        </div>
        <Button asChild variant="lime" size="md">
          <NextLink prefetch={false} href="/formations/nouvelle">
            {t.header.newFormation}
          </NextLink>
        </Button>
      </header>

      <TutorProposalPanel />

      <div className="flex flex-wrap gap-20">
        <DayCard data={data.today} liveSlots={liveSlots} primaryAction={livePrimary} />
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-20">
          <RetentionCard data={data.retention} />
          {data.globalQuiz === null ? null : <GlobalQuizCard data={data.globalQuiz} />}
        </div>
      </div>

      <div className="flex flex-wrap items-stretch gap-20">
        <HomeSlot name="warmup">
          <WarmupPanel />
        </HomeSlot>
        <div className="flex flex-[2_1_340px] flex-col gap-20">
          <HomeSlot name="agent-feed" />
          <HomeSlot name="weekly" />
        </div>
      </div>

      <Tabs value={tab} onValueChange={changeTab}>
        <section
          id="home-formations"
          data-testid="home-formations"
          aria-labelledby="home-formations-title"
          className="min-w-0 overflow-hidden rounded-24 border border-solid border-border bg-surface p-8"
        >
          <div className="flex flex-wrap items-center justify-between gap-12 px-16 pt-16 pb-8">
            <h2
              id="home-formations-title"
              className="m-0 font-display text-22 font-600 tracking-heading"
            >
              {t.formations.title}
            </h2>
            <TabsList aria-label={t.formations.tabLabel}>
              <TabsTrigger value="en-cours" data-testid="home-tab-ongoing">
                {t.formations.ongoing(data.formations.ongoing.length)}
              </TabsTrigger>
              <TabsTrigger value="terminees" data-testid="home-tab-completed">
                {t.formations.completed(data.formations.completed.length)}
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="en-cours" className="mt-0">
            <FormationsTable
              rows={data.formations.ongoing}
              empty={
                <EmptyState
                  data-testid="home-empty-ongoing"
                  description={t.formations.emptyOngoingDescription}
                  title={t.formations.emptyOngoingTitle}
                  action={
                    <Button asChild variant="lime" size="md">
                      <NextLink prefetch={false} href="/formations/nouvelle">
                        {t.formations.createFormation}
                      </NextLink>
                    </Button>
                  }
                />
              }
            />
          </TabsContent>
          <TabsContent value="terminees" className="mt-0">
            <CompletedTable
              rows={data.formations.completed}
              empty={<EmptyState compact title={t.formations.emptyCompleted} />}
            />
          </TabsContent>
        </section>
      </Tabs>
    </main>
  );
}
