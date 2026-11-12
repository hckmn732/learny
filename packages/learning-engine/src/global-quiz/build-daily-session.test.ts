import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ENGINE } from '@learny/config/product';
import { REFERENCE_NOW } from '@learny/testing/clock';

import { EngineError } from '../errors';
import type { BrickFormat, GapNature, ModuleStatus } from '../types';

import { buildDailySession } from './build-daily-session';
import { interleaveByModule } from './interleave';
import type {
  BuildDailySessionInput,
  DailySession,
  GlobalQuizBank,
  GlobalQuizDueNotion,
  GlobalQuizGap,
  GlobalQuizLastFormat,
} from './types';

const DATE = '2026-11-11';
const PARAMS = ENGINE.globalQuiz;
const FORMAT_LABELS: Readonly<Record<BrickFormat, string>> = {
  choice_question: 'choix',
  open_question: 'ouverte',
  cloze: 'trous',
  matching: 'association',
  ordering: 'ordre',
  categorization: 'classement',
  recall_card: 'carte',
  instruction: 'consigne',
  scripted_dialogue: 'dialogue',
  timer: 'minuteur',
};

function notion(
  notionId: string,
  moduleId: string,
  modulePosition: number,
  overrides: Partial<GlobalQuizDueNotion> = {},
): GlobalQuizDueNotion {
  return {
    notionId,
    moduleId,
    modulePosition,
    moduleStatus: 'validated',
    evaluated: true,
    dueAt: REFERENCE_NOW,
    ...overrides,
  };
}

function gap(notionId: string, nature: GapNature): GlobalQuizGap {
  return { notionId, nature };
}

function bank(notionId: string, formats: readonly BrickFormat[]): GlobalQuizBank {
  return { notionId, formats };
}

function last(notionId: string, format: BrickFormat): GlobalQuizLastFormat {
  return { notionId, format };
}

function input(overrides: Partial<BuildDailySessionInput> = {}): BuildDailySessionInput {
  return {
    formationId: 'sap',
    date: DATE,
    dueNotions: [],
    gaps: [],
    bank: [],
    lastFormats: [],
    capMinutes: 10,
    mode: 'full',
    seed: 'seed-406',
    params: PARAMS,
    ...overrides,
  };
}

function session(overrides: Partial<BuildDailySessionInput> = {}): DailySession {
  return buildDailySession(input(overrides));
}

