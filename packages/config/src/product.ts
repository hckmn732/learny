// Product constants: exact mirror of the normative values of docs/product/business-rules.md.
// Every constant carries its rule identifier; product.test.ts fails when a value, the rule or an ADR
// diverge (SPEC-009, EF-5, CA-4). No component, service or job hard-codes one of these values.
// See ADR-0226 for the environment side of the same configuration.

/** BR-ACC-* — account, profile and study rhythm. */
export const ACCOUNT_RULES = {
  /** BR-ACC-01 — magic link valid 1 hour, single use. */
  magicLinkTtlMinutes: 60,
  /** BR-ACC-01 — password: 12 characters minimum, no composition rule. */
  passwordMinLength: 12,
  /** BR-ACC-03 — a verification link is resent at most every 60 seconds. */
  verificationResendSeconds: 60,
  /** BR-ACC-05 — the tutor addresses the learner with « vous » by default. */
  defaultTone: 'vous',
  /** BR-ACC-06 — course languages, French by default; the interface stays French. */
  courseLanguages: ['fr', 'en', 'es', 'de'],
  defaultCourseLanguage: 'fr',
  /** BR-ACC-07 — default IANA time zone when the browser cannot provide one. */
  defaultTimeZone: 'Europe/Paris',
  /** BR-ACC-08 — study rhythm defaults and bounds. */
  studyHoursPerDay: { min: 1, max: 6, default: 2 },
  /** BR-ACC-08 — ISO weekdays: Monday to Friday. */
  defaultStudyDays: [1, 2, 3, 4, 5],
  /** BR-ACC-08 — preferred moments of the day and the default one. */
  studyMoments: [
    { id: 'morning', start: '08:00', end: '12:00' },
    { id: 'afternoon', start: '13:00', end: '18:00' },
    { id: 'evening', start: '18:00', end: '22:00' },
  ],
  defaultStudyMoment: 'evening',
  /** BR-ACC-10 — data export ready in less than 15 minutes, link valid 7 days. */
  exportReadyMinutes: 15,
  exportLinkDays: 7,
  /** BR-ACC-11 — account deletion effective after 30 days, cancellable until then. */
  accountDeletionDays: 30,
} as const;

/** BR-APP-* — contributions (documents, pages, videos, images, notes). */
export const RESOURCE_RULES = {
  /** BR-APP-02 — PDF at most 50 MB and 500 pages. */
  pdfMaxMegabytes: 50,
  pdfMaxPages: 500,
  /** BR-APP-02 — image at most 10 MB. */
  imageMaxMegabytes: 10,
  /** BR-APP-02 — note at most 100 000 characters. */
  noteMaxCharacters: 100_000,
  /** BR-APP-02 — 100 contributions per chapter, 2 GB of storage per learner. */
  resourcesPerChapter: 100,
  storageMaxGigabytes: 2,
} as const;

/** BR-QUI-*, BR-PRA-02 — validation quizzes and mock exams. */
export const QUIZ_RULES = {
  /** BR-QUI-01 — 12 questions by default, between 10 and 20, scored out of 100. */
  defaultQuestionCount: 12,
  minQuestionCount: 10,
  maxQuestionCount: 20,
  scoreScale: 100,
  /** BR-QUI-06 / BR-AUT-04 — a new attempt is available after 24 hours by default. */
  retryDelayHours: 24,
  /** BR-PRA-02 — default mock exam: 20 questions, 2 minutes each, pass mark 70 %. */
  mockExam: { questionCount: 20, minutesPerQuestion: 2, thresholdPercent: 70 },
} as const;

/** BR-MEM-*, BR-LAC-01, BR-LAC-06 — memory, spaced repetition and mastery. */
export const MEMORY_RULES = {
  /** BR-MEM-01 — target retention 90 % by default; 85/90/95 adjustable. */
  retentionTargetPercent: 90,
  retentionOptions: [85, 90, 95],
  /** BR-AUT-07 — daily review capped at 15 minutes by default; 10/15/20/30. */
  dailyReviewMaxMinutes: 15,
  dailyReviewOptions: [10, 15, 20, 30],
  /** BR-MEM-07 — at least 4 variants per notion and format. */
  minVariantsPerNotion: 4,
  /** BR-LAC-01 — mastery threshold 80 %, weight 0.5^(age in days / 14). */
  masteryThresholdPercent: 80,
  masteryHalfLifeDays: 14,
  /** BR-LAC-06 — a gap is cleared by 2 successes at least 1 day apart above the threshold. */
  masteryClearedSuccesses: 2,
  masteryClearedMinDays: 1,
} as const;

/** BR-NOT-* — notifications. */
export const NOTIFICATION_RULES = {
  /** BR-NOT-04 — e-mail and browser channels enabled, programme sent at 08:00. */
  defaultEmailEnabled: true,
  defaultBrowserPushEnabled: true,
  dailyProgramHour: '08:00',
  /** BR-NOT-04 — quiet hours 21:00-08:00. */
  quietHours: { start: '21:00', end: '08:00' },
  /** BR-NOT-04 — « Rien le week-end, sauf les révisions dues » is on by default. */
  weekendRevisionsOnly: true,
  /** BR-NOT-05 — at most 5 external notifications per day by default; 3, 5 or 8. */
  dailyExternalCap: 5,
  dailyExternalCapOptions: [3, 5, 8],
  /** BR-NOT-07 — reminder 40 minutes before a planned validation quiz. */
  validationQuizReminderMinutes: 40,
} as const;

