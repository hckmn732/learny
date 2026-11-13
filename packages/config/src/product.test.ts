import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  AI_MODEL_IDS,
  AI_TASKS,
  DEFAULT_MODEL_BY_TASK,
  THINKING_EFFORT_BY_TASK,
  WEB_SEARCH_TASKS,
} from './models';
import {
  BATCH_DISCOUNT_RATIO,
  CACHE_READ_RATIO,
  CACHE_WRITE_RATIO,
  MODEL_PRICING,
  PRICE_UNIT,
  modelPrices,
} from './pricing';
import {
  ACCOUNT_RULES,
  AI_RULES,
  AUTOMATION_DEFAULTS,
  ENGINE,
  FORMATION_RULES,
  GROUP_RULES,
  MEMORY_RULES,
  NOTIFICATION_RULES,
  QUIZ_RULES,
  RESOURCE_RULES,
} from './product';

const RULES = {
  ACCOUNT: ACCOUNT_RULES,
  AI: AI_RULES,
  RESOURCE: RESOURCE_RULES,
  QUIZ: QUIZ_RULES,
  MEMORY: MEMORY_RULES,
  NOTIFICATION: NOTIFICATION_RULES,
  FORMATION: FORMATION_RULES,
  GROUP: GROUP_RULES,
} as const;

const BUSINESS_RULES = fs.readFileSync(
  new URL('../../../docs/product/business-rules.md', import.meta.url),
  'utf8',
);
const AI_DOC = fs.readFileSync(
  new URL('../../../docs/architecture/ai.md', import.meta.url),
  'utf8',
);
const PRICING_ADR = fs.readFileSync(
  new URL('../../../docs/adr/ADR-0073-tarifs-de-l-ia-en-configuration.md', import.meta.url),
  'utf8',
);

interface Mirror {
  readonly path: string;
  readonly br: string;
  readonly value: unknown;
  /** Excerpt that must appear in the normative row of docs/product/business-rules.md. */
  readonly text: string;
}

function valueAt(path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    if (node === null || typeof node !== 'object') return undefined;
    return (node as Record<string, unknown>)[key];
  }, RULES);
}

function ruleRow(id: string): string {
  const row = BUSINESS_RULES.split('\n').find((line) => line.startsWith(`| ${id} |`));
  if (row === undefined) throw new Error(`règle ${id} absente de docs/product/business-rules.md`);
  return row;
}

