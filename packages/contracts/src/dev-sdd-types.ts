import type { GapNature } from './gaps';
import type { IngestionOutcome } from './ingestion';
import type { LegalDocument } from './legal';
import type { DeliveryChannel, DeliveryStatus, NotificationType } from './notifications';
import type { SearchWebOutput, SearchWebProvider, SearchWebResult } from './search-web';

export type DemoAiTask = 'programme' | 'course' | 'gaps' | 'tutor' | 'light';
export type DemoRetrievalTask = 'programme' | 'course' | 'gaps' | 'tutor';
export type DemoSource = { screen: string; file: string; element: string };
export type GroupMemberProgress = {
  groupId: string;
  userId: string;
  firstName: string | null;
  currentModulePosition: number;
  validatedModules: number;
  streakDays: number;
};
export type FsrsCardJson = {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3;
  last_review: string | null;
  learning_steps?: number;
};
export type SlotKind =
  | 'contributions'
  | 'course'
  | 'exercise'
  | 'validation_quiz'
  | 'global_quiz'
  | 'revision'
  | 'buffer'
  | 'sprint'
  | 'mock_exam'
  | 'warmup'
  | 'micro_session'
  | 'weekly_review';
export type SlotStatus = 'planned' | 'done' | 'missed' | 'moved' | 'cancelled';
export type SlotCreator = 'planner' | 'automation' | 'learner';
export type AutomationStatus =
  'pending_consent' | 'applied' | 'declined' | 'undone' | 'expired' | 'consumed';
export type AiProviderValue =
  'anthropic' | 'openai' | 'mistral' | 'deepseek' | 'openai_compatible' | 'local';
export type CredentialStatusValue = 'untested' | 'qualified' | 'failed';
export type AiCallStatusValue = 'ok' | 'error' | 'refused' | 'capped' | 'invalid_output';
export type SubscriptionStatusValue = 'none' | 'active' | 'past_due' | 'canceled' | 'incomplete';
export type RlsCategory = 'shared-programme' | 'personal' | 'service';

export interface ExtensionRow {
  [key: string]: unknown;
  name: string;
  version: string;
}
export interface MigrationRow {
  [key: string]: unknown;
  version: string;
  name: string;
}
export interface FunctionRow {
  [key: string]: unknown;
  name: string;
  value: string | null;
}
export interface EnumRow {
  [key: string]: unknown;
  name: keyof typeof Spec101Enums;
  values: string[];
}
export const Spec101Extensions = ['pgcrypto', 'vector', 'unaccent', 'pg_trgm'] as const;
export const Spec101Enums = {
  course_language: ['fr', 'en', 'es', 'de'],
  actor: ['tutor', 'learner', 'import'],
  content_origin: ['resource', 'tutor'],
  job_status: ['queued', 'running', 'done', 'failed'],
} as const;
export const Spec101EnumNames = Object.keys(Spec101Enums) as (keyof typeof Spec101Enums)[];
export const Spec101UnaccentExpected = 'Ecriture comptable';
export interface Identity {
  [key: string]: unknown;
  uid: string | null;
  role: string;
}
export interface Spec101Data {
  extensions: ExtensionRow[];
  migrations: MigrationRow[];
  functions: FunctionRow[];
  enums: EnumRow[];
  rls: {
    userA: { id: string; identity: Identity };
    userB: { id: string; identity: Identity };
    service: Identity;
  };
}

