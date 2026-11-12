import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fsrs } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';

import { ENGINE } from '@learny/config/product';
import {
  DEFAULT_WARMUP_PARAMS,
  applyReview,
  calculateMastery,
  createNotionCard,
  localDateOf,
  selectWarmup,
  warmupCandidates,
} from '@learny/learning-engine';
import type {
  FsrsCardStateName,
  IsoDate,
  MasteryAnswer,
  NotionLinkRef,
  NotionRef,
  SerializedFsrsCard,
  WarmupNotionState,
} from '@learny/learning-engine';
import {
  REFERENCE_NOW,
  SAP_FORMATION,
  SAP_LINKS,
  SAP_NOTIONS,
} from '@learny/learning-engine/fixtures';

const TZ = SAP_FORMATION.tz;
const NOW = REFERENCE_NOW;

const STATE_NAMES: Readonly<
  Record<FsrsCardStateName, 'New' | 'Learning' | 'Review' | 'Relearning'>
> = {
  new: 'New',
  learning: 'Learning',
  review: 'Review',
  relearning: 'Relearning',
};

const scheduler = fsrs({ request_retention: ENGINE.fsrs.requestRetention });

/** FSRS retrievability of a serialized card at the instant, computed by ts-fsrs (SPEC-402). */
function retrievabilityOf(card: SerializedFsrsCard, at: string): number | null {
  if (card.state === 'new' && card.reps === 0) return null;
  return scheduler.get_retrievability(
    {
      due: new Date(card.due),
      stability: card.stability,
      difficulty: card.difficulty,
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- required by ts-fsrs 5 CardInput
      elapsed_days: card.elapsed_days,
      scheduled_days: card.scheduled_days,
      learning_steps: card.learning_steps,
      reps: card.reps,
      lapses: card.lapses,
      state: STATE_NAMES[card.state],
      last_review: card.last_review === null ? null : new Date(card.last_review),
    },
    new Date(at),
    false,
  );
}

interface StateOptions {
  readonly lastSeenOn?: IsoDate | null;
  readonly suspended?: boolean;
  readonly scores?: readonly number[];
  readonly reviewedAt?: string;
}

/** One notion state: mastery from SPEC-403 answers, retrievability from a SPEC-402 card. */
function stateOf(notion: NotionRef, options: StateOptions = {}): WarmupNotionState {
  const answers: MasteryAnswer[] = (options.scores ?? []).map((score, index) => ({
    answerId: `${notion.notionId}-a${String(index)}`,
    attemptId: `${notion.notionId}-t${String(index)}`,
    score,
    answeredAt: `2026-11-${String(4 + index).padStart(2, '0')}T10:00:00.000Z`,
  }));
  const mastery =
    answers.length === 0
      ? 0
      : Math.round(
          calculateMastery({
            answers,
            at: NOW,
            threshold: ENGINE.mastery.threshold,
            halfLifeDays: ENGINE.mastery.halfLifeDays,
          }).mastery * 100,
        ) / 100;
  let card: SerializedFsrsCard | null = null;
  if (options.reviewedAt !== undefined) {
    const created = createNotionCard(options.reviewedAt, ENGINE.fsrs.requestRetention);
    card = applyReview(created, 'good', options.reviewedAt, ENGINE.fsrs.requestRetention).card;
  }
  return {
    notionId: notion.notionId,
    formationId: SAP_FORMATION.formationId,
    chapterId: notion.chapterId,
    lastSeenOn: options.lastSeenOn ?? null,
    suspended: options.suspended ?? false,
    mastery,
    retrievability: card === null ? null : retrievabilityOf(card, NOW),
  };
}

function accessibleChapters(): string[] {
  return [
    ...new Set(
      SAP_NOTIONS.filter((notion) => ['sap-m1', 'sap-m2', 'sap-m3'].includes(notion.moduleId)).map(
        (notion) => notion.chapterId,
      ),
    ),
  ];
}

/** SAP projection with two notions of the reference day, two prerequisite origins, no others. */
function sapStates(): WarmupNotionState[] {
  const overrides: Readonly<Record<string, StateOptions>> = {
    'n-societe': {
      lastSeenOn: '2026-11-10',
      scores: [0.4, 0.5],
      reviewedAt: '2026-11-05T10:00:00.000Z',
    },
    'n-ledger': {
      lastSeenOn: '2026-11-10',
      scores: [0.8, 0.9],
      reviewedAt: '2026-11-09T10:00:00.000Z',
    },
    'n-variante': {
      lastSeenOn: '2026-11-06',
      scores: [0.2, 0.3],
      reviewedAt: '2026-11-02T10:00:00.000Z',
    },
    'n-compte': {
      lastSeenOn: '2026-11-07',
      scores: [0.7, 0.8],
      reviewedAt: '2026-11-08T10:00:00.000Z',
    },
    'n-perimetre': {
      lastSeenOn: '2026-11-05',
      suspended: true,
      scores: [0.1, 0.2],
      reviewedAt: '2026-11-01T10:00:00.000Z',
    },
    'n-type': { suspended: true },
  };
  return SAP_NOTIONS.map((notion) => stateOf(notion, overrides[notion.notionId] ?? {}));
}

function sapInput(overrides: Record<string, unknown> = {}) {
  return {
    formationId: SAP_FORMATION.formationId,
    seenNotions: sapStates(),
    prerequisiteLinks: [
      ...SAP_LINKS,
      { fromNotionId: 'n-perimetre', toNotionId: 'n-poste', kind: 'prerequisite' as const },
    ],
    nextChapterId: 'sap-m3-c2',
    accessibleChapterIds: accessibleChapters(),
    localDate: localDateOf(NOW, TZ),
    seed: 'SPEC-410-integration',
    ...overrides,
  };
}