// One line per exported constant: the value, its rule and the sentence that states it (EF-5).
const MIRROR: readonly Mirror[] = [
  { path: 'ACCOUNT.magicLinkTtlMinutes', br: 'BR-ACC-01', value: 60, text: 'valable 1 heure' },
  { path: 'ACCOUNT.passwordMinLength', br: 'BR-ACC-01', value: 12, text: '12 caractères minimum' },
  { path: 'ACCOUNT.verificationResendSeconds', br: 'BR-ACC-03', value: 60, text: '60 secondes' },
  { path: 'ACCOUNT.defaultTone', br: 'BR-ACC-05', value: 'vous', text: 'vouvoiement' },
  {
    path: 'ACCOUNT.courseLanguages',
    br: 'BR-ACC-06',
    value: ['fr', 'en', 'es', 'de'],
    text: 'fr, en, es, de',
  },
  { path: 'ACCOUNT.defaultCourseLanguage', br: 'BR-ACC-06', value: 'fr', text: 'défaut fr' },
  { path: 'ACCOUNT.defaultTimeZone', br: 'BR-ACC-07', value: 'Europe/Paris', text: 'Europe/Paris' },
  { path: 'AI.dailyCapUsd', br: 'BR-IA-07', value: 1.5, text: '1,50 USD par jour' },
  { path: 'AI.alertThresholdPercent', br: 'BR-IA-07', value: 80, text: 'Alerte in-app à 80 %' },
  { path: 'ACCOUNT.studyHoursPerDay.min', br: 'BR-ACC-08', value: 1, text: 'entier 1 à 6' },
  { path: 'ACCOUNT.studyHoursPerDay.max', br: 'BR-ACC-08', value: 6, text: 'entier 1 à 6' },
  { path: 'ACCOUNT.studyHoursPerDay.default', br: 'BR-ACC-08', value: 2, text: 'défaut 2' },
  {
    path: 'ACCOUNT.defaultStudyDays',
    br: 'BR-ACC-08',
    value: [1, 2, 3, 4, 5],
    text: 'lundi à vendredi',
  },
  {
    path: 'ACCOUNT.studyMoments.0.start',
    br: 'BR-ACC-08',
    value: '08:00',
    text: 'matin 08:00-12:00',
  },
  {
    path: 'ACCOUNT.studyMoments.0.end',
    br: 'BR-ACC-08',
    value: '12:00',
    text: 'matin 08:00-12:00',
  },
  {
    path: 'ACCOUNT.studyMoments.1.start',
    br: 'BR-ACC-08',
    value: '13:00',
    text: 'après-midi 13:00-18:00',
  },
  {
    path: 'ACCOUNT.studyMoments.1.end',
    br: 'BR-ACC-08',
    value: '18:00',
    text: 'après-midi 13:00-18:00',
  },
  {
    path: 'ACCOUNT.studyMoments.2.start',
    br: 'BR-ACC-08',
    value: '18:00',
    text: 'soir 18:00-22:00',
  },
  { path: 'ACCOUNT.studyMoments.2.end', br: 'BR-ACC-08', value: '22:00', text: 'soir 18:00-22:00' },
  { path: 'ACCOUNT.defaultStudyMoment', br: 'BR-ACC-08', value: 'evening', text: 'défaut soir' },
  { path: 'ACCOUNT.exportReadyMinutes', br: 'BR-ACC-10', value: 15, text: 'moins de 15 minutes' },
  { path: 'ACCOUNT.exportLinkDays', br: 'BR-ACC-10', value: 7, text: '7 jours' },
  { path: 'ACCOUNT.accountDeletionDays', br: 'BR-ACC-11', value: 30, text: '30 jours' },
  { path: 'RESOURCE.pdfMaxMegabytes', br: 'BR-APP-02', value: 50, text: 'PDF ≤ 50 Mo' },
  { path: 'RESOURCE.pdfMaxPages', br: 'BR-APP-02', value: 500, text: '≤ 500 pages' },
  { path: 'RESOURCE.imageMaxMegabytes', br: 'BR-APP-02', value: 10, text: 'image ≤ 10 Mo' },
  {
    path: 'RESOURCE.noteMaxCharacters',
    br: 'BR-APP-02',
    value: 100_000,
    text: '≤ 100 000 caractères',
  },
  {
    path: 'RESOURCE.resourcesPerChapter',
    br: 'BR-APP-02',
    value: 100,
    text: '100 apports par chapitre',
  },
  { path: 'RESOURCE.storageMaxGigabytes', br: 'BR-APP-02', value: 2, text: '2 Go' },
  {
    path: 'QUIZ.defaultQuestionCount',
    br: 'BR-QUI-01',
    value: 12,
    text: '12 questions par défaut',
  },
  { path: 'QUIZ.minQuestionCount', br: 'BR-QUI-01', value: 10, text: '10 à 20' },
  { path: 'QUIZ.maxQuestionCount', br: 'BR-QUI-01', value: 20, text: '10 à 20' },
  { path: 'QUIZ.scoreScale', br: 'BR-QUI-01', value: 100, text: 'barème sur 100' },
  { path: 'QUIZ.retryDelayHours', br: 'BR-QUI-06', value: 24, text: '24 h par défaut' },
  { path: 'QUIZ.mockExam.questionCount', br: 'BR-PRA-02', value: 20, text: '20 questions' },
  {
    path: 'QUIZ.mockExam.minutesPerQuestion',
    br: 'BR-PRA-02',
    value: 2,
    text: '2 minutes par question',
  },
  { path: 'QUIZ.mockExam.thresholdPercent', br: 'BR-PRA-02', value: 70, text: 'seuil 70 %' },
  { path: 'MEMORY.retentionTargetPercent', br: 'BR-MEM-01', value: 90, text: '90 % par défaut' },
  { path: 'MEMORY.retentionOptions', br: 'BR-MEM-01', value: [85, 90, 95], text: '85/90/95' },
  { path: 'MEMORY.dailyReviewMaxMinutes', br: 'BR-AUT-07', value: 15, text: '15 min' },
  {
    path: 'MEMORY.dailyReviewOptions',
    br: 'BR-AUT-07',
    value: [10, 15, 20, 30],
    text: '10/15/20/30',
  },
  { path: 'MEMORY.minVariantsPerNotion', br: 'BR-MEM-07', value: 4, text: 'au moins 4 variantes' },
  {
    path: 'MEMORY.masteryThresholdPercent',
    br: 'BR-LAC-01',
    value: 80,
    text: 'Seuil de maîtrise : 80 %',
  },
  { path: 'MEMORY.masteryHalfLifeDays', br: 'BR-LAC-01', value: 14, text: 'âge en jours / 14' },
  {
    path: 'MEMORY.masteryClearedSuccesses',
    br: 'BR-LAC-06',
    value: 2,
    text: 'réussie au moins 2 fois',
  },
  {
    path: 'MEMORY.masteryClearedMinDays',
    br: 'BR-LAC-06',
    value: 1,
    text: "1 jour d'intervalle",
  },
  {
    path: 'NOTIFICATION.defaultEmailEnabled',
    br: 'BR-NOT-04',
    value: true,
    text: 'e-mail et navigateur activés',
  },
  {
    path: 'NOTIFICATION.defaultBrowserPushEnabled',
    br: 'BR-NOT-04',
    value: true,
    text: 'e-mail et navigateur activés',
  },
  { path: 'NOTIFICATION.dailyProgramHour', br: 'BR-NOT-04', value: '08:00', text: '08:00' },
  { path: 'NOTIFICATION.quietHours.start', br: 'BR-NOT-04', value: '21:00', text: '21:00-08:00' },
  { path: 'NOTIFICATION.quietHours.end', br: 'BR-NOT-04', value: '08:00', text: '21:00-08:00' },
  {
    path: 'NOTIFICATION.weekendRevisionsOnly',
    br: 'BR-NOT-04',
    value: true,
    text: 'Rien le week-end, sauf les révisions dues',
  },
  {
    path: 'NOTIFICATION.dailyExternalCap',
    br: 'BR-NOT-05',
    value: 5,
    text: '5 par jour par défaut',
  },
  {
    path: 'NOTIFICATION.dailyExternalCapOptions',
    br: 'BR-NOT-05',
    value: [3, 5, 8],
    text: '3, 5 ou 8',
  },
  {
    path: 'NOTIFICATION.validationQuizReminderMinutes',
    br: 'BR-NOT-07',
    value: 40,
    text: '40 minutes',
  },
  { path: 'FORMATION.maxFramingQuestions', br: 'BR-FOR-01', value: 5, text: 'au plus 5 questions' },
  { path: 'FORMATION.goalMaxCharacters', br: 'BR-FOR-01', value: 120, text: '1 à 120 caractères' },
  {
    path: 'FORMATION.moduleThresholdPercent.default',
    br: 'BR-FOR-06',
    value: 80,
    text: '80 % par défaut',
  },
  {
    path: 'FORMATION.moduleThresholdPercent.min',
    br: 'BR-FOR-06',
    value: 60,
    text: 'entre 60 % et 95 %',
  },
  {
    path: 'FORMATION.moduleThresholdPercent.max',
    br: 'BR-FOR-06',
    value: 95,
    text: 'entre 60 % et 95 %',
  },
  {
    path: 'FORMATION.maxActiveFormations',
    br: 'BR-FOR-10',
    value: 3,
    text: 'Trois formations actives au plus',
  },
  {
    path: 'FORMATION.milestones.retainedNotions',
    br: 'BR-GAM-03',
    value: 100,
    text: '100 notions retenues',
  },
  {
    path: 'FORMATION.milestones.streakDays',
    br: 'BR-GAM-03',
    value: 30,
    text: '30 jours de série',
  },
  { path: 'GROUP.maxMembers', br: 'BR-GRP-01', value: 10, text: '10 membres au plus' },
  { path: 'GROUP.invitationCodePattern', br: 'BR-GRP-01', value: 'LRN-XXXX', text: 'LRN-XXXX' },
];

