'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import type { AutomationActionItem } from '@learny/contracts';
import { clock } from '@learny/core';
import { Button, Icon, toast, cn } from '@learny/ui';

import { fr } from '../../messages/fr';

import {
  proposalErrorMessage,
  useTutorProposals,
  type TutorProposals,
} from './use-tutor-proposals';

const t = fr.home.proposal;

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

interface LocalPart {
  year: number;
  month: number;
  date: number;
  weekday: number;
  hour: number;
  minute: number;
}

function localParts(instant: string, timeZone: string): LocalPart {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  const year = value('year');
  const month = value('month');
  const date = value('day');
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  return { year, month, date, weekday, hour: value('hour'), minute: value('minute') };
}

function civilDay(instant: string, timeZone: string): string {
  const part = localParts(instant, timeZone);
  return `${String(part.year)}-${String(part.month).padStart(2, '0')}-${String(part.date).padStart(2, '0')}`;
}

function weekdayOf(day: string): number {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function shiftDay(day: string, days: number): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date + days));
  return `${String(shifted.getUTCFullYear())}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

/**
 * EF-9, §10 — « Jeudi 15:00 » in the current week, « Lundi 16 nov., 9:00 » afterwards. The same
 * rule as the server explanation, kept client-side so the browser never imports the database.
 */
export function slotLabel(instant: string, now: string, timeZone: string): string {
  const day = civilDay(instant, timeZone);
  const reference = civilDay(now, timeZone);
  const monday = shiftDay(reference, -(weekdayOf(reference) - 1));
  const within = day >= monday && day <= shiftDay(monday, 6);
  const part = localParts(instant, timeZone);
  const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
  const weekday = cap(WEEKDAYS[part.weekday] ?? '');
  const clockLabel = `${String(part.hour)}:${String(part.minute).padStart(2, '0')}`;
  if (within) return `${weekday} ${clockLabel}`;
  return `${weekday} ${String(part.date)} ${MONTHS[part.month - 1] ?? ''}, ${clockLabel}`;
}

interface BannerProps {
  action: AutomationActionItem;
  accepted?: AutomationActionItem | null;
  extraCount: number;
  now: string;
  timeZone: string;
  busy?: boolean;
  onAccept: (actionId: string, choice?: Record<string, unknown>) => void;
  onDecline: (actionId: string) => void;
  onUndo: (actionId: string) => void;
}

type PlanOption = {
  kind: 'shift_end' | 'lighten';
  feasible?: boolean;
  reason?: string | null;
};

function alternativesOf(action: AutomationActionItem): { startsAt: string; endsAt: string }[] {
  const value = action.payload.alternatives;
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is { startsAt: string; endsAt: string } =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as { startsAt?: unknown }).startsAt === 'string',
  );
}

function planOptionsOf(action: AutomationActionItem): PlanOption[] {
  const value = action.payload.options;
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is PlanOption =>
      typeof entry === 'object' &&
      entry !== null &&
      ((entry as { kind?: unknown }).kind === 'shift_end' ||
        (entry as { kind?: unknown }).kind === 'lighten'),
  );
}

/** EF-9, ADR-0191 — the banner of the pending proposal; presentational and keyboard aware. */
export function TutorProposalBanner({
  action,
  accepted = null,
  extraCount,
  now,
  timeZone,
  busy = false,
  onAccept,
  onDecline,
  onUndo,
}: BannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const otherRef = useRef<HTMLButtonElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    groupRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [expanded]);

  const shown = accepted ?? action;
  const done = accepted !== null && accepted.status === 'applied';
  const isPlan = action.kind === 'plan_change_proposed' && !done;
  const alternatives = alternativesOf(action);
  const options = planOptionsOf(action);

  const closeWithEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || !expanded) return;
    setExpanded(false);
    otherRef.current?.focus();
  };

  return (
    <section
      data-testid="tutor-proposal-banner"
      aria-labelledby="t-propose"
      className="flex min-h-[70px] flex-wrap items-center gap-x-20 gap-y-14 rounded-20 border border-solid border-border border-l-[6px] border-l-orange bg-surface px-18 py-16"
    >
      <span
        aria-hidden="true"
        data-testid="tutor-proposal-icon"
        className="flex size-[38px] shrink-0 items-center justify-center rounded-12 bg-orange-soft text-orange-ink"
      >
        <Icon name="refresh" size={18} />
      </span>
      <div className="flex min-w-[260px] flex-[1_1_320px] flex-col gap-0.5">
        <h2
          id="t-propose"
          data-testid="tutor-proposal-kicker"
          className="m-0 text-12 font-700 tracking-kicker text-orange-ink uppercase"
        >
          {done ? t.kickerDone : t.kickerAsk}
        </h2>
        <p aria-live="polite" data-testid="tutor-proposal-text" className="m-0 text-15 leading-1.5">
          {shown.summary}
        </p>
        {extraCount > 0 ? (
          <a
            data-testid="tutor-proposal-more"
            className="text-13 font-600 text-indigo underline"
            href="/parametres#automatismes"
          >
            {t.more(extraCount)}
          </a>
        ) : null}
      </div>

      {done ? (
        <Button
          data-testid="tutor-proposal-undo"
          className="min-h-[42px]"
          disabled={busy}
          onClick={() => {
            onUndo(shown.id);
          }}
          size="md"
          variant="outline"
        >
          {t.undo}
        </Button>
      ) : isPlan ? (
        <div className="flex w-full flex-col gap-10 sm:w-auto sm:flex-row">
          <Button
            data-testid="tutor-proposal-options"
            onClick={() => {
              setOptionsOpen((value) => !value);
            }}
            aria-expanded={optionsOpen}
            size="md"
            variant="dark"
          >
            {t.options}
          </Button>
          <Button
            data-testid="tutor-proposal-later"
            disabled={busy}
            onClick={() => {
              onDecline(action.id);
            }}
            size="md"
            variant="outline"
          >
            {t.later}
          </Button>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-8 sm:w-auto sm:flex-row">
          <Button
            data-testid="tutor-proposal-accept"
            className="min-h-[42px]"
            disabled={busy}
            onClick={() => {
              onAccept(action.id);
            }}
            size="md"
            variant="dark"
          >
            {t.accept}
          </Button>
          <Button
            ref={otherRef}
            data-testid="tutor-proposal-other"
            className="min-h-[42px]"
            aria-expanded={expanded}
            aria-controls="tutor-proposal-slots"
            onClick={() => {
              setExpanded((value) => !value);
            }}
            size="md"
            variant="outline"
          >
            {t.other}
          </Button>
        </div>
      )}

      {expanded && !done && !isPlan ? (
        <div
          ref={groupRef}
          id="tutor-proposal-slots"
          data-testid="tutor-proposal-slots"
          role="group"
          aria-label={t.slotsLabel}
          className="flex w-full flex-wrap gap-8 pt-2 sm:pl-[58px]"
        >
          {alternatives.map((alternative, index) => (
            <button
              key={alternative.startsAt}
              type="button"
              data-testid={`tutor-proposal-slot-${String(index)}`}
              disabled={busy}
              onClick={() => {
                onAccept(action.id, { startsAt: alternative.startsAt });
                setExpanded(false);
              }}
              onKeyDown={closeWithEscape}
              className="min-h-[38px] rounded-full border border-solid border-border bg-surface-subtle px-14 text-13 font-600 text-ink"
            >
              {slotLabel(alternative.startsAt, now, timeZone)}
            </button>
          ))}
          <button
            type="button"
            data-testid="tutor-proposal-decline"
            disabled={busy}
            onClick={() => {
              onDecline(action.id);
              setExpanded(false);
            }}
            onKeyDown={closeWithEscape}
            className="min-h-[38px] rounded-full border border-solid border-border bg-surface px-14 text-13 font-600 text-ink"
          >
            {t.decline}
          </button>
        </div>
      ) : null}

      {optionsOpen && isPlan ? (
        <div
          data-testid="tutor-proposal-plan-options"
          role="group"
          aria-label={t.planTitle}
          className="flex w-full flex-wrap gap-8 pt-2 sm:pl-[58px]"
        >
          {options.map((option) => (
            <button
              key={option.kind}
              type="button"
              data-testid={`tutor-proposal-plan-${option.kind}`}
              disabled={busy || option.feasible === false}
              onClick={() => {
                onAccept(action.id, { option: option.kind });
                setOptionsOpen(false);
              }}
              className={cn(
                'min-h-[44px] rounded-full border border-solid border-border bg-surface-subtle px-16 text-14 font-600 text-ink',
                option.feasible === false ? 'opacity-60' : '',
              )}
            >
              {option.kind === 'shift_end' ? t.shiftEnd : t.lighten}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/**
 * EF-9 — the container of the home page: loading and errors leave the page unchanged, an accepted
 * action shows « Séance replacée », and every decision invalidates the three shared query keys.
 */
export function TutorProposalPanel() {
  const proposals = useTutorProposals();
  const [now] = useState(() => clock.now().toISOString());
  const [timeZone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris',
  );

  if (proposals.action === null && proposals.accepted === null) return null;

  const notify = (error: unknown) => {
    toast({ title: proposalErrorMessage(error), tone: 'error' });
  };

  const action = proposals.action ?? proposals.accepted;
  if (action === null) return null;
  return (
    <TutorProposalBanner
      action={proposals.accepted ?? action}
      accepted={proposals.accepted}
      extraCount={proposals.accepted === null ? proposals.extraCount : 0}
      now={now}
      timeZone={timeZone}
      busy={proposals.busy}
      onAccept={(actionId, choice) => {
        proposals.accept(actionId, choice).catch(notify);
      }}
      onDecline={(actionId) => {
        proposals.decline(actionId).catch(notify);
      }}
      onUndo={(actionId) => {
        proposals.undo(actionId).catch(notify);
      }}
    />
  );
}

export type { TutorProposals };