describe('[SPEC-410] composition', () => {
  it('reflète les paramètres normatifs du moteur (CA-3)', () => {
    expect(DEFAULT_WARMUP_PARAMS).toEqual({
      defaultCount: ENGINE.warmup.defaultCount,
      allowedCounts: ENGINE.warmup.allowedCounts,
      defaultScope: ENGINE.warmup.defaultScope,
      lookbackDays: ENGINE.warmup.yesterdayLookbackDays,
    });
  });

  it('compose les liens du programme et les états FSRS (CA-1, CA-2, CA-3)', () => {
    const candidates = warmupCandidates(sapInput());
    expect(candidates.yesterdayOn).toBe('2026-11-10');
    expect(candidates.yesterday.map((item) => item.notionId)).toEqual(['n-societe', 'n-ledger']);
    expect(candidates.prerequisites.map((item) => item.notionId)).toEqual([
      'n-variante',
      'n-compte',
    ]);

    const choices = selectWarmup(sapInput({ count: 3 }));
    expect(choices).toHaveLength(3);
    expect(new Set(choices.map((choice) => choice.notionId)).size).toBe(3);
    expect(choices.slice(0, 2)).toEqual([
      { notionId: 'n-variante', reason: 'prerequisite' },
      { notionId: 'n-societe', reason: 'yesterday' },
    ]);
    expect(choices.map((choice) => choice.notionId)).not.toContain('n-type');
    expect(choices.map((choice) => choice.notionId)).not.toContain('n-perimetre');
    expect(choices.map((choice) => choice.notionId)).not.toContain('n-partie');

    const yesterdayOnly = selectWarmup(sapInput({ count: 5, scope: 'yesterday' }));
    expect(yesterdayOnly.map((choice) => choice.notionId)).toEqual(['n-societe', 'n-ledger']);

    const short = selectWarmup(sapInput({ count: 5 }));
    expect(short).toHaveLength(4);
  });

  it('évalue la veille sur le calendrier local au passage d’heure (CA-4)', () => {
    const dstNow = '2026-10-25T23:30:00.000Z';
    const localDate = localDateOf(dstNow, TZ);
    expect(localDate).toBe('2026-10-26');

    const seenNotions = [
      {
        notionId: 'n-veille',
        formationId: SAP_FORMATION.formationId,
        chapterId: 'sap-m1-c1',
        lastSeenOn: localDateOf('2026-10-25T22:30:00.000Z', TZ),
        suspended: false,
        mastery: 50,
        retrievability: 0.5,
      },
      {
        notionId: 'n-aujourdhui',
        formationId: SAP_FORMATION.formationId,
        chapterId: 'sap-m1-c1',
        lastSeenOn: localDateOf('2026-10-25T23:15:00.000Z', TZ),
        suspended: false,
        mastery: 10,
        retrievability: 0.1,
      },
    ];
    expect(seenNotions.map((item) => item.lastSeenOn)).toEqual(['2026-10-25', '2026-10-26']);

    const choices = selectWarmup({
      formationId: SAP_FORMATION.formationId,
      seenNotions,
      prerequisiteLinks: [],
      nextChapterId: 'sap-m1-c1',
      accessibleChapterIds: ['sap-m1-c1'],
      localDate,
      scope: 'yesterday',
      count: 5,
      seed: 'dst',
    });
    expect(choices).toEqual([{ notionId: 'n-veille', reason: 'yesterday' }]);

    const springNow = '2026-03-30T00:30:00.000Z';
    const springLocalDate = localDateOf(springNow, TZ);
    expect(springLocalDate).toBe('2026-03-30');
    const yesterdayNotion = seenNotions[0];
    if (yesterdayNotion === undefined) throw new Error('notion de la veille absente');
    const spring = selectWarmup({
      formationId: SAP_FORMATION.formationId,
      seenNotions: [
        {
          ...yesterdayNotion,
          notionId: 'n-printemps',
          lastSeenOn: '2026-03-29',
        },
      ],
      prerequisiteLinks: [],
      nextChapterId: 'sap-m1-c1',
      accessibleChapterIds: ['sap-m1-c1'],
      localDate: springLocalDate,
      scope: 'yesterday',
      count: 5,
      seed: 'dst',
    });
    expect(spring).toEqual([{ notionId: 'n-printemps', reason: 'yesterday' }]);
  });

  it('reste invariant à la répétition et à l’ordre des entrées (CA-3)', () => {
    const base = sapInput({ count: 5 });
    const first = selectWarmup(base);
    const frozen = JSON.stringify(base);
    expect(selectWarmup(base)).toEqual(first);
    const permuted = {
      ...base,
      seenNotions: [...base.seenNotions].reverse(),
      prerequisiteLinks: [...base.prerequisiteLinks].reverse() as readonly NotionLinkRef[],
      accessibleChapterIds: [...base.accessibleChapterIds].reverse(),
    };
    expect(selectWarmup(permuted)).toEqual(first);
    expect(warmupCandidates(permuted)).toEqual(warmupCandidates(base));
    expect(JSON.stringify(base)).toBe(frozen);
  });

  it('garde le module d’échauffement pur, sans configuration, horloge ni I/O (ET-4)', () => {
    const root = fileURLToPath(new URL('../../src/warmup', import.meta.url));
    for (const file of ['select.ts', 'index.ts']) {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      expect(source).not.toMatch(/from\s+['"]@learny\/config/u);
      expect(source).not.toMatch(/\bDate\.now\s*\(/u);
      expect(source).not.toMatch(/new Date\(\s*\)/u);
      expect(source).not.toMatch(/\bfetch\s*\(/u);
    }
  });
});