describe('[SPEC-009] product', () => {
  it('mirrors every normative value of business-rules.md (EF-5, CA-4)', () => {
    expect(MIRROR.length).toBeGreaterThanOrEqual(60);
    for (const entry of MIRROR) {
      expect(valueAt(entry.path), `valeur ${entry.path}`).toEqual(entry.value);
      expect(ruleRow(entry.br), `règle ${entry.br} (${entry.path})`).toContain(entry.text);
    }
  });

  it('covers the seven families required by EF-5', () => {
    expect(Object.keys(RULES)).toEqual([
      'ACCOUNT',
      'AI',
      'RESOURCE',
      'QUIZ',
      'MEMORY',
      'NOTIFICATION',
      'FORMATION',
      'GROUP',
    ]);
    for (const family of Object.keys(RULES)) {
      expect(
        MIRROR.filter((entry) => entry.path.startsWith(`${family}.`)).length,
        family,
      ).toBeGreaterThan(0);
    }
  });

  it('keeps every documented rule identifier resolvable (EF-5)', () => {
    const ids = [...new Set(MIRROR.map((entry) => entry.br))];
    expect(ids.length).toBeGreaterThanOrEqual(20);
    for (const id of ids) expect(ruleRow(id)).toContain(id);
  });
});

describe('[SPEC-401] concordance ENGINE', () => {
  it.each([
    ['mastery.halfLifeDays', ENGINE.mastery.halfLifeDays, 14, 'BR-LAC-01'],
    ['mastery.threshold', ENGINE.mastery.threshold, 80, 'BR-LAC-01'],
    ['fsrs.requestRetention', ENGINE.fsrs.requestRetention, 0.9, 'BR-MEM-01'],
    ['fsrs.allowedRetentions', ENGINE.fsrs.allowedRetentions, [0.85, 0.9, 0.95], 'BR-MEM-01'],
    ['fsrs.hardFactor', ENGINE.fsrs.hardFactor, 2, 'BR-MEM-02'],
    ['fsrs.easyFactor', ENGINE.fsrs.easyFactor, 0.5, 'BR-MEM-02'],
    ['globalQuiz.maxMinutesDefault', ENGINE.globalQuiz.maxMinutesDefault, 15, 'BR-AUT-07'],
    [
      'globalQuiz.allowedMaxMinutes',
      ENGINE.globalQuiz.allowedMaxMinutes,
      [10, 15, 20, 30],
      'BR-AUT-07',
    ],
    ['globalQuiz.microMinutesDefault', ENGINE.globalQuiz.microMinutesDefault, 5, 'BR-AUT-02'],
    ['planner.sprintDaysBeforeDefault', ENGINE.planner.sprintDaysBeforeDefault, 3, 'BR-AUT-08'],
    ['planner.sprintMinutes', ENGINE.planner.sprintMinutes, 30, 'BR-AUT-08'],
    ['planner.bufferMinutes', ENGINE.planner.bufferMinutes, 60, 'BR-AGE-03'],
    ['planner.globalQuizMinutes', ENGINE.planner.globalQuizMinutes, 30, 'ADR-0029'],
    ['warmup.defaultCount', ENGINE.warmup.defaultCount, 3, 'BR-AUT-03'],
    ['warmup.allowedCounts', ENGINE.warmup.allowedCounts, [2, 3, 5], 'BR-AUT-03'],
    ['milestones.notionsRetained', ENGINE.milestones.notionsRetained, 100, 'BR-GAM-03'],
    ['milestones.streakDays', ENGINE.milestones.streakDays, 30, 'BR-GAM-03'],
    ['retention.horizonsDays', ENGINE.retention.horizonsDays, [30, 60], 'BR-MEM-06'],
    ['retention.toleranceDays', ENGINE.retention.toleranceDays, 3, 'BR-MEM-06'],
  ])('%s vaut %j (%s)', (_key, actual, expected, rule) => {
    expect(rule.length).toBeGreaterThan(0);
    expect(actual).toEqual(expected);
  });

  it('references the existing product constants instead of duplicating them', () => {
    expect(ENGINE.mastery.halfLifeDays).toBe(MEMORY_RULES.masteryHalfLifeDays);
    expect(ENGINE.mastery.threshold).toBe(MEMORY_RULES.masteryThresholdPercent);
    expect(ENGINE.fsrs.requestRetention).toBe(MEMORY_RULES.retentionTargetPercent / 100);
    expect(ENGINE.globalQuiz.maxMinutesDefault).toBe(MEMORY_RULES.dailyReviewMaxMinutes);
    expect(ENGINE.globalQuiz.allowedMaxMinutes).toBe(MEMORY_RULES.dailyReviewOptions);
    expect(ENGINE.globalQuiz.microMinutesDefault).toBe(
      AUTOMATION_DEFAULTS.micro_seance.durationMin,
    );
    expect(ENGINE.planner.sprintMinutes).toBe(AUTOMATION_DEFAULTS.sprint.durationMin);
    expect(ENGINE.planner.sprintDaysBeforeDefault).toBe(AUTOMATION_DEFAULTS.sprint.daysBefore);
    expect(ENGINE.milestones.notionsRetained).toBe(FORMATION_RULES.milestones.retainedNotions);
    expect(ENGINE.milestones.streakDays).toBe(FORMATION_RULES.milestones.streakDays);
    expect(ENGINE.warmup.defaultCount).toBe(AUTOMATION_DEFAULTS.echauffement.questionCount);
    expect(ENGINE.gaps.clearSuccesses).toBe(MEMORY_RULES.masteryClearedSuccesses);
    expect(ENGINE.gaps.clearMinDaysApart).toBe(MEMORY_RULES.masteryClearedMinDays);
    // BR-QUI-06's 24-hour retry delay is a quiz rule, not an engine parameter.
    expect(QUIZ_RULES.retryDelayHours).toBe(24);
  });
});

