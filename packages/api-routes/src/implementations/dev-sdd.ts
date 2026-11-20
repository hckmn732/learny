import { AI_TASKS, DEFAULT_MODEL_BY_TASK, isAiTask, type AiTask } from '@learny/config';
import {
  devSddSpec102Create,
  devSddSpec102Remove,
  devSddSpec501Correct,
  devSddSpec501Create,
  devSddSpec501Report,
  devSddSpec504Call,
  devSddSpec505Create,
  devSddSpec505Delete,
  devSddSpec506Run,
  devSddSpec507Budget,
  devSddSpec512Decide,
  devSddSpec512Suggest,
  devSddStripeCheckout,
  type AiCredentialProvider,
} from '@learny/contracts';
import { AppError, clock, userDayBounds } from '@learny/core';
import { sanitizeSnippet, STORAGE_BUCKETS, resourcePath } from '@learny/db';
import { devRoutesEnabled } from '@learny/http/dev-guard';
import { readIdempotencyKey } from '@learny/http/idempotency';
import type { HandlerArgs } from '@learny/http/route-handler';
import { DEMO_JOB_ID, JOB_RETRIES, functions } from '@learny/jobs';
import {
  budgetCheckSchema,
  buildAnthropicRequestPreview,
  calculateUsageCost,
  checkBudget,
  formatUsdMicros,
  parseUsdMicros,
} from '@learny/llm';
import { resolvePostAuthDestination } from '@learny/services';
import { createCredential, deleteCredential } from '@learny/services/ai/credentials';
import { getMockCheckoutSession } from '@learny/services/billing';
// The scenario is dev-only and guarded by `devRoutesEnabled`; it never enters a production route.
// eslint-disable-next-line no-restricted-imports
import { runNativeClientScenario } from '@learny/testing/native-client';
import { decideResourceSuggestion, suggestResource } from '@learny/tutor';
import { buildTutorDemo } from '@learny/tutor/demo';

import { routeCoverage } from '../coverage';
import { buildSddConfigDemo } from '../deps/env';
import { loadSpec101Demo } from '../dev-sdd/spec-101';
import { ensureDemoUser, loadSpec102Demo, removeDemoUser } from '../dev-sdd/spec-102';
import { loadSpec103Demo } from '../dev-sdd/spec-103';
import { loadSpec104Demo } from '../dev-sdd/spec-104';
import { loadSpec105Demo } from '../dev-sdd/spec-105';
import { loadSpec106Demo } from '../dev-sdd/spec-106';
import { loadSpec107Demo } from '../dev-sdd/spec-107';
import { loadSpec108Demo } from '../dev-sdd/spec-108';
import { loadSpec109Demo } from '../dev-sdd/spec-109';
import { loadSpec110Demo } from '../dev-sdd/spec-110';
import { loadSpec111Demo } from '../dev-sdd/spec-111';
import { loadSpec112Demo } from '../dev-sdd/spec-112';
import { loadSpec113Demo } from '../dev-sdd/spec-113';
import { loadSpec115Demo } from '../dev-sdd/spec-115';
import { loadSpec411Demo } from '../dev-sdd/spec-411';
import {
  correctDemoBrick,
  createDemoBrick,
  loadSpec501Demo,
  reportDemoBrick,
} from '../dev-sdd/spec-501';
import { loadResolutionDemo, runMockCall } from '../dev-sdd/spec-504';
import { demoContext, demoIdentity, loadSpec505Demo } from '../dev-sdd/spec-505';
import { runSpec506Demo } from '../dev-sdd/spec-506';
import { loadSpec509Demo } from '../dev-sdd/spec-509';
import { loadSpec510Demo } from '../dev-sdd/spec-510';
import { loadSpec511Demo } from '../dev-sdd/spec-511';
import { demoSuggestionContext, loadSearchWebDemo } from '../dev-sdd/spec-512';
import { loadSpec711Demo } from '../dev-sdd/spec-711';
import { SPECIAL_HANDLERS } from '../special';