function ids(sessionValue: DailySession): string[] {
  return sessionValue.items.map((item) => item.notionId);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function formatOf(result: DailySession, notionId: string): string {
  const item = result.items.find((candidate) => candidate.notionId === notionId);
  if (item === undefined) throw new Error(`notion absente : ${notionId}`);
  return FORMAT_LABELS[item.format];
}

describe('[SPEC-406] Tirage de la session de quiz global', () => {
  it('place les lacunes en tête et entrelace trois modules (CA-1, EF-1)', () => {
    const result = session({
      dueNotions: [
        notion('a', 'm1', 1),
        notion('b', 'm1', 1),
        notion('c', 'm2', 2),
        notion('d', 'm2', 2),
        notion('e', 'm3', 3),
        notion('f', 'm3', 3),
      ],
      gaps: [gap('a', 'confusion'), gap('c', 'forgetting')],
      bank: [
        bank('a', ['choice_question', 'matching', 'categorization']),
        bank('b', ['choice_question', 'cloze']),
        bank('c', ['choice_question', 'recall_card']),
        bank('d', ['choice_question', 'cloze']),
        bank('e', ['choice_question', 'cloze']),
        bank('f', ['choice_question', 'cloze']),
      ],
      lastFormats: [last('a', 'matching'), last('b', 'choice_question')],
    });

    expect(ids(result)).toEqual(['a', 'c', 'b', 'd', 'e', 'f']);
    expect(result.items.slice(0, 2).map((item) => item.gapNature)).toEqual([
      'confusion',
      'forgetting',
    ]);
    expect(result.items.slice(2).every((item) => item.gapNature === null)).toBe(true);
    // No two adjacent items share a module while another module is still available.
    const remaining = result.items.map((item) => item.moduleId);
    let previous: string | null = null;
    while (remaining.length > 0) {
      const index = remaining.findIndex((moduleId) => moduleId !== previous);
      const [moduleId] = remaining.splice(index === -1 ? 0 : index, 1);
      if (moduleId === undefined) break;
      if (index !== -1) expect(moduleId).not.toBe(previous);
      previous = moduleId;
    }
  });

  it('respecte le plafond, reporte les notions non jouées et ne modifie rien (CA-2, EF-2)', () => {
    const frozen = deepFreeze(
      input({
        capMinutes: 2,
        dueNotions: [notion('a', 'm1', 1), notion('b', 'm1', 1), notion('c', 'm2', 2)],
        gaps: [gap('a', 'confusion')],
        bank: [bank('a', ['matching']), bank('b', ['cloze']), bank('c', ['recall_card'])],
      }),
    );
    const before = structuredClone(frozen);
    const result = buildDailySession(frozen);

    expect(result.estimatedMinutes).toBeLessThanOrEqual(2);
    expect(ids(result)).toEqual(['a']);
    expect(result.deferred.map((entry) => entry.notionId).sort()).toEqual(['b', 'c']);
    for (const entry of result.deferred) {
      expect(entry.reason).toBe('cap');
      expect(entry.proposedFor).toBe('2026-11-12');
    }
    expect(frozen).toEqual(before);
  });

  it('varie le format, impose la nature de la lacune et applique la préférence (CA-3, EF-3)', () => {
    const result = session({
      dueNotions: [
        notion('x', 'm1', 1),
        notion('y', 'm1', 1),
        notion('z', 'm2', 2),
        notion('w', 'm2', 2),
      ],
      gaps: [gap('y', 'forgetting'), gap('w', 'confusion')],
      bank: [
        bank('x', ['choice_question', 'cloze']),
        bank('y', ['choice_question', 'recall_card']),
        bank('z', ['choice_question', 'recall_card']),
        bank('w', ['choice_question', 'matching', 'categorization']),
      ],
      lastFormats: [
        last('x', 'choice_question'),
        last('y', 'choice_question'),
        last('z', 'cloze'),
        last('w', 'matching'),
      ],
      preference: 'cards',
    });

    expect(formatOf(result, 'x')).toBe('trous');
    expect(formatOf(result, 'y')).toBe('carte');
    expect(formatOf(result, 'z')).toBe('carte');
    expect(formatOf(result, 'w')).toBe('classement');
    expect(result.items.find((item) => item.notionId === 'x')?.formatReason).toBe('varied');
    expect(result.items.find((item) => item.notionId === 'y')?.formatReason).toBe('gap_nature');
    expect(result.items.find((item) => item.notionId === 'z')?.formatReason).toBe('preference');
    expect(result.items.find((item) => item.notionId === 'w')?.formatReason).toBe('gap_nature');
  });

  it('signale le dernier format seul disponible comme contrainte de banque (CL-4)', () => {
    const result = session({
      dueNotions: [notion('a', 'm1', 1)],
      bank: [bank('a', ['recall_card'])],
      lastFormats: [last('a', 'recall_card')],
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.format).toBe('recall_card');
    expect(result.items[0]?.formatReason).toBe('bank_constraint');
    expect(result.items[0]?.variantRequested).toBe(true);
  });

  it('retourne une session vide et une durée nulle sans notion due (CL-1)', () => {
    const result = session();

    expect(result.items).toEqual([]);
    expect(result.deferred).toEqual([]);
    expect(result.exhausted).toEqual([]);
    expect(result.estimatedMinutes).toBe(0);
  });

  it('n’entrelace pas artificiellement un module unique (CL-2)', () => {
    const result = session({
      dueNotions: [notion('b', 'm1', 1), notion('a', 'm1', 1), notion('c', 'm1', 1)],
      bank: [
        bank('a', ['choice_question']),
        bank('b', ['choice_question']),
        bank('c', ['choice_question']),
      ],
    });

    expect(ids(result)).toEqual(['a', 'b', 'c']);
    expect(new Set(result.items.map((item) => item.moduleId))).toEqual(new Set(['m1']));
  });

  it('retourne une session vide quand le plafond est inférieur au premier item (CL-3)', () => {
    const result = session({
      capMinutes: 1,
      dueNotions: [notion('a', 'm1', 1), notion('b', 'm2', 2)],
      bank: [bank('a', ['choice_question']), bank('b', ['open_question'])],
    });

    expect(result.items).toEqual([]);
    expect(result.estimatedMinutes).toBe(0);
    expect(result.deferred.map((entry) => entry.notionId)).toEqual(['a', 'b']);
    expect(result.deferred.every((entry) => entry.reason === 'cap')).toBe(true);
  });

  it('exclut une notion du module courant jamais évaluée (CL-5)', () => {
    const result = session({
      dueNotions: [
        notion('seen', 'm1', 1),
        notion('never', 'm2', 2, {
          moduleStatus: 'open',
          evaluated: false,
        }),
      ],
      bank: [bank('seen', ['choice_question']), bank('never', ['choice_question'])],
    });

    expect(ids(result)).toEqual(['seen']);
    expect(result.deferred).toEqual([
      {
        notionId: 'never',
        moduleId: 'm2',
        dueAt: REFERENCE_NOW,
        reason: 'module_not_eligible',
        proposedFor: null,
      },
    ]);
  });

  it('déduplique notions, lacunes, banques et formats (ET-1)', () => {
    const result = session({
      dueNotions: [
        notion('a', 'm2', 2, { moduleStatus: 'open', evaluated: false }),
        notion('a', 'm1', 1),
        notion('a', 'm1', 1, { dueAt: '2026-11-10T12:20:00.000Z' }),
      ],
      gaps: [gap('a', 'forgetting'), gap('a', 'misunderstanding')],
      bank: [
        bank('a', ['choice_question', 'choice_question']),
        bank('a', ['cloze', 'choice_question']),
      ],
      lastFormats: [last('a', 'choice_question'), last('a', 'cloze')],
    });

    expect(result.items).toHaveLength(1);
    expect(result.deferred).toEqual([]);
    expect(result.exhausted).toEqual([]);
    expect(result.items[0]?.notionId).toBe('a');
    expect(result.items[0]?.moduleId).toBe('m1');
    expect(result.items[0]?.gapNature).toBe('misunderstanding');
    expect(result.items[0]?.format).toBe('cloze');
  });

  it('est déterministe et invariant à l’ordre des entrées (EF-5)', () => {
    const dueNotions = [
      notion('a', 'm1', 1),
      notion('b', 'm2', 2),
      notion('c', 'm1', 1),
      notion('d', 'm3', 3),
    ];
    const banks = [
      bank('a', ['choice_question', 'cloze']),
      bank('b', ['recall_card', 'choice_question']),
      bank('c', ['matching', 'categorization']),
      bank('d', ['open_question', 'cloze']),
    ];
    const base = input({
      dueNotions,
      bank: banks,
      lastFormats: [last('a', 'choice_question'), last('b', 'recall_card')],
    });
    const first = buildDailySession(base);
    const again = buildDailySession(structuredClone(base));
    const reversed = buildDailySession(
      input({
        dueNotions: [...dueNotions].reverse(),
        bank: [...banks].reverse(),
        lastFormats: [last('b', 'recall_card'), last('a', 'choice_question')],
      }),
    );
    const frozen = structuredClone(base);
    expect(buildDailySession(base)).toEqual(first);
    expect(buildDailySession(frozen)).toEqual(first);
    expect(again).toEqual(first);
    expect(reversed).toEqual(first);
  });

  it('estime la durée avec l’overhead et le format, sans dépasser le plafond (CA-2)', () => {
    const result = session({
      capMinutes: 3,
      dueNotions: [notion('a', 'm1', 1), notion('b', 'm2', 2), notion('c', 'm3', 3)],
      bank: [
        bank('a', ['recall_card']),
        bank('b', ['choice_question']),
        bank('c', ['open_question']),
      ],
    });

    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.estimatedSeconds)).toEqual([30, 45]);
    expect(result.estimatedMinutes).toBe(3);
    expect(result.estimatedMinutes).toBeLessThanOrEqual(result.capMinutes);
    expect(result.deferred.map((entry) => entry.notionId)).toEqual(['c']);
  });

  it('signale un format imposé indisponible pour SPEC-513 (ET-3)', () => {
    const result = session({
      dueNotions: [notion('a', 'm1', 1)],
      gaps: [gap('a', 'confusion')],
      bank: [bank('a', ['choice_question', 'cloze'])],
    });

    expect(result.items).toEqual([]);
    expect(result.deferred).toEqual([
      {
        notionId: 'a',
        moduleId: 'm1',
        dueAt: REFERENCE_NOW,
        reason: 'awaiting_variant',
        proposedFor: '2026-11-12',
      },
    ]);
    expect(result.exhausted).toEqual([
      {
        notionId: 'a',
        moduleId: 'm1',
        reason: 'imposed_format_unavailable',
        requiredFormats: ['matching', 'categorization'],
        availableFormats: ['choice_question', 'cloze'],
      },
    ]);
  });

  it('filtre les formats qui ne sont pas des jeux de quiz valides', () => {
    const result = session({
      dueNotions: [notion('a', 'm1', 1), notion('b', 'm1', 1)],
      bank: [bank('a', ['timer', 'instruction']), bank('b', ['choice_question'])],
    });

    expect(ids(result)).toEqual(['b']);
    expect(result.exhausted).toEqual([
      {
        notionId: 'a',
        moduleId: 'm1',
        reason: 'no_valid_format',
        requiredFormats: [],
        availableFormats: [],
      },
    ]);
  });

  it('mode entretien : plafond de cinq minutes et modules validés seulement (CA-4)', () => {
    const dueNotions = [
      notion('validated', 'm1', 1),
      notion('current', 'm2', 2, { moduleStatus: 'open', evaluated: true }),
      notion('never', 'm3', 3, { moduleStatus: 'open', evaluated: false }),
    ];
    const bankEntries = [
      bank('validated', ['choice_question']),
      bank('current', ['choice_question']),
      bank('never', ['choice_question']),
    ];
    const maintenance = session({
      capMinutes: 15,
      mode: 'maintenance',
      dueNotions,
      bank: bankEntries,
    });
    const again = session({
      capMinutes: 15,
      mode: 'maintenance',
      dueNotions: [...dueNotions].reverse(),
      bank: [...bankEntries].reverse(),
    });

    expect(maintenance.requestedCapMinutes).toBe(15);
    expect(maintenance.capMinutes).toBe(PARAMS.maintenanceMaxMinutes);
    expect(maintenance.estimatedMinutes).toBeLessThanOrEqual(5);
    expect(ids(maintenance)).toEqual(['validated']);
    expect(maintenance.deferred.map((entry) => [entry.notionId, entry.reason])).toEqual([
      ['current', 'maintenance_validated_only'],
      ['never', 'module_not_eligible'],
    ]);
    expect(again).toEqual(maintenance);
    for (const item of maintenance.items) {
      expect(dueNotions.map((entry) => entry.notionId)).toContain(item.notionId);
    }
  });

  it('mode micro : sous-ensemble court sans altérer les échéances non jouées', () => {
    const dueNotions = Array.from({ length: 6 }, (_value, index) =>
      notion(`n${String(index)}`, `m${String((index % 3) + 1)}`, (index % 3) + 1),
    );
    const frozen = deepFreeze(
      input({
        capMinutes: 2,
        mode: 'micro',
        dueNotions,
        bank: dueNotions.map((entry) => bank(entry.notionId, ['choice_question'])),
      }),
    );
    const before = structuredClone(frozen);
    const result = buildDailySession(frozen);

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.length).toBeLessThan(dueNotions.length);
    expect(result.estimatedMinutes).toBeLessThanOrEqual(2);
    expect(result.deferred).toHaveLength(dueNotions.length - result.items.length);
    expect(result.deferred.every((entry) => entry.reason === 'cap')).toBe(true);
    expect(frozen).toEqual(before);
  });

  it('refuse un plafond nul ou un mode inconnu à la frontière du moteur', () => {
    for (const run of [
      () => session({ capMinutes: 0 }),
      () =>
        session({
          mode: 'marathon' as BuildDailySessionInput['mode'],
        }),
    ]) {
      try {
        run();
        throw new Error('aucune EngineError levée');
      } catch (error) {
        expect(error).toBeInstanceOf(EngineError);
        expect((error as EngineError).code).toBe('INVALID_INPUT');
      }
    }
  });

  it('vérifie les bornes et l’unicité sur des entrées arbitraires (CA-2, EF-5)', () => {
    const format = fc.constantFrom<BrickFormat>(
      'choice_question',
      'open_question',
      'cloze',
      'matching',
      'ordering',
      'categorization',
      'recall_card',
    );
    const nature = fc.constantFrom<GapNature>(
      'forgetting',
      'confusion',
      'misunderstanding',
      'application',
    );
    const moduleStatus = fc.constantFrom<ModuleStatus>('validated', 'open');
    const generated = fc.record({
      ids: fc.uniqueArray(fc.integer({ min: 0, max: 20 }), { maxLength: 8 }),
      cap: fc.integer({ min: 1, max: 15 }),
      seed: fc.string({ maxLength: 12 }),
      natures: fc.array(fc.tuple(fc.integer({ min: 0, max: 20 }), nature), { maxLength: 8 }),
      statuses: fc.array(moduleStatus, { maxLength: 8 }),
      formats: fc.array(format, { minLength: 1, maxLength: 5 }),
    });

    fc.assert(
      fc.property(generated, (sample) => {
        const dueNotions = sample.ids.map((id, index) =>
          notion(`n${String(id)}`, `m${String((index % 3) + 1)}`, (index % 3) + 1, {
            moduleStatus: sample.statuses[index % sample.statuses.length] ?? 'validated',
            evaluated: true,
          }),
        );
        const bankEntries = sample.ids.map((id) => bank(`n${String(id)}`, sample.formats));
        const gaps = sample.natures
          .filter(([id]) => id <= 20)
          .map(([id, nature]) => gap(`n${String(id)}`, nature));
        const built = input({
          capMinutes: sample.cap,
          seed: sample.seed,
          dueNotions,
          bank: bankEntries,
          gaps,
        });
        const first = buildDailySession(built);
        expect(first.estimatedMinutes).toBeLessThanOrEqual(first.capMinutes);
        expect(new Set(ids(first)).size).toBe(first.items.length);
        const deferredIds = new Set(first.deferred.map((entry) => entry.notionId));
        for (const itemId of ids(first)) expect(deferredIds.has(itemId)).toBe(false);
        expect(buildDailySession(structuredClone(built))).toEqual(first);
      }),
      { numRuns: 60, seed: 20261111 },
    );
  });
});

describe('[SPEC-406] entrelacement par module', () => {
  it('insère un autre module dès que possible', () => {
    const items = [
      { id: 'a', moduleId: 'm1' },
      { id: 'b', moduleId: 'm1' },
      { id: 'c', moduleId: 'm2' },
    ];
    expect(interleaveByModule(items).map((item) => item.id)).toEqual(['a', 'c', 'b']);
  });

  it('laisse un module unique dans son ordre', () => {
    const items = [
      { id: 'a', moduleId: 'm1' },
      { id: 'b', moduleId: 'm1' },
    ];
    expect(interleaveByModule(items).map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('ne change pas une alternance déjà correcte et ne mute pas l’entrée', () => {
    const items = [
      { id: 'a', moduleId: 'm1' },
      { id: 'b', moduleId: 'm2' },
      { id: 'c', moduleId: 'm1' },
    ];
    const copy = structuredClone(items);
    expect(interleaveByModule(items).map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(items).toEqual(copy);
  });
});