describe('[SPEC-009] models', () => {
  function aiRow(task: string): string {
    const row = AI_DOC.split('\n').find((line) => line.startsWith(`| \`${task}\``));
    if (row === undefined) throw new Error(`tâche ${task} absente de docs/architecture/ai.md`);
    return row;
  }

  it('maps each task to the provided model of BR-IA-01 (EF-6, CA-4)', () => {
    expect(Object.keys(DEFAULT_MODEL_BY_TASK)).toEqual([...AI_TASKS]);
    for (const task of AI_TASKS) {
      const model = DEFAULT_MODEL_BY_TASK[task];
      expect(aiRow(task), task).toContain(`\`${model}\``);
      expect(ruleRow('BR-IA-01'), task).toContain(`\`${model}\``);
    }
    expect(Object.values(AI_MODEL_IDS)).toHaveLength(3);
  });

  it('records the thinking effort of each task (EF-6)', () => {
    const labels = { high: 'élevé', medium: 'moyen', low: 'faible', none: 'aucun' } as const;
    for (const task of AI_TASKS) {
      expect(aiRow(task), task).toContain(`| ${labels[THINKING_EFFORT_BY_TASK[task]]} |`);
    }
  });

  it('restricts web search to programme design (BR-IA-12)', () => {
    expect(WEB_SEARCH_TASKS).toEqual(['programme']);
    expect(ruleRow('BR-IA-12')).toContain('concevoir le programme');
  });
});

