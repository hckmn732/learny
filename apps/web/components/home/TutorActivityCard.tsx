'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import NextLink from 'next/link';
import { useCallback, useMemo, useRef, useState } from 'react';

import type { TutorActivityItem } from '@learny/contracts';
import {
  buildTutorActivityFeed,
  tutorActivityDateLabel,
  TUTOR_SETTINGS_HREF,
} from '@learny/services/accueil-le-tuteur-a-agi-pour-vous';
import { Button, EmptyState, ErrorState, SkeletonCard, SkeletonGroup, toast, cn } from '@learny/ui';

import { api, ApiError } from '../../lib/api-client';
import { fr } from '../../messages/fr/home';

const t = fr.home.tutorActed;

const DOT_CLASS: Record<TutorActivityItem['automation'], string> = {
  reprise: 'bg-orange',
  micro_seance: 'bg-on-dark-muted',
  echauffement: 'bg-teal',
  remediation: 'bg-orange',
  jeu_lacune: 'bg-green',
  questions_cartes: 'bg-indigo',
  plafond_quiz: 'bg-green',
  sprint: 'bg-lime',
  bilan: 'bg-indigo',
  pause: 'bg-ink-muted',
};

type Decision = 'accepted' | 'declined' | 'undone';

function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'CONFLICT';
}

function isConsumed(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'AUTOMATION_ACTION_CONSUMED';
}

function decisionError(error: unknown): string {
  if (isConflict(error)) return t.toastConflict;
  if (isConsumed(error)) return t.toastConsumed;
  return t.toastError;
}

/**
 * EF-1 to EF-4 — recent actions of the tutor on SCR-03. The card reads the SPEC-711 journal with
 * the `applied|consumed` filters, keeps the pending proposals of the other automations (ADR-0191)
 * and never duplicates a route: accept, decline and undo call the existing endpoints. A decision
 * invalidates the automation queries, the home and the agenda, so the banner, the card and the
 * weekly counter move together without a full reload.
 */