export type ConstraintKey = 'cl2' | 'cl3' | 'cl4' | 'cl5';
export interface Spec102Data {
  email: string;
  profile: {
    email: string;
    courseLanguage: string;
    tutorTone: string;
    timezone: string;
    onboardingStep: string;
  };
  study: { hoursPerDay: number; studyDays: number[]; preferredSlots: string[] };
  notifications: {
    channelEmail: boolean;
    channelPush: boolean;
    types: Record<string, boolean>;
    digestTime: string;
    quietStart: string;
    quietEnd: string;
    weekendQuiet: boolean;
    maxPerDay: number;
  };
  automations: Array<{ key: string; enabled: boolean; params: Record<string, unknown> }>;
  constraints: Array<{
    key: ConstraintKey;
    expected: string;
    sqlstate: string;
    ok: boolean;
  }>;
}
export interface Spec103Data {
  modules: Array<{
    position: number;
    title: string;
    threshold: number;
    chapters: Array<{
      position: number;
      title: string;
      notions: Array<{ position: number; label: string }>;
    }>;
  }>;
  constraints: Array<{
    key: 'cl1' | 'cl2' | 'cl3' | 'cl4' | 'cl5' | 'cl6' | 'cl7';
    expected: string;
    sqlstate: string;
    message: string;
    ok: boolean;
  }>;
  fts: {
    query: string;
    matchCount: number;
    matchedLabel: string;
    plan: string;
    indexUsed: boolean;
  };
}
export interface Spec104Data {
  resource: {
    title: string;
    kind: string;
    status: string;
    contentText: string;
    chunks: Array<{ position: number; text: string; charStart: number; charEnd: number }>;
  };
  search: {
    query: string;
    neighbours: Array<{ position: number; text: string; distance: number }>;
    plan: string;
    indexUsed: boolean;
  };
  limits: Array<{
    key: 'cl1' | 'cl2' | 'cl3' | 'cl8';
    expected: string;
    sqlstate: string;
    code: string;
    ok: boolean;
  }>;
  softDelete: {
    title: string;
    before: number;
    after: number;
    retained: boolean;
    contentErased: boolean;
  };
}
export interface Spec105Data {
  versions: Array<{ version: number; status: string; isCurrent: boolean }>;
  section: {
    title: string;
    currentVersion: number;
    revisions: Array<{ version: number; title: string; editedBy: string }>;
  };
  citation: {
    label: string;
    displayed: string;
    chunkId: string | null;
    resourceId: string | null;
  };
  messages: Array<{ role: string; content: string; sources: string[] }>;
}
export interface Spec106Data {
  types: Array<{ type: string; purpose: string; status: string; currentVersion: number }>;
  activity: {
    kind: string;
    status: string;
    items: Array<{
      position: number;
      type: string;
      version: number;
      availableVersion: number;
      points: number | null;
    }>;
  };
  attempt: {
    attemptNo: number;
    status: string;
    score: number | null;
    passed: boolean | null;
    answers: number;
  };
  answers: Array<{
    position: number;
    type: string;
    version: number;
    currentVersion: number;
    isCorrect: boolean | null;
    score: number | null;
    maxScore: number | null;
    gradedBy: string | null;
  }>;
}
export interface Spec107History {
  reviewedAt: string;
  source: string;
  grade: string;
  correct: boolean | null;
  timeMs: number | null;
  before: FsrsCardJson | null;
  after: FsrsCardJson | null;
}
export interface Spec107Data {
  dueCount: number;
  states: Array<{
    notionId: string;
    label: string;
    dueAt: string | null;
    mastery: number;
    inReview: boolean;
    suspended: boolean;
    fsrs: FsrsCardJson;
  }>;
  gap: {
    active: boolean;
    nature: GapNature | null;
    confusedWithLabel: string | null;
    detectedAt: string | null;
    evidence: Record<string, unknown> | null;
    natures: GapNature[];
  };
  history: Spec107History[];
  isolation: { foreignStates: number; foreignVisible: number };
}
export interface Spec108Data {
  slots: Array<{
    id: string;
    title: string;
    kind: SlotKind;
    status: SlotStatus;
    createdBy: SlotCreator;
    startsAt: string;
    endsAt: string;
    movedFromStartsAt: string | null;
  }>;
  action: {
    automation: string;
    kind: string;
    summary: string;
    status: AutomationStatus;
    requiresConsent: boolean;
    createdAt: string;
    payload: Record<string, unknown>;
  } | null;
  daily: {
    day: string;
    minutes: number;
    qualifying: boolean;
    sources: string[];
  } | null;
  milestones: Array<{ key: string; refId: string | null; achievedAt: string }>;
}
export type Spec109Delivery = {
  id: string;
  notificationTitle: string;
  notificationType: NotificationType;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  scheduledFor: string | null;
  sentAt: string | null;
  error: string | null;
};
export interface Spec109Data {
  unreadCount: number;
  unreadNotifications: number;
  notifications: Array<{
    id: string;
    type: NotificationType;
    title: string;
    body: string;
    href: string;
    icon: string;
    createdAt: string;
    readAt: string | null;
  }>;
  deliveries: Spec109Delivery[];
}
export interface Spec110Data {
  credentials: Array<{
    provider: AiProviderValue;
    label: string;
    keyLast4: string | null;
    status: CredentialStatusValue;
    outsideEu: boolean;
  }>;
  tasks: Array<{
    task: string;
    modelId: string;
    managed: boolean;
    usable: boolean;
    credentialLabel: string | null;
    credentialStatus: CredentialStatusValue | null;
  }>;
  calls: Array<{
    task: string;
    provider: AiProviderValue;
    model: string;
    managed: boolean;
    status: AiCallStatusValue;
    costUsd: string;
    createdAt: string;
  }>;
  spend: {
    day: string;
    amountUsd: string;
    capUsd: string;
    managedCalls: number;
    byokCalls: number;
    billedCalls: number;
  };
  subscription: {
    status: SubscriptionStatusValue;
    capUsd: string;
    currentPeriodEnd: string | null;
    stripeCustomerId: string | null;
  } | null;
}
export interface Spec111Data {
  code: string;
  capacity: { used: number; max: number };
  progress: GroupMemberProgress[];
  activeCount: number;
}
export interface Spec112Data {
  query: string;
  groups: Array<{
    kind: 'formation' | 'notion' | 'section';
    items: Array<{
      kind: string;
      id: string;
      title: string;
      snippet: string;
      href: string;
      rank: number;
    }>;
  }>;
  total: number;
  foreignTitle: string;
  foreignVisible: number;
  exports: Array<{
    id: string;
    status: string;
    sizeBytes: number | null;
    createdAt: string;
    expiresAt: string | null;
    downloadable: boolean;
  }>;
  acceptances: Array<{
    id: string;
    document: LegalDocument;
    version: string;
    acceptedAt: string;
  }>;
  latestCgu: string | null;
  idempotency: Array<{
    key: string;
    state: 'replayed' | 'in_progress' | 'reused';
    statusCode: number;
    createdAt: string;
    completedAt: string | null;
    response: unknown;
  }>;
}
export interface Spec113Data {
  tableCount: number;
  rlsCount: number;
  forcedCount: number;
  policyCount: number;
  categories: Array<{ category: RlsCategory; count: number }>;
  matrix: Array<{
    key:
      | 'programme-read'
      | 'programme-write'
      | 'resources-read'
      | 'progress-read'
      | 'projection-read'
      | 'service-read'
      | 'settings-read';
    category: RlsCategory;
    cells: { a: boolean; b: boolean; c: boolean };
  }>;
}
export interface Spec115Data {
  present: boolean;
  profile: {
    fullName: string;
    email: string;
    timezone: string;
    streakDays: number;
  } | null;
  formations: {
    activeOrProposed: number;
    completed: number;
    titles: Array<{ title: string; status: string; progress: number | null }>;
  };
  sap: { modules: number; chapters: number; notions: number };
  group: { members: number; names: string[] };
  agenda: {
    days: Array<{
      date: string;
      label: string;
      slots: Array<{
        id: string;
        start: string;
        end: string;
        title: string;
        meta: string | null;
        status: string;
        formation: string;
      }>;
    }>;
    slots: number;
    unread: number;
  };
  checks: Array<{
    key: string;
    label: string;
    expected: string;
    observed: string;
    ok: boolean;
    source: DemoSource;
  }>;
}
export interface Spec411Data {
  attemptId: string;
  attemptStatus: string;
  answerCount: number;
  reviewCount: number;
  pendingAnswers: number;
  secondStatus: string;
  secondReviewCount: number;
  dailyDay: string;
  dailyMinutes: number;
  before: Spec411State[];
  after: Spec411State[];
  gapEvents: Array<{ notionId: string; kind: string; nature: string | null }>;
  events: Array<{ name: string; sentAt: string | null; nature: string | null }>;
  slots: Array<{
    title: string;
    kind: string;
    status: string;
    startsAt: string;
    endsAt: string;
    createdBy: string;
  }>;
  slotSummary: string;
}
export interface Spec411State {
  notionId: string;
  label: string;
  mastery: number;
  dueAt: string | null;
  gapNature: string | null;
  gapClearedAt: string | null;
}
export interface ResolutionCell {
  task: DemoAiTask;
  model: string;
  available: boolean;
  reason: string | null;
}
export interface ResolutionRow {
  key: 'subscriber' | 'byok' | 'none';
  label: string;
  cells: ResolutionCell[];
}
export interface MockCallState {
  task: DemoAiTask;
  scenario: string;
  kind: 'text' | 'tools' | 'object' | 'error';
  result: string;
  call: {
    task: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    status: string;
    errorCode: string | null;
  } | null;
}
export interface Spec509Data {
  note: Spec509Snapshot;
  pdf: Spec509Snapshot;
  failure: { failed: Spec509Snapshot; retried: Spec509Snapshot };
  input: { resourceId: string; kind: 'note' | 'pdf' };
  contractOutput: IngestionOutcome;
}
export interface Spec509Snapshot {
  status: 'ready' | 'failed' | 'queued' | 'processing';
  errorCode: string | null;
  errorMessage: string | null;
  chunkCount: number;
  chunks: Spec509Chunk[];
  pages: number | null;
  anthropicFileId: string | null;
  event: string | null;
  outcome: IngestionOutcome;
}
export interface Spec509Chunk {
  position: number;
  text: string;
  page: number | null;
  charStart: number;
  charEnd: number;
  tokenCount: number;
  vector: { dims: number; norm: number; sample: number[]; digest: string };
}
export interface Spec510Data {
  web: Spec510Snapshot;
  youtube: Spec510Snapshot;
  image: Spec510Snapshot;
  ssrf: Spec510Snapshot;
  noCaptions: Spec510Snapshot;
  input: { kind: 'web' | 'youtube' | 'image'; resourceId: string };
  contractOutput: IngestionOutcome;
}
export interface Spec510Snapshot {
  status: 'ready' | 'failed' | 'queued' | 'processing';
  title: string;
  errorCode: string | null;
  errorMessage: string | null;
  chunkCount: number;
  contentOrigin: string | null;
  visionModel: string | null;
  chunks: Spec510Chunk[];
  event: string | null;
  outcome: IngestionOutcome;
}
export interface Spec510Chunk {
  position: number;
  text: string;
  anchor: string | null;
  startSec: number | null;
  endSec: number | null;
  tokenCount: number;
}
export interface Spec511Data {
  query: string;
  results: Spec511ResultRow[];
  memberExcluded: number;
  budgets: Spec511BudgetRow[];
  selection: {
    task: DemoRetrievalTask;
    budget: number;
    used: number;
    selected: number;
    duplicates: number;
    omitted: number;
    preview: string;
    truncated: boolean;
  };
  trap: { raw: string; formatted: string };
  noMatches: { reason: 'no_matches'; count: number };
  failure: { code: string; message: string };
  contractInput: Record<string, unknown>;
  contractOutput: Record<string, unknown>;
}
export interface Spec511ResultRow {
  chunkId: string;
  source: string;
  position: number;
  score: number;
  tokenCount: number;
  location: string;
  preview: string;
}
export interface Spec511BudgetRow {
  task: DemoRetrievalTask;
  budget: number;
  used: number;
  selected: number;
  duplicates: number;
  omitted: number;
}
export interface RouteDemo {
  provider: SearchWebProvider;
  results: SearchWebResult[];
  limited: boolean;
  message: string | null;
}
export interface SearchWebDemo {
  routes: Record<SearchWebProvider, RouteDemo>;
  refusal: { code: string; message: string };
  unavailable: { code: string; message: string };
  input: unknown;
  validated: SearchWebOutput;
}
export interface Spec711Data {
  keys: Spec711KeyRow[];
  steps: Spec711Step[];
  effectCount: number;
  refusalTitle: string;
  refusalMessage: string;
  journal: Spec711JournalRow[];
  weekCount: number;
  weekStart: string;
}
export interface Spec711KeyRow {
  key: string;
  triggers: string;
  params: string;
  explanation: string;
  registered: boolean;
}
export interface Spec711Step {
  label: string;
  result: string;
  code: string | null;
}
export interface Spec711JournalRow {
  createdAt: string;
  automation: string;
  status: string;
  summary: string;
  canUndo: boolean;
}