describe('[SPEC-009] pricing', () => {
  it('exposes the ADR-0073 prices per million tokens (EF-6, CA-4)', () => {
    expect(PRICE_UNIT).toBe('USD_PER_MILLION_TOKENS');
    expect(MODEL_PRICING[AI_MODEL_IDS.opus]).toEqual({ input: 4, output: 20 });
    expect(MODEL_PRICING[AI_MODEL_IDS.sonnet]).toEqual({ input: 2, output: 10 });
    expect(MODEL_PRICING[AI_MODEL_IDS.haiku]).toEqual({ input: 0.1, output: 0.5 });
    expect(PRICING_ADR).toContain('4/20');
    expect(PRICING_ADR).toContain('2/10');
    expect(PRICING_ADR).toContain('0,10/0,50');
  });

  it('derives cache and batch prices from ADR-0073 ratios (EF-6)', () => {
    expect(CACHE_READ_RATIO).toBe(0.05);
    expect(CACHE_WRITE_RATIO).toBe(1.25);
    expect(BATCH_DISCOUNT_RATIO).toBe(0.5);
    expect(PRICING_ADR).toContain('5 %');
    expect(PRICING_ADR).toContain('50 %');
    expect(modelPrices(AI_MODEL_IDS.opus)).toEqual({
      input: 4,
      output: 20,
      cacheRead: 0.2,
      cacheWrite: 5,
      batchInput: 2,
      batchOutput: 10,
    });
    expect(modelPrices(AI_MODEL_IDS.haiku)).toEqual({
      input: 0.1,
      output: 0.5,
      cacheRead: 0.005,
      cacheWrite: 0.125,
      batchInput: 0.05,
      batchOutput: 0.25,
    });
  });

  it('never depends on a network call to be read (EF-6)', () => {
    // Pure data: computing every price must not throw nor wait for a provider.
    for (const model of Object.values(AI_MODEL_IDS)) {
      expect(modelPrices(model).input).toBeGreaterThan(0);
    }
  });
});
