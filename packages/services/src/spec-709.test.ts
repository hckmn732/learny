// Unit tests of the « Modèles d'IA » tab (SPEC-709 §12, CA-1, CA-2; ADR-0047 fixed clock).
// The database is a fake: these tests pin qualification filtering, masking, the CL-3 refusal and
// the idempotent upsert of a task choice. No key, no provider and no network enter the test.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QualificationReport } from '@learny/contracts';
import { aiCredentials, aiTaskModels } from '@learny/db';

import { TestClock } from '../test/support/fakes';

import type { ServiceContext } from './context';
import {
  getAiModelsState,
  modelOptionsForTask,
  modelQualifiedForTask,
  parseModelsUpdate,
  providerCardOf,
  providerFailureOf,
  type AssignmentRow,
  type CredentialRow,
  taskCapabilities,
  taskCompatibilityStateOf,
  taskStateOf,
  updateAiModels,
} from './parametres-modeles-d-ia';

const mocks = vi.hoisted(() => ({ setTaskModel: vi.fn() }));

vi.mock('@learny/db', () => ({
  aiCredentials: {
    id: 'id',
    userId: 'user_id',
    provider: 'provider',
    label: 'label',
    modelIds: 'model_ids',
    keyLast4: 'key_last4',
    status: 'status',
    qualification: 'qualification',
    outsideEu: 'outside_eu',
    qualifiedAt: 'qualified_at',
    createdAt: 'created_at',
  },
  aiTaskModels: {
    userId: 'user_id',
    task: 'task',
    credentialId: 'credential_id',
    modelId: 'model_id',
  },
  setTaskModel: mocks.setTaskModel,
}));

const USER = '11111111-1111-4111-8111-111111111111';
const CREDENTIAL = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const AT = '2026-11-11T12:20:00Z';
const MODEL = 'gpt-5.5-test';
const STEP_KEYS = ['connection', 'tools', 'structured', 'bricks'] as const;

beforeEach(() => {
  mocks.setTaskModel.mockReset();
});

function report(
  modelId: string,
  status: 'qualified' | 'failed' = 'qualified',
  capabilities: Partial<QualificationReport['capabilities']> = {},
): QualificationReport {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    credentialId: CREDENTIAL,
    modelId,
    provider: 'openai',
    status,
    startedAt: '2026-11-11T12:00:00Z',
    finishedAt: '2026-11-11T12:01:00Z',
    durationMs: 60_000,
    modelVersion: '2026-11',
    steps: STEP_KEYS.map((step) => ({
      step,
      status: status === 'failed' && step === 'bricks' ? ('failed' as const) : ('passed' as const),
      durationMs: 100,
      errorCode: status === 'failed' && step === 'bricks' ? 'INVALID_OUTPUT' : null,
      modelVersion: '2026-11',
    })),
    bricks: Array.from({ length: 13 }, (_entry, index) => ({
      type: index === 0 ? 'matching' : 'text',
      status: index === 0 && status === 'failed' ? ('failed' as const) : ('passed' as const),
      durationMs: 10,
      errorCode: index === 0 && status === 'failed' ? 'INVALID_OUTPUT' : null,
      issues: [],
    })),
    capabilities: {
      tools: true,
      structured: true,
      web_search: true,
      passage_refs: true,
      vision: true,
      ...capabilities,
    },
  };
}

function credentialRow(overrides: Partial<CredentialRow> = {}): CredentialRow {
  return {
    id: CREDENTIAL,
    provider: 'openai',
    label: 'OpenAI',
    modelIds: [MODEL],
    keyLast4: 'a91F',
    status: 'qualified',
    qualification: {
      keyPrefix: 'sk',
      models: { [MODEL]: report(MODEL) },
      lastRunId: '44444444-4444-4444-8444-444444444444',
    },
    outsideEu: true,
    qualifiedAt: new Date('2026-11-11T10:00:00Z'),
    createdAt: new Date('2026-11-09T10:00:00Z'),
    ...overrides,
  };
}

interface FakeDb {
  credentials: CredentialRow[];
  assignments: AssignmentRow[];
}