function enabled(): void {
  if (!devRoutesEnabled()) throw new AppError('NOT_FOUND', 'Ressource introuvable.');
}

async function guarded<T>(implementation: () => Promise<T> | T): Promise<T> {
  enabled();
  return implementation();
}

async function idempotent<T>(request: Request, implementation: () => Promise<T> | T): Promise<T> {
  enabled();
  readIdempotencyKey(request.headers.get('idempotency-key'));
  return implementation();
}

const DESTINATIONS = [
  { id: 'profil', profile: { onboardingStep: 'profil', deletionScheduledFor: null } },
  { id: 'rythme', profile: { onboardingStep: 'rythme', deletionScheduledFor: null } },
  { id: 'ia', profile: { onboardingStep: 'ia', deletionScheduledFor: null } },
  { id: 'done', profile: { onboardingStep: 'done', deletionScheduledFor: null } },
  {
    id: 'next',
    profile: { onboardingStep: 'done', deletionScheduledFor: null },
    next: '/agenda',
  },
  {
    id: 'external',
    profile: { onboardingStep: 'done', deletionScheduledFor: null },
    next: '//evil.example',
  },
  {
    id: 'deletion',
    profile: {
      onboardingStep: 'done',
      deletionScheduledFor: '2026-12-01T00:00:00Z',
    },
  },
] as const;

function spec202Demo() {
  return {
    destinations: DESTINATIONS.map((entry) => ({
      id: entry.id,
      value: resolvePostAuthDestination(entry.profile, 'next' in entry ? entry.next : undefined),
    })),
  };
}

const DEMO_USER = '11111111-1111-4111-8111-111111111111';
const DEMO_RESOURCE = '22222222-2222-4222-8222-222222222222';

function spec114Demo() {
  return {
    buckets: [STORAGE_BUCKETS.resources, STORAGE_BUCKETS.exports],
    path: resourcePath(DEMO_USER, DEMO_RESOURCE, 'guide.pdf'),
  };
}

function spec504Demo() {
  return loadResolutionDemo().then((resolution) => ({
    resolution,
    previews: Object.fromEntries(
      AI_TASKS.map((task) => [
        task,
        buildAnthropicRequestPreview({
          task,
          modelId: DEFAULT_MODEL_BY_TASK[task],
          managed: true,
          system: [
            { text: 'Consigne système stable de la tâche.', cache: true },
            { text: 'Question courante.', cache: false },
          ],
        }),
      ]),
    ),
  }));
}

interface DemoCall {
  day: string;
  formation: string;
  task: AiTask;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  status: 'ok' | 'error' | 'refused' | 'capped';
  batch: boolean;
}

const BUDGET_CALLS: readonly DemoCall[] = [
  {
    day: '2026-11-11',
    formation: 'SAP S/4HANA Finance',
    task: 'tutor',
    model: DEFAULT_MODEL_BY_TASK.tutor,
    inputTokens: 2_400,
    outputTokens: 600,
    cacheReadTokens: 1_200,
    cacheWriteTokens: 0,
    status: 'ok',
    batch: false,
  },
  {
    day: '2026-11-11',
    formation: 'SAP S/4HANA Finance',
    task: 'light',
    model: DEFAULT_MODEL_BY_TASK.light,
    inputTokens: 800,
    outputTokens: 200,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    status: 'ok',
    batch: true,
  },
  {
    day: '2026-11-11',
    formation: 'SAP S/4HANA Finance',
    task: 'programme',
    model: DEFAULT_MODEL_BY_TASK.programme,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    status: 'capped',
    batch: false,
  },
  {
    day: '2026-11-10',
    formation: 'Hors formation',
    task: 'gaps',
    model: DEFAULT_MODEL_BY_TASK.gaps,
    inputTokens: 1_200,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    status: 'refused',
    batch: false,
  },
];

