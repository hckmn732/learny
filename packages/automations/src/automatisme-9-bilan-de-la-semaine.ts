// « Bilan de la semaine » (SPEC-720, BR-AUT-09, ADR-0190, ADR-0047).
//
// At the chosen local weekday and hour (default Sunday 19:00), the definition drafts one
// `weekly_review` action: the hours really done during the local week, the retention of SPEC-408,
// the notions due or at risk of SPEC-402 and the planned slots of the next week (SPEC-407). The
// text is deterministic; every number comes from the learner's own rows, read under the engine
// transaction. A missing measure stays `null` and is rendered « Non disponible », never as a fake 0.
// The action needs no consent: the notification is the effect, and the journal row is the durable
// trace (ADR-0190). The weekly dedupe key makes a replayed hourly tick a no-op (CA-1, CL-3).
import type { z } from 'zod';

import {
  formatWeeklyStudy,
  sumPlanMinutes,
  WEEKLY_REVIEW_AVAILABILITY_HREF,
  WEEKLY_REVIEW_KIND,
  type WeeklyReviewActionPayload,
  WeeklyReviewParams,
  weeklyPeriodLabel,
  weeklyReceivedLabel,
  weeklyRetentionLabel,
  weeklyReviewDedupeKey,
  weeklyReviewExternalChannels,
  weeklyReviewWeek,
} from '@learny/contracts';
import { userWeekday } from '@learny/core';
import { collectWeeklyReviewData } from '@learny/services';

import {
  defineAutomation,
  type AutomationActionDraft,
  type AutomationActionView,
  type AutomationDefinition,
  type AutomationDomainContext,
  type AutomationTone,
} from './moteur-d-automatismes';

const SUMMARY_MAX = 160;

function clip(value: string): string {
  return value.length <= SUMMARY_MAX ? value : `${value.slice(0, SUMMARY_MAX - 1).trimEnd()}…`;
}

function countLabel(count: number): string {
  return count === 0
    ? 'aucune notion à risque'
    : count === 1
      ? '1 notion à risque'
      : `${String(count)} notions à risque`;
}

/** EF-2, ET-5 — one line, ≤ 160 characters, with the prefix of a final status. */
export function explainWeeklyReview(
  action: AutomationActionView,
  _tone: AutomationTone,
  timeZone: string,
): string {
  const prefix =
    action.status === 'declined'
      ? 'Refusé : '
      : action.status === 'expired'
        ? 'Expiré : '
        : action.status === 'undone'
          ? 'Annulé : '
          : '';
  const payload = action.payload;
  const minutes = typeof payload.studyMinutes === 'number' ? payload.studyMinutes : 0;
  const retention = payload.retention;
  const rate =
    typeof retention === 'object' && retention !== null && 'rate' in retention
      ? (retention as { rate?: unknown }).rate
      : null;
  const retentionValue = typeof rate === 'number' ? rate : null;
  const atRiskCount = typeof payload.atRiskCount === 'number' ? payload.atRiskCount : 0;
  const retentionPart =
    retentionValue === null
      ? 'rétention non disponible'
      : `${weeklyRetentionLabel(retentionValue)} retenu à 1 mois`;
  const day = typeof payload.reviewOn === 'string' ? payload.reviewOn : action.createdAt;
  const received = day === '' ? '' : ` (${weeklyReceivedLabel(day, timeZone)})`;
  return clip(
    `${prefix}Bilan de la semaine${received} : ${formatWeeklyStudy(minutes)} d’étude, ${retentionPart}, ${countLabel(atRiskCount)}.`,
  );
}

async function weeklyReviewDraft(
  ctx: AutomationDomainContext<z.output<typeof WeeklyReviewParams>>,
): Promise<AutomationActionDraft> {
  const week = weeklyReviewWeek(ctx.now, ctx.timeZone);
  const { studyMinutes, retention, atRiskNotions, plan } = await collectWeeklyReviewData(ctx.db, {
    userId: ctx.userId,
    now: ctx.now,
    timeZone: ctx.timeZone,
    week,
  });
  const dedupeKey = weeklyReviewDedupeKey(ctx.userId, week.weekKey);
  const periodLabel = weeklyPeriodLabel(week.weekStart, week.weekEnd);
  const studyLabel = formatWeeklyStudy(studyMinutes);
  const retentionLabel = weeklyRetentionLabel(retention.rate);
  const atRiskCount = atRiskNotions.length;
  const payload: WeeklyReviewActionPayload = {
    dedupeKey,
    weekKey: week.weekKey,
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    nextWeekStart: week.nextWeekStart,
    reviewOn: ctx.now.toISOString(),
    studyMinutes,
    retention,
    atRiskNotions,
    atRiskCount,
    plan,
    planMinutes: sumPlanMinutes(plan),
    channel: ctx.params.channel,
    availabilityHref: WEEKLY_REVIEW_AVAILABILITY_HREF,
  };
  const atRiskSummary =
    atRiskCount === 0
      ? 'Aucune notion à risque.'
      : `${countLabel(atRiskCount)} : ${atRiskNotions
          .slice(0, 3)
          .map((notion) => notion.label)
          .join(', ')}.`;
  const planSummary =
    plan.length === 0
      ? 'Aucun créneau planifié pour la semaine suivante.'
      : `Plan de la semaine suivante : ${String(Math.round(sumPlanMinutes(plan) / 6) / 10)} h sur ${String(plan.length)} jour${plan.length === 1 ? '' : 's'}.`;
  return {
    kind: WEEKLY_REVIEW_KIND,
    formationId: null,
    requiresConsent: false,
    payload: { ...payload },
    dedupeKey,
    notification: {
      type: 'weekly_review',
      href: '/accueil#bilan',
      channels: weeklyReviewExternalChannels(ctx.params.channel),
      data: {
        studyLabel,
        periodStartLabel: periodLabel,
        periodEndLabel: week.weekEnd,
        atRiskCount,
        atRisk: atRiskSummary,
        nextWeek: planSummary,
        succeeded:
          retention.rate === null
            ? 'La rétention sera mesurée après les premières révisions.'
            : `${retentionLabel} des notions revues sont retenues à un mois.`,
        ...(retention.rate === null ? {} : { retentionPercent: retention.rate }),
        href: '/accueil#bilan',
      },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Definition                                                          */
/* ------------------------------------------------------------------ */

export const weeklyReviewAutomation: AutomationDefinition<typeof WeeklyReviewParams> =
  defineAutomation({
    key: 'bilan',
    // ET-3 — the hourly tick of SPEC-203 calls the definition at the configured local hour.
    triggers: [{ type: 'hourly', localHour: (params) => Number(params.hour ?? 19) }],
    params: WeeklyReviewParams,
    run: async (ctx, trigger) => {
      if (trigger.type !== 'hourly') return [];
      const hour =
        typeof trigger.localHour === 'function' ? trigger.localHour(ctx.params) : trigger.localHour;
      if (hour !== ctx.params.hour) return [];
      // BR-AUT-09 — only the configured local weekday produces the review; the weekly dedupe key
      // then guarantees a single row even when the tick is delivered twice (CL-3, CL-5).
      if (userWeekday(ctx.now, ctx.timeZone) !== ctx.params.weekday) return [];
      return [await weeklyReviewDraft(ctx)];
    },
    explain: explainWeeklyReview,
  });
