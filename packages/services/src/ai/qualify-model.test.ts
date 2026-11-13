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
  serviceSelect: vi.fn(),
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
  subscriptions: { userId: 'user_id', status: 'status', currentPeriodEnd: 'end' },
  serviceDb: () => ({ select: mocks.serviceSelect }),
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
    modelIds: ['claude-haiku-5-5'],
    qualification: {
      models: {
        'claude-haiku-5-5': {
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
    await expect(
      qualifyCredential(context(), 'pas-un-uuid', 'claude-haiku-5-5'),
    ).resolves.toMatchObject({
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
    await expect(
      qualifyCredential(context(), CREDENTIAL, 'claude-haiku-5-5'),
    ).resolves.toMatchObject({ ok: false, error: { code: 'CREDENTIAL_NOT_FOUND' } });
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
      modelId: 'claude-haiku-5-5',
    });
    expect(missing).toMatchObject({ ok: false, error: { code: 'CREDENTIAL_NOT_FOUND' } });

    mocks.select.mockReturnValueOnce(chain([credentialRow({ modelIds: [] })]));
    const absent = await assignTaskModel(context(), {
      task: 'tutor',
      credentialId: CREDENTIAL,
      modelId: 'claude-haiku-5-5',
    });
    expect(absent).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('refuse un modèle non qualifié ou une capacité manquante (EF-4)', async () => {
    mocks.select.mockReturnValueOnce(
      chain([
        credentialRow({ qualification: { models: { 'claude-haiku-5-5': { status: 'failed' } } } }),
      ]),
    );
    const failed = await assignTaskModel(context(), {
      task: 'tutor',
      credentialId: CREDENTIAL,
      modelId: 'claude-haiku-5-5',
    });
    expect(failed).toMatchObject({ ok: false, error: { code: 'AI_MODEL_NOT_QUALIFIED' } });

    mocks.select.mockReturnValueOnce(
      chain([
        credentialRow({
          qualification: {
            models: {
              'claude-haiku-5-5': {
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
      modelId: 'claude-haiku-5-5',
    });
    expect(missingCapability).toMatchObject({
      ok: false,
      error: { code: 'AI_MODEL_NOT_QUALIFIED' },
    });
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
        modelId: 'claude-haiku-5-5',
      }),
    ).resolves.toEqual({
      ok: true,
      value: { task: 'tutor', credentialId: CREDENTIAL, modelId: 'claude-haiku-5-5' },
    });
  });

  it('réessaie avant deux échecs puis arrête avec une notification (EF-5, CA-4)', async () => {
    const retry = await stopAfterInvalidBrick(context(), {
      task: 'course',
      modelId: 'claude-haiku-5-5',
      attempts: 0,
    });
    expect(retry).toEqual({ ok: true, value: { status: 'retry', attempts: 0, remaining: 2 } });

    mocks.serviceSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              {
                status: 'active',
                currentPeriodEnd: new Date('2026-12-01T00:00:00Z'),
              },
            ]),
        }),
      }),
    });
    mocks.notify.mockResolvedValue({ ok: true });

    const stopped = await stopAfterInvalidBrick(context(), {
      task: 'course',
      modelId: 'claude-haiku-5-5',
      attempts: 2,
    });
    expect(stopped).toMatchObject({
      ok: true,
      value: {
        status: 'stopped',
        errorCode: 'INVALID_OUTPUT',
        choices: ['personal_model', 'managed_ai'],
        notified: true,
        managedCalls: 0,
      },
    });

    mocks.serviceSelect.mockReturnValue({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });
    mocks.notify.mockResolvedValue({ ok: false });
    const withoutManaged = await stopAfterInvalidBrick(context(), {
      task: 'course',
      modelId: 'claude-haiku-5-5',
      attempts: 3,
    });
    expect(withoutManaged).toMatchObject({
      ok: true,
      value: { choices: ['personal_model'], notified: false },
    });
  });
});