function callCost(call: DemoCall): string {
  return calculateUsageCost({
    model: call.model,
    managed: true,
    usage: {
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      cacheReadTokens: call.cacheReadTokens,
      cacheWriteTokens: call.cacheWriteTokens,
    },
    batch: call.batch,
  }).costUsd;
}

function spec507Budget(spendInput: string | undefined, taskInput: string | undefined) {
  const candidate = taskInput ?? '';
  const task: AiTask = isAiTask(candidate) ? candidate : 'tutor';
  const numericSpend = Number(spendInput ?? '0');
  const spentUsd = Number.isFinite(numericSpend)
    ? Math.max(0, numericSpend).toFixed(6)
    : '0.000000';
  const at = new Date('2026-11-11T12:20:00Z');
  const model = DEFAULT_MODEL_BY_TASK[task];
  const decision = checkBudget({
    userId: DEMO_USER,
    task,
    model,
    estimatedTokens: { inputTokens: 4_000, outputTokens: 1_000 },
    at,
    capUsd: '1.500000',
    spentUsd,
  });
  const validInput = {
    userId: DEMO_USER,
    task,
    model,
    estimatedTokens: { inputTokens: 4_000, outputTokens: 1_000 },
    at: at.toISOString(),
    capUsd: '1.500000',
    spentUsd,
  };
  const invalid = budgetCheckSchema.safeParse({ ...validInput, capUsd: '0' });
  const groups = new Map<
    string,
    { day: string; formation: string; calls: number; micros: number }
  >();
  const calls = BUDGET_CALLS.map((call) => {
    const cost = callCost(call);
    const key = `${call.day}/${call.formation}`;
    const current = groups.get(key) ?? {
      day: call.day,
      formation: call.formation,
      calls: 0,
      micros: 0,
    };
    current.calls += 1;
    current.micros += parseUsdMicros(cost);
    groups.set(key, current);
    return { ...call, cost };
  });
  return {
    spentUsd,
    spentLabel: `${formatUsdMicros(parseUsdMicros(spentUsd))} USD`,
    task,
    decision,
    estimatedLabel: `${formatUsdMicros(parseUsdMicros(decision.estimatedCostUsd))} USD`,
    validInput,
    failure: invalid.success
      ? 'validation inattendue'
      : (invalid.error.issues[0]?.message ?? 'entrée refusée'),
    resetsLabel: new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(userDayBounds('2026-11-11', 'Europe/Paris').end),
    calls,
    aggregates: [...groups.values()].map((group) => ({
      day: group.day,
      formation: group.formation,
      calls: group.calls,
      cost: formatUsdMicros(group.micros),
    })),
  };
}

async function createSpec505Credential(body: {
  provider?: string | undefined;
  model?: string | undefined;
  baseUrl?: string | undefined;
  apiKey?: string | undefined;
}) {
  const identity = await demoIdentity();
  if (identity === null) throw new AppError('NOT_FOUND', 'Jeu de démonstration absent.');
  if (body.provider === undefined || body.model === undefined) {
    throw new AppError('VALIDATION_FAILED', 'Choisissez un fournisseur et un nom de modèle.');
  }
  const result = await createCredential(demoContext(identity), {
    provider: body.provider as AiCredentialProvider,
    modelIds: [body.model],
    ...(body.baseUrl === undefined ? {} : { baseUrl: body.baseUrl }),
    ...(body.apiKey === undefined ? {} : { apiKey: body.apiKey }),
  });
  if (!result.ok) throw result.error;
  return loadSpec505Demo();
}

async function deleteSpec505Credential(id: string | undefined) {
  if (id === undefined) throw new AppError('VALIDATION_FAILED', 'Identifiant de clé manquant.');
  const identity = await demoIdentity();
  if (identity === null) throw new AppError('NOT_FOUND', 'Jeu de démonstration absent.');
  const result = await deleteCredential(demoContext(identity), id);
  if (!result.ok) throw result.error;
  return loadSpec505Demo();
}