function fakeTx(fake: FakeDb) {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () =>
          table === aiCredentials
            ? {
                orderBy: () => Promise.resolve(fake.credentials),
                limit: () => Promise.resolve(fake.credentials.slice(0, 1)),
              }
            : Object.assign(Promise.resolve(fake.assignments), {
                limit: () => Promise.resolve(fake.assignments.slice(0, 1)),
              }),
      }),
    }),
    delete: (table: unknown) => ({
      where: () => {
        if (table === aiTaskModels) fake.assignments = [];
        return Promise.resolve(undefined);
      },
    }),
  };
}

function context(fake: FakeDb): ServiceContext {
  const tx = fakeTx(fake);
  return {
    userId: USER,
    requestId: 'req-709',
    db: { run: (flow: (inner: unknown) => Promise<unknown>) => flow(tx) } as never,
    clock: new TestClock(AT),
    logger: {} as never,
  };
}

function optionsOf(task: Parameters<typeof modelOptionsForTask>[0], fake: FakeDb) {
  return modelOptionsForTask(task, fake.credentials);
}

describe('[SPEC-709] règles et calculs', () => {
  it('CA-1 — un modèle failed reste un candidat à qualifier, un modèle qualifié reste affectable', () => {
    const fake: FakeDb = {
      credentials: [
        credentialRow({
          status: 'failed',
          qualification: { models: { [MODEL]: report(MODEL, 'failed') } },
        }),
        credentialRow({
          id: OTHER,
          provider: 'mistral',
          label: 'Mistral',
          modelIds: ['mistral-large'],
          qualification: {
            models: {
              'mistral-large': report('mistral-large', 'qualified', {
                web_search: false,
                passage_refs: false,
                vision: false,
              }),
            },
          },
          outsideEu: false,
        }),
      ],
      assignments: [],
    };
    // CA-1 — a failed model remains discoverable, but explicitly marked to requalify.
    for (const task of ['programme', 'course', 'gaps', 'tutor', 'light'] as const) {
      const options = optionsOf(task, fake);
      expect(
        options.some(
          (option) =>
            option.credentialId === CREDENTIAL && option.qualificationStatus === 'unqualified',
        ),
      ).toBe(true);
    }
    // The status is derived from the proven capabilities of each task.
    expect(
      optionsOf('programme', fake).find((option) => option.credentialId === OTHER)
        ?.qualificationStatus,
    ).toBe('unqualified');
    expect(
      optionsOf('light', fake).find((option) => option.credentialId === OTHER)?.qualificationStatus,
    ).toBe('unqualified');
    expect(
      optionsOf('gaps', fake).find((option) => option.credentialId === OTHER)?.qualificationStatus,
    ).toBe('qualified');
    expect(taskCapabilities('programme')).toContain('web_search');
    expect(taskCapabilities('light')).toContain('vision');
  });

  it('CA-1 — un modèle qualifié est affecté puis retiré sans supprimer la clé', async () => {
    const fake: FakeDb = { credentials: [credentialRow()], assignments: [] };
    mocks.setTaskModel.mockImplementation(
      (
        _tx: unknown,
        input: { task: AssignmentRow['task']; credentialId: string | null; modelId: string },
      ) => {
        fake.assignments = fake.assignments.filter((entry) => entry.task !== input.task);
        fake.assignments.push({
          task: input.task,
          credentialId: input.credentialId,
          modelId: input.modelId,
        });
        return Promise.resolve();
      },
    );

    const assigned = await updateAiModels(context(fake), {
      action: 'assign',
      task: 'tutor',
      credentialId: CREDENTIAL,
      modelId: MODEL,
    });
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) return;
    expect(assigned.value.tasks.find((task) => task.task === 'tutor')).toMatchObject({
      modelId: MODEL,
      credentialId: CREDENTIAL,
      outsideEu: true,
      available: true,
      unavailableReason: null,
    });
    expect(assigned.value.providers).toHaveLength(1);
    expect(assigned.value.providers[0]?.id).toBe(CREDENTIAL);

    // EF-2 — clearing a task removes its row, keeps the credential and never falls back.
    const cleared = await updateAiModels(context(fake), { action: 'clear', task: 'tutor' });
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    expect(fake.assignments).toHaveLength(0);
    expect(fake.credentials).toHaveLength(1);
    expect(cleared.value.tasks.find((task) => task.task === 'tutor')).toMatchObject({
      modelId: null,
      credentialId: null,
      available: false,
      unavailableReason: 'no_model_selected',
    });
  });

  it('CA-2 — la carte ne rend que le masque et les quatre derniers caractères', () => {
    const card = providerCardOf(credentialRow());
    expect(card.keyMasked).toBe('sk-••••••••a91F');
    expect(JSON.stringify(card)).not.toContain('sk-secret');
    expect(card.outsideEu).toBe(true);
    expect(card.status).toBe('qualified');
    // BR-IA-04 — the exact warning sentence is the one the screen renders from the flag.
    expect(card.dataNote).toBe('Ce fournisseur traite les données hors de l’Union européenne.');
    // A keyless local model has no mask at all.
    expect(
      providerCardOf(
        credentialRow({
          provider: 'local',
          keyLast4: null,
          outsideEu: false,
          qualification: { models: {} },
        }),
      ).keyMasked,
    ).toBeNull();
  });

  it('CA-2 — l’état de connexion prime sur l’ancienne qualification', () => {
    const connected = providerCardOf(
      credentialRow({
        status: 'failed',
        qualification: {
          connection: { status: 'connected' },
          models: { [MODEL]: report(MODEL, 'failed') },
        },
      }),
    );
    expect(connected.connectionStatus).toBe('connected');
    expect(connected.failure?.step).toBe('bricks');

    const unknown = providerCardOf(
      credentialRow({ status: 'untested', qualification: { models: {} } }),
    );
    expect(unknown.connectionStatus).toBe('unknown');
  });

  it('CA-3 — la compatibilité absente produit un état pending stable', () => {
    const pending = taskCompatibilityStateOf({}, CREDENTIAL, MODEL, 'tutor');
    expect(pending).toMatchObject({
      credentialId: CREDENTIAL,
      modelId: MODEL,
      task: 'tutor',
      status: 'pending',
      checkedAt: null,
    });
    const stored = {
      credentialId: CREDENTIAL,
      modelId: MODEL,
      task: 'tutor' as const,
      status: 'compatible' as const,
      checkedAt: AT,
      durationMs: 12,
      requiredCapabilities: ['tools'] as const,
      reserveCodes: [] as [],
      reasons: [] as [],
    };
    expect(
      taskCompatibilityStateOf(
        { compatibilities: { [`${CREDENTIAL}:${MODEL}:tutor`]: stored } },
        CREDENTIAL,
        MODEL,
        'tutor',
      ),
    ).toEqual(stored);
  });

  it('aucun modèle par défaut : sans choix, les cinq tâches sont indisponibles', async () => {
    const fake: FakeDb = { credentials: [credentialRow()], assignments: [] };
    const state = await getAiModelsState(context(fake));
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    expect(state.value.tasks).toHaveLength(5);
    for (const task of state.value.tasks) {
      expect(task).toMatchObject({
        modelId: null,
        credentialId: null,
        provider: null,
        available: false,
        unavailableReason: 'no_model_selected',
      });
    }
  });

  it('CL-3 — un ancien modèle failed reste affectable sans bascule', () => {
    const fake: FakeDb = {
      credentials: [
        credentialRow({
          status: 'failed',
          qualification: { models: { [MODEL]: report(MODEL, 'failed') } },
        }),
      ],
      assignments: [{ task: 'tutor', credentialId: CREDENTIAL, modelId: MODEL }],
    };
    const tutor = taskStateOf('tutor', fake.assignments[0], fake.credentials);
    expect(tutor).toMatchObject({
      available: true,
      unavailableReason: null,
      compatibility: { status: 'pending' },
    });
    expect(
      tutor.options.some(
        (option) => option.modelId === MODEL && option.qualificationStatus === 'unqualified',
      ),
    ).toBe(true);

    // A deleted key leaves `credential_id = null` with the personal model identifier.
    expect(
      taskStateOf('tutor', { task: 'tutor', credentialId: null, modelId: MODEL }, fake.credentials),
    ).toMatchObject({
      available: false,
      unavailableReason: 'credential_not_qualified',
      provider: null,
    });
    // A model that is not declared on the key is reported separately.
    expect(
      taskStateOf('tutor', { task: 'tutor', credentialId: CREDENTIAL, modelId: 'gpt-other' }, [
        credentialRow(),
      ]).unavailableReason,
    ).toBe('personal_model_missing');
  });

  it('CL-5 — l’échec conserve la carte et nomme la brique fautive', () => {
    const failed = report(MODEL, 'failed');
    expect(providerFailureOf({ models: { [MODEL]: failed }, lastRunId: failed.id })).toEqual({
      step: 'bricks',
      brickType: 'matching',
    });
    const card = providerCardOf(
      credentialRow({
        status: 'failed',
        qualification: { models: { [MODEL]: failed }, lastRunId: failed.id },
      }),
    );
    expect(card.status).toBe('unqualified');
    expect(card.failure).toEqual({ step: 'bricks', brickType: 'matching' });
    expect(providerFailureOf({ models: { [MODEL]: report(MODEL) } })).toBeNull();
  });

  it('ET-4 — une ancienne qualification en cours ne retire plus le modèle', () => {
    const pending = credentialRow({
      status: 'untested',
      qualification: { run: { status: 'running', startedAt: AT } },
    });
    expect(providerCardOf(pending).status).toBe('pending');
    expect(modelQualifiedForTask(pending, MODEL, taskCapabilities('tutor'))).toBe(true);
  });

  it('CL-1 — un corps invalide est refusé avant toute écriture', async () => {
    const fake: FakeDb = { credentials: [credentialRow()], assignments: [] };
    for (const body of [
      {},
      { action: 'assign', task: 'inconnu', modelId: MODEL },
      { action: 'assign', task: 'tutor', modelId: '' },
      { action: 'assign', task: 'tutor', modelId: MODEL },
      { action: 'assign', task: 'tutor', modelId: MODEL, credentialId: null },
      { action: 'reset' },
      { action: 'delete' },
    ]) {
      const result = await updateAiModels(context(fake), body);
      expect(result).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_FAILED', status: 400 },
      });
    }
    expect(mocks.setTaskModel).not.toHaveBeenCalled();
    expect(fake.assignments).toHaveLength(0);
    expect(() => parseModelsUpdate({ action: 'clear', task: 'tutor' })).not.toThrow();
  });

  it('CL-1 — une clé d’un autre utilisateur répond 404 sans révéler son existence', async () => {
    const fake: FakeDb = { credentials: [], assignments: [] };
    const result = await updateAiModels(context(fake), {
      action: 'assign',
      task: 'tutor',
      credentialId: CREDENTIAL,
      modelId: MODEL,
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(fake.assignments).toHaveLength(0);
  });

  it('ET-3 — le serveur accepte l’ancien failed et le rend pending', async () => {
    const failed: FakeDb = {
      credentials: [
        credentialRow({
          status: 'failed',
          qualification: { models: { [MODEL]: report(MODEL, 'failed') } },
        }),
      ],
      assignments: [],
    };
    mocks.setTaskModel.mockImplementation(
      (
        _tx: unknown,
        input: { task: AssignmentRow['task']; credentialId: string; modelId: string },
      ) => {
        failed.assignments = [{ ...input }];
        return Promise.resolve();
      },
    );
    const accepted = await updateAiModels(context(failed), {
      action: 'assign',
      task: 'tutor',
      credentialId: CREDENTIAL,
      modelId: MODEL,
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.value.tasks.find((task) => task.task === 'tutor')?.compatibility).toMatchObject(
      {
        status: 'pending',
      },
    );
    expect(failed.assignments).toHaveLength(1);

    const ready: FakeDb = { credentials: [credentialRow()], assignments: [] };
    expect(
      await updateAiModels(context(ready), {
        action: 'assign',
        task: 'tutor',
        credentialId: CREDENTIAL,
        modelId: 'gpt-other',
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });

    // A personal model identifier without its key is refused before any write.
    expect(
      await updateAiModels(context(ready), {
        action: 'assign',
        task: 'tutor',
        credentialId: null,
        modelId: 'gpt-personal-without-key',
      }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('ET-1 — l’état est ordonné et ne contient que des clés personnelles', async () => {
    const fake: FakeDb = { credentials: [credentialRow()], assignments: [] };
    const state = await getAiModelsState(context(fake));
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    expect(state.value.tasks.map((task) => task.task)).toEqual([
      'programme',
      'course',
      'gaps',
      'tutor',
      'light',
    ]);
    expect(state.value.providers.map((provider) => provider.id)).toEqual([CREDENTIAL]);
    expect(state.value.updatedAt).toBe(new Date(AT).toISOString());
  });
});
