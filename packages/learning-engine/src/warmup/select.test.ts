import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { EngineError } from '../errors';
import type { Id, IsoDate, NotionLinkRef } from '../types';

import { DEFAULT_WARMUP_PARAMS, selectWarmup, warmupCandidates } from './index';
import type { SelectWarmupInput, WarmupNotionState, WarmupScope } from './index';

const LOCAL_DATE = '2026-11-11';
const FORMATION = 'sap';
const NEXT_CHAPTER = 'sap-m3-c2';
const ACCESSIBLE = ['sap-m1-c1', 'sap-m3-c1', NEXT_CHAPTER] as const;
const SEED = 'spec-410';
const FAST_CHECK = { seed: 20261111, numRuns: 100 } as const;

function notion(notionId: Id, partial: Partial<WarmupNotionState> = {}): WarmupNotionState {
  return {
    notionId,
    formationId: FORMATION,
    chapterId: 'sap-m1-c1',
    lastSeenOn: null,
    suspended: false,
    mastery: 50,
    retrievability: 0.5,
    ...partial,
  };
}

function link(fromNotionId: Id, toNotionId: Id, kind: NotionLinkRef['kind'] = 'prerequisite') {
  return { fromNotionId, toNotionId, kind } satisfies NotionLinkRef;
}

function input(overrides: Partial<SelectWarmupInput> = {}): SelectWarmupInput {
  return {
    formationId: FORMATION,
    seenNotions: [],
    prerequisiteLinks: [],
    nextChapterId: NEXT_CHAPTER,
    accessibleChapterIds: ACCESSIBLE,
    localDate: LOCAL_DATE,
    seed: SEED,
    ...overrides,
  };
}

/** Two notions of the reference day, two prerequisite origins seen earlier, one target. */
function mixedInput(overrides: Partial<SelectWarmupInput> = {}): SelectWarmupInput {
  return input({
    seenNotions: [
      notion('n-t', { chapterId: NEXT_CHAPTER }),
      notion('n-y1', { lastSeenOn: '2026-11-10', mastery: 70, retrievability: 0.8 }),
      notion('n-y2', { lastSeenOn: '2026-11-10', mastery: 60, retrievability: 0.6 }),
      notion('n-p1', { lastSeenOn: '2026-11-08', mastery: 40, retrievability: 0.4 }),
      notion('n-p2', { lastSeenOn: '2026-11-07', mastery: 50, retrievability: 0.5 }),
    ],
    prerequisiteLinks: [link('n-p1', 'n-t'), link('n-p2', 'n-t')],
    ...overrides,
  });
}

function ids(choices: readonly { notionId: Id }[]): Id[] {
  return choices.map((choice) => choice.notionId);
}

function engineError(run: () => unknown): EngineError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(EngineError);
    return error as EngineError;
  }
  throw new Error('aucune EngineError levée');
}