export function TutorActivityPanel() {
  const queryClient = useQueryClient();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [timeZone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris',
  );

  const query = useQuery({
    queryKey: ['automation-actions', 'home', 'feed'],
    queryFn: async () => {
      const [applied, consumed, pending] = await Promise.all([
        api.meAutomationActionsList({ query: { status: 'applied', limit: 50 } }),
        api.meAutomationActionsList({ query: { status: 'consumed', limit: 50 } }),
        api.meAutomationActionsList({ query: { status: 'pending_consent', limit: 50 } }),
      ]);
      return buildTutorActivityFeed({
        applied: applied.items,
        consumed: consumed.items,
        pending: pending.items,
        weekCount: Math.max(applied.weekCount, consumed.weekCount, pending.weekCount),
        timeZone,
      });
    },
    retry: false,
    refetchOnWindowFocus: true,
  });

  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['automation-actions'] }),
      queryClient.invalidateQueries({ queryKey: ['home'] }),
      queryClient.invalidateQueries({ queryKey: ['agenda'] }),
    ]);
  }, [queryClient]);

  const decide = useCallback(
    async (item: TutorActivityItem, decision: Exclude<Decision, 'declined'> | 'declined') => {
      setBusyId(item.id);
      try {
        if (decision === 'accepted') {
          await api.meAutomationActionAccept({ params: { id: item.id }, body: {} });
        } else if (decision === 'declined') {
          await api.meAutomationActionDecline({ params: { id: item.id } });
        } else {
          await api.meAutomationActionUndo({ params: { id: item.id } });
        }
        await invalidate();
        setAnnouncement(t.announcements[decision](item.summary));
        headingRef.current?.focus();
      } catch (error) {
        toast({ title: decisionError(error), tone: 'error' });
      } finally {
        setBusyId(null);
      }
    },
    [invalidate],
  );

  const feed = query.data;
  const proposals = feed?.proposals ?? [];
  const items = feed?.items ?? [];
  const empty = proposals.length === 0 && items.length === 0;
  const weekLabel = useMemo(() => (feed === undefined ? '' : t.weekCount(feed.weekCount)), [feed]);

  return (
    <section
      data-testid="tutor-acted"
      aria-labelledby="tutor-acted-title"
      className="flex flex-col gap-6 rounded-24 border border-solid border-border bg-surface px-24 py-22"
    >
      <div className="mb-4 flex items-baseline justify-between gap-10">
        <h2
          id="tutor-acted-title"
          ref={headingRef}
          data-testid="tutor-acted-title"
          tabIndex={-1}
          className="m-0 text-18 font-600 outline-none"
        >
          {t.title}
        </h2>
        <NextLink
          data-testid="automation-settings-link"
          aria-label={t.settingsLabel}
          className="touch-target block text-13 font-600 text-ink underline-offset-2 hover:underline"
          href={TUTOR_SETTINGS_HREF}
        >
          {t.settings}
        </NextLink>
      </div>

      <p className="sr-only" data-testid="tutor-acted-week-count">
        {weekLabel}
      </p>
      <p
        aria-live="polite"
        data-testid="tutor-acted-announcement"
        className="sr-only"
        role="status"
      >
        {announcement}
      </p>

      {query.isPending ? (
        <SkeletonGroup label={t.loading}>
          <SkeletonCard className="border-0 p-0" />
        </SkeletonGroup>
      ) : query.isError ? (
        <ErrorState
          data-testid="tutor-acted-error"
          className="px-0 py-16"
          description={t.errorDescription}
          title={t.errorTitle}
          onRetry={() => void query.refetch()}
        />
      ) : empty ? (
        <EmptyState compact data-testid="tutor-acted-empty" title={t.empty} />
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {proposals.map((item) => (
            <ActivityLine
              key={item.id}
              item={item}
              timeZone={timeZone}
              busy={busyId === item.id}
              onAccept={() => void decide(item, 'accepted')}
              onDecline={() => void decide(item, 'declined')}
              onUndo={() => void decide(item, 'undone')}
            />
          ))}
          {items.map((item) => (
            <ActivityLine
              key={item.id}
              item={item}
              timeZone={timeZone}
              busy={busyId === item.id}
              onAccept={() => void decide(item, 'accepted')}
              onDecline={() => void decide(item, 'declined')}
              onUndo={() => void decide(item, 'undone')}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ActivityLine({
  item,
  timeZone,
  busy,
  onAccept,
  onDecline,
  onUndo,
}: Readonly<{
  item: TutorActivityItem;
  timeZone: string;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onUndo: () => void;
}>) {
  const pending = item.status === 'pending_consent';
  return (
    <li
      data-testid="automation-action"
      data-status={item.status}
      className="flex flex-col gap-8 border-t border-solid border-divider py-12 first:border-t-0"
    >
      <div className="flex items-start gap-10">
        {/* 8 px status dot, same size as the dots of Toast and AlertDialog (SCR-03 mockup). */}
        <span
          aria-hidden="true"
          data-testid="automation-action-dot"
          className={cn('mt-6 size-8 shrink-0 rounded-full', DOT_CLASS[item.automation])}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="flex flex-wrap items-baseline justify-between gap-x-8">
            <span className="text-11 font-700 tracking-kicker text-ink-muted uppercase">
              {t.kinds[item.automation]}
            </span>
            <time className="text-11 text-ink-muted tabular-nums" dateTime={item.createdAt}>
              {tutorActivityDateLabel(item.createdAt, timeZone)}
            </time>
          </span>
          <span className="text-14 leading-1.45">{item.summary}</span>
        </div>
      </div>
      {pending ? (
        <div className="flex flex-wrap gap-6 pl-18">
          <Button
            data-testid="automation-action-confirm"
            disabled={busy}
            size="sm"
            variant="dark"
            onClick={onAccept}
          >
            {t.confirm}
          </Button>
          <Button
            data-testid="automation-action-decline"
            disabled={busy}
            size="sm"
            variant="outline"
            onClick={onDecline}
          >
            {t.decline}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-6 pl-18">
          {item.canUndo ? (
            <Button
              data-testid="automation-action-undo"
              disabled={busy}
              size="sm"
              variant="outline"
              onClick={onUndo}
            >
              {t.undo}
            </Button>
          ) : null}
          {item.href === null ? null : (
            <Button asChild data-testid="automation-action-open" size="sm" variant="outline">
              <NextLink prefetch={false} href={item.href}>
                {t.open}
              </NextLink>
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