async function suggestSpec512(body: {
  title?: string | undefined;
  url?: string | undefined;
  reason?: string | undefined;
}) {
  const demo = await demoSuggestionContext();
  const result = await suggestResource(
    { userId: demo.userId, db: demo.db, clock },
    {
      chapterId: demo.chapterId,
      title: body.title ?? '',
      url: body.url ?? '',
      reason: body.reason ?? '',
    },
  );
  if (!result.ok) {
    return {
      status: 'error' as const,
      id: null,
      message: `${result.error.code} · ${result.error.detail}`,
    };
  }
  return {
    status: result.value.status,
    id: result.value.id,
    message:
      result.value.status === 'pending'
        ? 'Suggestion en attente de votre import : aucun contenu n’est encore entré dans le chapitre.'
        : 'Cette suggestion a déjà reçu une décision.',
  };
}

async function decideSpec512(body: { id?: string | undefined; decision?: string | undefined }) {
  const demo = await demoSuggestionContext();
  const result = await decideResourceSuggestion(
    { userId: demo.userId, db: demo.db, clock },
    body.id ?? '',
    body.decision ?? '',
  );
  if (!result.ok) {
    return {
      status: 'error' as const,
      id: null,
      message: `${result.error.code} · ${result.error.detail}`,
    };
  }
  return {
    status: result.value.status,
    id: result.value.id,
    message:
      result.value.status === 'imported'
        ? 'Ressource importée dans le chapitre. Aucun contenu de cours n’a été créé : l’import est votre décision.'
        : 'Suggestion ignorée : elle ne sera pas ajoutée au chapitre.',
  };
}