describe('[SPEC-410] Sélection de l’échauffement', () => {
  it('CA-1 renvoie un prérequis puis une notion de la veille, complétés à trois identifiants uniques', () => {
    const combined = selectWarmup(mixedInput({ count: 3 }));
    expect(combined).toHaveLength(3);
    expect(new Set(ids(combined)).size).toBe(3);
    expect(combined[0]).toEqual({ notionId: 'n-p1', reason: 'prerequisite' });
    expect(combined[1]).toEqual({ notionId: 'n-y2', reason: 'yesterday' });
    expect(['n-y1', 'n-p2']).toContain(combined[2]?.notionId);

    const yesterdayOnly = selectWarmup(mixedInput({ count: 3, scope: 'yesterday' }));
    expect(yesterdayOnly).toEqual([
      { notionId: 'n-y2', reason: 'yesterday' },
      { notionId: 'n-y1', reason: 'yesterday' },
    ]);
  });

  it('CA-2 exclut notions jamais vues, suspendues, hors formation ou d’un chapitre inaccessible', () => {
    const exclusions = input({
      seenNotions: [
        notion('n-t', { chapterId: NEXT_CHAPTER }),
        notion('n-suspendue', { lastSeenOn: '2026-11-10', suspended: true }),
        notion('n-etrangere', {
          formationId: 'autre',
          lastSeenOn: '2026-11-10',
          mastery: 10,
        }),
        notion('n-verrouillee', {
          chapterId: 'sap-m4-c1',
          lastSeenOn: '2026-11-10',
          mastery: 10,
        }),
        notion('n-active', { lastSeenOn: '2026-11-10', mastery: 90 }),
      ],
      prerequisiteLinks: [
        link('n-jamais-vue', 'n-t'),
        link('n-suspendue', 'n-t'),
        link('n-etrangere', 'n-t'),
        link('n-verrouillee', 'n-t'),
      ],
      count: 5,
    });
    const choices = selectWarmup(exclusions);
    expect(ids(choices)).toEqual(['n-active']);
    expect(choices[0]?.reason).toBe('yesterday');

    const candidates = warmupCandidates(exclusions);
    expect(ids(candidates.yesterday)).toEqual(['n-active']);
    expect(candidates.prerequisites).toEqual([]);
  });

  it('CA-3 respecte les tailles 2/3/5, la stabilité à seed égale et la variété entre seeds', () => {
    const many = input({
      seenNotions: [
        notion('n-a', { lastSeenOn: '2026-11-10', mastery: 10, retrievability: 0.1 }),
        notion('n-b', { lastSeenOn: '2026-11-10', mastery: 20, retrievability: 0.2 }),
        notion('n-c', { lastSeenOn: '2026-11-10', mastery: 30, retrievability: 0.3 }),
        notion('n-d', { lastSeenOn: '2026-11-10', mastery: 40, retrievability: 0.4 }),
        notion('n-e', { lastSeenOn: '2026-11-10', mastery: 50, retrievability: 0.5 }),
        notion('n-f', { lastSeenOn: '2026-11-10', mastery: 60, retrievability: 0.6 }),
      ],
      scope: 'yesterday',
      seed: SEED,
    });
    for (const count of [2, 3, 5]) {
      const choices = selectWarmup({ ...many, count });
      expect(choices).toHaveLength(count);
      expect(new Set(ids(choices)).size).toBe(count);
      expect(selectWarmup({ ...many, count })).toEqual(choices);
    }

    const permutations = [many, { ...many, seenNotions: [...many.seenNotions].reverse() }];
    const reference = selectWarmup({ ...(permutations[0] as SelectWarmupInput), count: 3 });
    for (const permutation of permutations) {
      expect(selectWarmup({ ...permutation, count: 3 })).toEqual(reference);
    }

    const selections = new Set(
      Array.from({ length: 20 }, (_, index) =>
        JSON.stringify(ids(selectWarmup({ ...many, count: 2, seed: `graine-${String(index)}` }))),
      ),
    );
    expect(selections.size).toBeGreaterThan(1);

    const short = selectWarmup({
      ...input({
        seenNotions: [
          notion('n-a', { lastSeenOn: '2026-11-10' }),
          notion('n-b', { lastSeenOn: '2026-11-10' }),
        ],
      }),
      count: 5,
    });
    expect(short).toHaveLength(2);
  });

  it('CA-4 évalue « hier » sur le calendrier local, pas sur 24 heures', () => {
    const dst = input({
      localDate: '2026-10-26',
      seenNotions: [
        notion('n-veille', { lastSeenOn: '2026-10-25' }),
        notion('n-avant-veille', { lastSeenOn: '2026-10-24' }),
      ],
    });
    const candidates = warmupCandidates(dst);
    expect(candidates.yesterdayOn).toBe('2026-10-25');
    expect(ids(candidates.yesterday)).toEqual(['n-veille']);
    expect(ids(selectWarmup(dst))).toEqual(['n-veille']);

    const spring = warmupCandidates({
      ...dst,
      localDate: '2026-03-30',
      seenNotions: [
        notion('n-veille', { lastSeenOn: '2026-03-29' }),
        notion('n-avant-veille', { lastSeenOn: '2026-03-28' }),
      ],
    });
    expect(spring.yesterdayOn).toBe('2026-03-29');
    expect(ids(spring.yesterday)).toEqual(['n-veille']);
  });

  it('CL-1 retourne seulement les candidates éligibles quand la banque est courte', () => {
    const choices = selectWarmup(
      input({
        seenNotions: [
          notion('n-a', { lastSeenOn: '2026-11-10' }),
          notion('n-b', { lastSeenOn: '2026-11-10' }),
        ],
        count: 5,
      }),
    );
    expect(choices).toHaveLength(2);
  });

  it('CL-2 retourne une liste vide sans notion de la veille en portée veille seulement', () => {
    const choices = selectWarmup(
      mixedInput({
        scope: 'yesterday',
        seenNotions: [
          notion('n-t', { chapterId: NEXT_CHAPTER }),
          notion('n-p1', { lastSeenOn: '2026-10-01' }),
        ],
        prerequisiteLinks: [link('n-p1', 'n-t')],
      }),
    );
    expect(choices).toEqual([]);
  });

  it('CL-3 exclut un prérequis jamais étudié malgré le lien', () => {
    const choices = selectWarmup(
      input({
        seenNotions: [notion('n-t', { chapterId: NEXT_CHAPTER })],
        prerequisiteLinks: [link('n-jamais-vue', 'n-t')],
      }),
    );
    expect(choices).toEqual([]);
    expect(
      warmupCandidates(
        input({
          seenNotions: [notion('n-t', { chapterId: NEXT_CHAPTER })],
          prerequisiteLinks: [link('n-jamais-vue', 'n-t')],
        }),
      ).prerequisites,
    ).toEqual([]);
  });

  it('CL-4 déduplique une notion présente dans les deux ensembles avec la raison hier', () => {
    const choices = selectWarmup(
      input({
        seenNotions: [
          notion('n-t', { chapterId: NEXT_CHAPTER }),
          notion('n-double', { lastSeenOn: '2026-11-10', mastery: 20 }),
          notion('n-autre', { lastSeenOn: '2026-11-10', mastery: 80 }),
        ],
        prerequisiteLinks: [link('n-double', 'n-t')],
        count: 2,
      }),
    );
    expect(choices).toHaveLength(2);
    expect(ids(choices).filter((notionId) => notionId === 'n-double')).toHaveLength(1);
    expect(choices[0]).toEqual({ notionId: 'n-double', reason: 'yesterday' });
    expect(choices[1]).toEqual({ notionId: 'n-autre', reason: 'yesterday' });
  });

  it('CL-5 borne la veille à sept jours et suit le jour d’étude le plus récent', () => {
    const exactlySeven = warmupCandidates(
      input({ seenNotions: [notion('n-a', { lastSeenOn: '2026-11-04' })] }),
    );
    expect(exactlySeven.yesterdayOn).toBe('2026-11-04');
    expect(ids(exactlySeven.yesterday)).toEqual(['n-a']);

    const tooOld = warmupCandidates(
      input({ seenNotions: [notion('n-a', { lastSeenOn: '2026-11-03' })] }),
    );
    expect(tooOld.yesterdayOn).toBeNull();
    expect(tooOld.yesterday).toEqual([]);

    const latestActive = warmupCandidates(
      input({
        seenNotions: [
          notion('n-suspendue', { lastSeenOn: '2026-11-10', suspended: true }),
          notion('n-active', { lastSeenOn: '2026-11-09' }),
        ],
      }),
    );
    expect(latestActive.yesterdayOn).toBe('2026-11-09');
    expect(ids(latestActive.yesterday)).toEqual(['n-active']);
  });

  it('lit les liens prérequis dans le sens from → to, sur un seul niveau', () => {
    const choices = selectWarmup(
      input({
        seenNotions: [
          notion('n-cible', { chapterId: NEXT_CHAPTER }),
          notion('n-origine', { lastSeenOn: '2026-11-01', mastery: 10 }),
          notion('n-ancienne', { lastSeenOn: '2026-11-01', mastery: 5 }),
          notion('n-ailleurs', { chapterId: 'sap-m1-c1', lastSeenOn: '2026-11-01' }),
          notion('n-autre-cible', { chapterId: 'sap-m1-c1' }),
        ],
        prerequisiteLinks: [
          link('n-origine', 'n-cible'),
          link('n-ancienne', 'n-origine'),
          link('n-ailleurs', 'n-autre-cible'),
          link('n-origine', 'n-cible', 'confusion'),
        ],
      }),
    );
    expect(choices).toEqual([{ notionId: 'n-origine', reason: 'prerequisite' }]);
  });

  it('exclut une origine appartenant elle-même au chapitre à venir', () => {
    const candidates = warmupCandidates(
      input({
        seenNotions: [
          notion('n-cible', { chapterId: NEXT_CHAPTER }),
          notion('n-meme-chapitre', { chapterId: NEXT_CHAPTER, lastSeenOn: '2026-11-01' }),
        ],
        prerequisiteLinks: [link('n-meme-chapitre', 'n-cible')],
      }),
    );
    expect(candidates.prerequisites).toEqual([]);
  });

  it('classe les candidates par rétrievabilité croissante puis maîtrise puis identifiant', () => {
    const candidates = warmupCandidates(
      input({
        seenNotions: [
          notion('n-z', { lastSeenOn: '2026-11-10', mastery: 10, retrievability: 0.2 }),
          notion('n-a', { lastSeenOn: '2026-11-10', mastery: 20, retrievability: 0.2 }),
          notion('n-b', { lastSeenOn: '2026-11-10', mastery: 10, retrievability: 0.1 }),
          notion('n-c', { lastSeenOn: '2026-11-10', mastery: 0, retrievability: null }),
        ],
      }),
    );
    expect(ids(candidates.yesterday)).toEqual(['n-b', 'n-z', 'n-a', 'n-c']);
  });

  it('refuse les entrées incohérentes et les tailles hors catalogue', () => {
    const duplicate = engineError(() =>
      selectWarmup(
        input({
          seenNotions: [
            notion('n-a', { lastSeenOn: '2026-11-10' }),
            notion('n-a', { lastSeenOn: '2026-11-09' }),
          ],
        }),
      ),
    );
    expect(duplicate.code).toBe('INVALID_INPUT');
    expect(duplicate.details?.path).toBe('seenNotions.1.notionId');

    const future = engineError(() =>
      selectWarmup(input({ seenNotions: [notion('n-a', { lastSeenOn: '2026-11-12' })] })),
    );
    expect(future.code).toBe('INVALID_INPUT');
    expect(future.details?.path).toBe('seenNotions.0.lastSeenOn');

    const inaccessibleChapter = engineError(() =>
      selectWarmup(input({ nextChapterId: 'sap-m4-c1' })),
    );
    expect(inaccessibleChapter.code).toBe('INVALID_INPUT');
    expect(inaccessibleChapter.details?.path).toBe('nextChapterId');

    const badCount = engineError(() => selectWarmup(mixedInput({ count: 4 })));
    expect(badCount.code).toBe('INVALID_PARAM');
    expect(badCount.details?.path).toBe('count');

    const badScope = engineError(() => selectWarmup(mixedInput({ scope: 'tout' as WarmupScope })));
    expect(badScope.code).toBe('INVALID_INPUT');

    const badParams = engineError(() =>
      selectWarmup(mixedInput({ params: { ...DEFAULT_WARMUP_PARAMS, defaultCount: 4 } })),
    );
    expect(badParams.code).toBe('INVALID_PARAM');
    expect(badParams.details?.path).toBe('defaultCount');

    const duplicateParams = engineError(() =>
      selectWarmup(
        mixedInput({
          params: { ...DEFAULT_WARMUP_PARAMS, allowedCounts: [2, 2, 5] },
        }),
      ),
    );
    expect(duplicateParams.code).toBe('INVALID_PARAM');
    expect(duplicateParams.details?.path).toBe('allowedCounts');
  });

  it('applique le défaut de portée et de taille du catalogue', () => {
    expect(DEFAULT_WARMUP_PARAMS).toEqual({
      defaultCount: 3,
      allowedCounts: [2, 3, 5],
      defaultScope: 'yesterday_and_prerequisites',
      lookbackDays: 7,
    });
    const choices = selectWarmup(mixedInput());
    expect(choices).toHaveLength(3);
    expect(choices[0]).toEqual({ notionId: 'n-p1', reason: 'prerequisite' });
  });

  it('ne mute jamais les entrées et accepte une seed vide', () => {
    const base = mixedInput({ seed: '' });
    const frozen = JSON.stringify(base);
    const first = selectWarmup(base);
    expect(JSON.stringify(base)).toBe(frozen);
    expect(selectWarmup(base)).toEqual(first);
    expect(warmupCandidates(base)).toEqual(warmupCandidates(base));
  });

  it('propriétés : bornes, unicité, éligibilité et déterminisme', () => {
    const notionId = fc.stringMatching(/^n-[a-z0-9]{1,4}$/u);
    const day = fc.oneof(
      fc.constant(null),
      fc.constantFrom<IsoDate>(
        '2026-11-10',
        '2026-11-09',
        '2026-11-04',
        '2026-11-03',
        '2026-10-01',
      ),
    );
    const notionArbitrary = fc
      .tuple(
        notionId,
        fc.constantFrom('sap-m1-c1', NEXT_CHAPTER, 'sap-m4-c1'),
        fc.constantFrom(FORMATION, 'autre'),
        day,
        fc.boolean(),
        fc.integer({ min: 0, max: 10_000 }).map((value) => value / 100),
        fc.oneof(
          fc.constant(null),
          fc.integer({ min: 0, max: 100 }).map((value) => value / 100),
        ),
      )
      .map(([id, chapterId, formationId, lastSeenOn, suspended, mastery, retrievability]) =>
        notion(id, { chapterId, formationId, lastSeenOn, suspended, mastery, retrievability }),
      );
    const inputArbitrary = fc
      .record({
        seenNotions: fc.uniqueArray(notionArbitrary, { maxLength: 8, selector: (n) => n.notionId }),
        count: fc.constantFrom(2, 3, 5),
        scope: fc.constantFrom<WarmupScope>('yesterday_and_prerequisites', 'yesterday'),
        seed: fc.constantFrom('', SEED, 'autre'),
      })
      .map(({ seenNotions, count, scope, seed }) => {
        const target = seenNotions.find((item) => item.chapterId === NEXT_CHAPTER);
        const origin = seenNotions.find((item) => item.chapterId !== NEXT_CHAPTER);
        return input({
          seenNotions,
          count,
          scope,
          seed,
          prerequisiteLinks:
            target !== undefined && origin !== undefined
              ? [link(origin.notionId, target.notionId)]
              : [],
        });
      });

    fc.assert(
      fc.property(inputArbitrary, (value) => {
        const choices = selectWarmup(value);
        expect(choices.length).toBeLessThanOrEqual(value.count ?? 3);
        expect(new Set(ids(choices)).size).toBe(choices.length);
        const candidates = warmupCandidates(value);
        const eligible = new Set([...ids(candidates.yesterday), ...ids(candidates.prerequisites)]);
        for (const choice of choices) {
          expect(eligible.has(choice.notionId)).toBe(true);
          expect(['yesterday', 'prerequisite']).toContain(choice.reason);
        }
        const reversed = { ...value, seenNotions: [...value.seenNotions].reverse() };
        expect(selectWarmup(reversed)).toEqual(choices);
        expect(warmupCandidates(reversed)).toEqual(candidates);
      }),
      FAST_CHECK,
    );
  });
});
