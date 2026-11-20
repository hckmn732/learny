// Unit tests of the qualification persistence (SPEC-506 EF-3 to EF-5). The database, the
// qualification runner and notifications are mocks: these tests pin ownership, capabilities and
// the stop-after-two-invalid-bricks decision.
import { describe, expect, it, vi } from 'vitest';

import { TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  notify: vi.fn(),
  run: vi.fn(),
}));

vi.mock('@learny/contracts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    QualificationReport: {
      safeParse: (value: unknown) => {
        const report = value as { status?: string } | null;
        return report !== null && typeof report === 'object' && report.status !== undefined
          ? { success: true, data: report }
          : { success: false };
      },
    },
  };
});

vi.mock('@learny/db', () => ({
  aiCredentials: { id: 'id', userId: 'user_id', qualification: 'q', status: 's', modelIds: 'm' },
  aiTaskModels: { userId: 'user_id', task: 'task' },
  serviceDb: () => ({}),
}));

vi.mock('@learny/llm/qualification', () => ({ runQualification: mocks.run }));
vi.mock('@learny/notifications', () => ({ notify: mocks.notify }));

const { assignTaskModel, qualificationBrickBattery, qualifyCredential, stopAfterInvalidBrick } =
  await import('./qualify-model');

const USER = '11111111-1111-4111-8111-111111111111';
const CREDENTIAL = '22222222-2222-4222-8222-222222222222';
const AT = new Date('2026-11-11T12:20:00Z');

function context(): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-qualify',
    db: {
      run: (flow: (tx: unknown) => Promise<unknown>) =>
        flow({
          select: mocks.select,
          insert: mocks.insert,
          update: () => ({ set: () => ({ where: () => Promise.resolve(undefined) }) }),
        }),
    } as never,
    clock: new TestClock(AT.toISOString()),
    logger: {} as never,
  };
}

function credentialRow(partial: Record<string, unknown> = {}) {
  return {
    modelIds: ['model-c'],
    qualification: {
      models: {
        'model-c': {
          status: 'qualified',
          capabilities: {
            tools: true,
            structured: true,
            web_search: true,
            passage_refs: true,
            vision: true,
          },
        },
      },
    },
    status: 'qualified',
    ...partial,
  };
}

function chain(rows: unknown[]) {
  return { from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }) };
}

