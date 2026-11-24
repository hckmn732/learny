// Fixtures of the Profil tests (SPEC-3401): the demonstration account of SPEC-115 as the API sends
// it (`/me/profile`, `/me/notification-settings`, `/me/ai/models`, `/billing/subscription`,
// `/me/pause`, `/streak`, `/home`, the gaps of the current formation).
import type {
  AiModelsState,
  AiTaskModelState,
  ExportState,
  GapListDto,
  HomeDto,
  NotificationSettingsDto,
  PauseStateDto,
  SettingsState,
  StreakDto,
  SubscriptionOutput,
} from '@learny/contracts';

export const NOW = '2026-11-11T12:20:00.000Z';

export const CREDENTIAL_ID = 'cab04e7c-ee2b-5de7-bc49-f60472fe7292';

function task(
  id: 'programme' | 'course' | 'gaps' | 'tutor' | 'light',
  capabilities: readonly ('tools' | 'structured' | 'web_search' | 'passage_refs' | 'vision')[],
): AiTaskModelState {
  return {
    task: id,
    requiredCapabilities: [...capabilities],
    modelId: 'demo-model',
    credentialId: CREDENTIAL_ID,
    provider: 'local',
    providerLabel: 'Modèle local',
    outsideEu: false,
    available: true,
    unavailableReason: null,
    compatibility: {
      credentialId: CREDENTIAL_ID,
      modelId: 'demo-model',
      task: id,
      status: 'pending',
      checkedAt: null,
      durationMs: 0,
      requiredCapabilities: [...capabilities],
      reserveCodes: [],
      reasons: [],
    },
    options: [
      {
        modelId: 'demo-model',
        label: 'Modèle local · ma clé',
        credentialId: CREDENTIAL_ID,
        provider: 'local',
        providerLabel: 'Modèle local',
        outsideEu: false,
        qualificationStatus: 'qualified',
      },
    ],
  };
}

export const SETTINGS: SettingsState = {
  me: {
    id: '3b69c7a7-b1f5-597a-b199-999de11ffdfd',
    email: 'alex.perrin@demo.learny.test',
    firstName: 'Alex',
    lastName: 'Perrin',
    tutorTone: 'vous',
    courseLanguage: 'fr',
    timezone: 'Europe/Paris',
    onboardingStep: 'done',
    onboardingCompletedAt: '2026-10-28T08:05:00.000Z',
    currentFormationId: '79c6d8b4-ee55-5f27-9da1-e958882bfdfc',
  },
  rhythm: { hoursPerDay: 5, studyDays: [1, 2, 3, 4, 5], preferredSlots: ['soir'] },
  updatedAt: NOW,
  createdAt: '2026-09-21T08:05:00.000Z',
  activeFormationCount: 3,
  deletionScheduledFor: null,
  export: null,
};

export const NOTIFICATIONS: NotificationSettingsDto = {
  channels: { app: true, email: true, browser: true },
  types: {
    revision: true,
    validation: true,
    course: true,
    gap: true,
    planning: true,
    relaunch: true,
  },
  digestTime: '08:00',
  quiet: { start: '21:00', end: '08:00', crossesMidnight: true, empty: false },
  weekendQuiet: true,
  maxPerDay: 5,
  activeTypeCount: 6,
  updatedAt: NOW,
};

export const MODELS: AiModelsState = {
  tasks: [
    task('programme', ['tools', 'structured', 'web_search']),
    task('course', ['structured', 'passage_refs']),
    task('gaps', ['structured']),
    task('tutor', ['tools', 'structured']),
    task('light', ['structured']),
  ],
  providers: [],
  updatedAt: NOW,
};

export const SUBSCRIPTION: SubscriptionOutput = {
  status: 'active',
  currentPeriodEnd: '2030-01-01T00:00:00.000Z',
};

export const PAUSE: PauseStateDto = {
  status: 'none',
  startsOn: null,
  endsOn: null,
  diagnosticOnReturn: true,
  endedAt: null,
  pausedFormationIds: [],
  returnDue: false,
  diagnostic: null,
};

export const PAUSE_ACTIVE: PauseStateDto = {
  ...PAUSE,
  status: 'active',
  startsOn: '2026-11-11',
  endsOn: '2026-11-20',
};

export const STREAK = {
  days: 12,
  regularity: [],
  timezone: 'Europe/Paris',
  computedOn: '2026-11-11',
  nextMilestone: null,
} as unknown as StreakDto;

export const HOME = {
  today: {
    date: '2026-11-11',
    label: 'Mercredi 11 novembre',
    plannedMinutes: 302,
    doneMinutes: 180,
    slots: [],
  },
  formations: { current: null, ongoing: [], completed: [] },
  retention: { oneMonth: 86, measuredAt: NOW },
  globalQuiz: null,
} as unknown as HomeDto;

export const GAPS = {
  formationId: SETTINGS.me.currentFormationId ?? '',
  formationTitle: 'SAP S/4HANA Finance',
  nature: null,
  summary: { openGaps: 4, masteredNotions: 0, gapModules: [], masteredModules: [] },
  countsByNature: { forgetting: 4, confusion: 0, misunderstanding: 0, application: 0 },
  items: [],
  nextReviewAt: null,
  timezone: 'Europe/Paris',
  generatedAt: NOW,
} as unknown as GapListDto;

export const EXPORT_DONE: ExportState = {
  id: '8d6d1f3e-3f0e-4f4e-9d3a-4f6d2a1b0c9e',
  status: 'done',
  sizeBytes: 1_258_291,
  createdAt: NOW,
  expiresAt: '2026-11-18T12:20:00.000Z',
  downloadUrl: 'http://127.0.0.1:54321/storage/v1/object/sign/export/archive.zip',
};