export const devSddImplementations = {
  devSddSpec009Demo: () => guarded(buildSddConfigDemo),
  devSddSpec007Demo: () =>
    guarded(() => ({
      ids: functions
        .map((fn) => fn.id())
        .filter((id) => id === DEMO_JOB_ID)
        .join(', '),
      retries: JOB_RETRIES,
    })),
  devSddSpec1004Demo: () =>
    guarded(() => ({
      coverage: routeCoverage(),
      specials: Object.entries(SPECIAL_HANDLERS)
        .map(([key, handler]) => ({ key, method: handler.method, path: handler.path }))
        .sort((left, right) => left.key.localeCompare(right.key)),
    })),
  devSddSpec101Demo: () => guarded(loadSpec101Demo),
  devSddSpec102Demo: () => guarded(loadSpec102Demo),
  devSddSpec102Create: ({ request }: HandlerArgs<typeof devSddSpec102Create>) =>
    idempotent(request, () => ensureDemoUser()),
  devSddSpec102Remove: ({ request }: HandlerArgs<typeof devSddSpec102Remove>) =>
    idempotent(request, () => removeDemoUser()),
  devSddSpec103Demo: () => guarded(loadSpec103Demo),
  devSddSpec104Demo: () => guarded(loadSpec104Demo),
  devSddSpec105Demo: () => guarded(loadSpec105Demo),
  devSddSpec106Demo: () => guarded(loadSpec106Demo),
  devSddSpec107Demo: () => guarded(loadSpec107Demo),
  devSddSpec108Demo: () => guarded(loadSpec108Demo),
  devSddSpec109Demo: () => guarded(loadSpec109Demo),
  devSddSpec110Demo: () => guarded(() => Promise.resolve(loadSpec110Demo())),
  devSddSpec111Demo: () => guarded(loadSpec111Demo),
  devSddSpec112Demo: () =>
    guarded(async () => {
      const data = await loadSpec112Demo();
      return {
        ...data,
        groups: data.groups.map((group) => ({
          ...group,
          items: group.items.map((item) => ({
            ...item,
            snippet: sanitizeSnippet(item.snippet),
          })),
        })),
      };
    }),
  devSddSpec113Demo: () => guarded(loadSpec113Demo),
  devSddSpec114Demo: () => guarded(spec114Demo),
  devSddSpec115Demo: () => guarded(loadSpec115Demo),
  devSddSpec202Demo: () => guarded(spec202Demo),
  devSddSpec411Demo: () => guarded(loadSpec411Demo),
  devSddSpec501Demo: () => guarded(loadSpec501Demo),
  devSddSpec501Create: ({ request }: HandlerArgs<typeof devSddSpec501Create>) =>
    idempotent(request, createDemoBrick),
  devSddSpec501Report: ({ body, request }: HandlerArgs<typeof devSddSpec501Report>) =>
    idempotent(request, () => reportDemoBrick(body.brickId ?? body.id ?? '')),
  devSddSpec501Correct: ({ body, request }: HandlerArgs<typeof devSddSpec501Correct>) =>
    idempotent(request, () => correctDemoBrick(body.brickId ?? body.id ?? '')),
  devSddSpec504Demo: () => guarded(spec504Demo),
  devSddSpec504Call: ({ body, request }: HandlerArgs<typeof devSddSpec504Call>) =>
    idempotent(request, () => {
      const task = body.task ?? '';
      const scenario = body.scenario ?? '';
      if (
        !isAiTask(task) ||
        !new Set([
          'demo',
          'demo-tool-call',
          'demo-refusal',
          'demo-timeout',
          'demo-object',
          'demo-invalid-object',
        ]).has(scenario)
      ) {
        return null;
      }
      return runMockCall({ task, scenario });
    }),
  devSddSpec505Demo: () => guarded(loadSpec505Demo),
  devSddSpec505Create: ({ body, request }: HandlerArgs<typeof devSddSpec505Create>) =>
    idempotent(request, () => createSpec505Credential(body)),
  devSddSpec505Delete: ({ body, request }: HandlerArgs<typeof devSddSpec505Delete>) =>
    idempotent(request, () => deleteSpec505Credential(body.id)),
  devSddSpec506Run: ({ body, request }: HandlerArgs<typeof devSddSpec506Run>) =>
    idempotent(request, () => runSpec506Demo(body.scenario ?? 'success')),
  devSddSpec507Budget: ({ body }: HandlerArgs<typeof devSddSpec507Budget>) =>
    guarded(() => spec507Budget(body.spend, body.task)),
  devSddSpec508Demo: () => guarded(buildTutorDemo),
  devSddSpec509Demo: () => guarded(loadSpec509Demo),
  devSddSpec510Demo: () => guarded(loadSpec510Demo),
  devSddSpec511Demo: () => guarded(loadSpec511Demo),
  devSddSpec512Demo: () => guarded(loadSearchWebDemo),
  devSddSpec512Suggest: ({ body, request }: HandlerArgs<typeof devSddSpec512Suggest>) =>
    idempotent(request, () => suggestSpec512(body)),
  devSddSpec512Decide: ({ body, request }: HandlerArgs<typeof devSddSpec512Decide>) =>
    idempotent(request, () => decideSpec512(body)),
  devSddSpec711Demo: () => guarded(loadSpec711Demo),
  devSddSpec1203Demo: () =>
    guarded(() => ({
      categories: {
        pages: 0,
        lib: 0,
        components: 0,
        dev: 0,
        proxy: 0,
        apiRoutes: 0,
      },
      dependencies: [
        '@learny/api-client',
        '@learny/bricks',
        '@learny/contracts',
        '@learny/core',
        '@learny/domain',
        '@learny/i18n',
        '@learny/learning-engine',
        '@learny/ui',
      ],
      serverModules: 0,
    })),
  devSddSpec1301Demo: () =>
    guarded(() =>
      runNativeClientScenario({
        apiUrl: process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001',
      }),
    ),
  devSddStripeCheckout: ({ body, request }: HandlerArgs<typeof devSddStripeCheckout>) =>
    idempotent(request, async () => {
      try {
        return {
          sessionId:
            body.id !== undefined && (await getMockCheckoutSession(body.id))?.status === 'open'
              ? body.id
              : null,
        };
      } catch (error) {
        if (error instanceof AppError && error.code === 'CONFLICT') return { sessionId: null };
        throw error;
      }
    }),
} as const;