/**
 * BR-AUT-01 to BR-AUT-10 — automation keys and their default `params` (SPEC-102 EF-6, ET-6).
 * The SQL mirror is `public.default_automation_params(text)`; `packages/db` compares both.
 */
export const AUTOMATION_KEYS = [
  'reprise',
  'micro_seance',
  'echauffement',
  'remediation',
  'jeu_lacune',
  'questions_cartes',
  'plafond_quiz',
  'sprint',
  'bilan',
  'pause',
] as const;

export type AutomationKey = (typeof AUTOMATION_KEYS)[number];

/** Admitted values of every automation parameter (SPEC-102 EF-6). */
export const AUTOMATION_OPTIONS = {
  reprise: {
    missedReplace: ['consent', 'auto'],
    inactiveDays: [1, 2, 3],
    lightenAfterDays: [4, 5, 7],
  },
  micro_seance: { hour: [19, 20, 21], durationMin: [3, 5, 10] },
  echauffement: {
    questionCount: [2, 3, 5],
    scope: ['yesterday_and_prerequisites', 'yesterday'],
  },
  remediation: { retryDelayHours: [0, 12, 24, 48], mode: ['advised', 'required'] },
  jeu_lacune: { preference: ['vary', 'cards', 'matching_categorization'] },
  questions_cartes: { mode: ['confirm', 'auto'] },
  plafond_quiz: { maxMinutes: [10, 15, 20, 30], targetRetention: [0.85, 0.9, 0.95] },
  sprint: { daysBefore: [2, 3, 5], durationMin: [30] },
  bilan: { weekday: [5, 6, 7], hour: [18, 19, 20], channel: ['app', 'app_email'] },
  pause: { diagnosticOnReturn: [true, false], diagnosticMinutes: [10] },
} as const satisfies Record<AutomationKey, Record<string, readonly unknown[]>>;

/** Default `params` of every automation (SPEC-102 EF-6, BR-AUT-01 to BR-AUT-10). */
export const AUTOMATION_DEFAULTS = {
  reprise: { missedReplace: 'consent', inactiveDays: 2, lightenAfterDays: 5 },
  micro_seance: { hour: 20, durationMin: 5 },
  echauffement: { questionCount: 3, scope: 'yesterday_and_prerequisites' },
  remediation: { retryDelayHours: 24, mode: 'advised' },
  jeu_lacune: { preference: 'vary' },
  questions_cartes: { mode: 'confirm' },
  plafond_quiz: { maxMinutes: 15, targetRetention: 0.9 },
  sprint: { daysBefore: 3, durationMin: 30 },
  bilan: { weekday: 7, hour: 19, channel: 'app' },
  pause: { diagnosticOnReturn: true, diagnosticMinutes: 10 },
} as const satisfies Record<AutomationKey, Record<string, unknown>>;

/** BR-ACC-08 — study rhythm defaults (SPEC-102 ET-6). */
export const STUDY_DEFAULTS = {
  hoursPerDay: 2,
  studyDays: [1, 2, 3, 4, 5],
  preferredSlots: ['soir'],
} as const;

/** BR-NOT-04, BR-NOT-05 — notification settings defaults (SPEC-102 ET-6). */
export const NOTIFICATION_DEFAULTS = {
  channelEmail: true,
  channelPush: true,
  types: {
    revision: true,
    validation: true,
    course: true,
    gap: true,
    planning: true,
    relaunch: true,
  },
  digestTime: '08:00',
  quietStart: '21:00',
  quietEnd: '08:00',
  weekendQuiet: true,
  maxPerDay: 5,
} as const;

/** BR-FOR-*, BR-GAM-03 — formations, programmes and milestones. */
export const FORMATION_RULES = {
  /** BR-FOR-01 — at most 5 framing questions; the goal is 1 to 120 characters. */
  maxFramingQuestions: 5,
  goalMaxCharacters: 120,
  /** BR-FOR-06 — module pass mark 80 % by default, adjustable between 60 % and 95 %. */
  moduleThresholdPercent: { default: 80, min: 60, max: 95 },
  /** BR-FOR-10 — at most three active formations. */
  maxActiveFormations: 3,
  /** BR-GAM-03 — sober milestones: 100 retained notions, 30-day streak. */
  milestones: { retainedNotions: 100, streakDays: 30 },
} as const;

/** BR-GRP-01 — shared formations. */
export const GROUP_RULES = {
  /** BR-GRP-01 — 10 members at most, owner included; invitation code `LRN-XXXX`. */
  maxMembers: 10,
  invitationCodePattern: 'LRN-XXXX',
} as const;

export type AccountRules = typeof ACCOUNT_RULES;
export type ResourceRules = typeof RESOURCE_RULES;
export type QuizRules = typeof QUIZ_RULES;
export type MemoryRules = typeof MEMORY_RULES;
export type NotificationRules = typeof NOTIFICATION_RULES;
export type AutomationDefaults = typeof AUTOMATION_DEFAULTS;
export type StudyDefaults = typeof STUDY_DEFAULTS;
export type NotificationDefaults = typeof NOTIFICATION_DEFAULTS;
export type FormationRules = typeof FORMATION_RULES;
export type GroupRules = typeof GROUP_RULES;