describe('[SPEC-506] qualification et affectation', () => {
  it('refuse un identifiant de clé ou de modèle invalide (ET-1)', async () => {
    await expect(qualifyCredential(context(), 'pas-un-uuid', 'model-c')).resolves.toMatchObject({
      ok: false,
      error: { code: 'CREDENTIAL_NOT_FOUND' },
    });
    await expect(qualifyCredential(context(), CREDENTIAL, '')).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });

    const foreignChain: Record<string, unknown> = {
      from: () => foreignChain,
      where: () => foreignChain,
      for: () => foreignChain,
      limit: () => Promise.resolve([]),
    };
    mocks.select.mockReturnValueOnce(foreignChain);
    await expect(qualifyCredential(context(), CREDENTIAL, 'model-c')).resolves.toMatchObject({
      ok: false,
      error: { code: 'CREDENTIAL_NOT_FOUND' },
    });
  });

  it('expose la batterie des treize types et refuse un type inconnu (ET-2)', () => {
    expect(qualificationBrickBattery.types).toHaveLength(13);
    expect(qualificationBrickBattery.schemaFor('text')).toBeDefined();
    expect(() => qualificationBrickBattery.schemaFor('unknown')).toThrow(/Type de brique inconnu/);
  });

  it('valide une brique d’exemple et signale une charge invalide (ET-2)', async () => {
    const valid = await qualificationBrickBattery.validate('text', {
      title: 'La comptabilité générale',
      bodyMd: 'La comptabilité générale enregistre les flux. **À retenir** : la partie double.',
      sources: [],
    });
    expect(valid.ok).toBe(true);

    const invalid = await qualificationBrickBattery.validate('text', {
      title: 'La comptabilité générale',
      bodyMd: '<strong>HTML interdit</strong>',
      sources: [],
    });
    expect(invalid.ok).toBe(false);
  });

  it('refuse une affectation invalide, une clé absente ou un modèle hors liste (EF-4)', async () => {
    const invalid = await assignTaskModel(context(), {
      task: 'tutor',
      credentialId: CREDENTIAL,
      modelId: '',
    });
    expect(invalid).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });

    mocks.select.mockReturnValueOnce(chain([]));
    const missing = await assignTaskModel(context(), {
      task: 'tutor',
      credentialId: CREDENTIAL,
      modelId: 'model-c',
    });
    expect(missing).toMatchObject({ ok: false, error: { code: 'CREDENTIAL_NOT_FOUND' } });

    mocks.select.mockReturnValueOnce(chain([credentialRow({ modelIds: [] })]));
    const absent = await assignTaskModel(context(), {
      task: 'tutor',
      credentialId: CREDENTIAL,
      modelId: 'model-c',
    });
    expect(absent).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('tolère un ancien failed et accepte une capacité non contrôlée (EF-4)', async () => {
    mocks.insert.mockReturnValue({
      values: () => ({ onConflictDoUpdate: () => Promise.resolve() }),
    });
    mocks.select.mockReturnValueOnce(
      chain([credentialRow({ qualification: { models: { 'model-c': { status: 'failed' } } } })]),
    );
    const failed = await assignTaskModel(context(), {
      task: 'tutor',
      credentialId: CREDENTIAL,
      modelId: 'model-c',
    });
    expect(failed).toMatchObject({ ok: true });

    mocks.select.mockReturnValueOnce(
      chain([
        credentialRow({
          qualification: {
            models: {
              'model-c': {
                status: 'qualified',
                capabilities: {
                  tools: true,
                  structured: false,
                  web_search: false,
                  passage_refs: false,
                  vision: false,
                },
              },
            },
          },
        }),
      ]),
    );
    const missingCapability = await assignTaskModel(context(), {
      task: 'tutor',
      credentialId: CREDENTIAL,
      modelId: 'model-c',
    });
    expect(missingCapability).toMatchObject({ ok: true });
  });

  it('affecte un modèle qualifié à une tâche (EF-4)', async () => {
    mocks.select.mockReturnValueOnce(chain([credentialRow()]));
    mocks.insert.mockReturnValue({
      values: () => ({ onConflictDoUpdate: () => Promise.resolve() }),
    });

    await expect(
      assignTaskModel(context(), {
        task: 'tutor',
        credentialId: CREDENTIAL,
        modelId: 'model-c',
      }),
    ).resolves.toEqual({
      ok: true,
      value: { task: 'tutor', credentialId: CREDENTIAL, modelId: 'model-c' },
    });
  });

  it('réessaie avant deux échecs puis arrête avec une notification (EF-5, CA-4)', async () => {
    const retry = await stopAfterInvalidBrick(context(), {
      task: 'course',
      modelId: 'model-c',
      attempts: 0,
    });
    expect(retry).toEqual({ ok: true, value: { status: 'retry', attempts: 0, remaining: 2 } });

    mocks.notify.mockResolvedValue({ ok: true });

    const stopped = await stopAfterInvalidBrick(context(), {
      task: 'course',
      modelId: 'model-c',
      attempts: 2,
    });
    expect(stopped).toMatchObject({
      ok: true,
      value: {
        status: 'stopped',
        errorCode: 'INVALID_OUTPUT',
        choices: ['personal_model'],
        notified: true,
      },
    });

    mocks.notify.mockResolvedValue({ ok: false });
    const failedNotice = await stopAfterInvalidBrick(context(), {
      task: 'course',
      modelId: 'model-c',
      attempts: 3,
    });
    expect(failedNotice).toMatchObject({
      ok: true,
      value: { choices: ['personal_model'], notified: false },
    });
  });
});
