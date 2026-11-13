// Unit tests of formation management (SPEC-618 EF-1 to EF-3, ET-2 to ET-5). The transaction, the
// planner reconciliation and the outbox are fakes: these tests pin the transition guards, the
// three-active limit, the current-formation fallback and the refreshed state, not SQL.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserDatabase } from '@learny/db';

import { TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import { archiveFormation } from './archive';
import { pauseFormation } from './pause';
import { resumeFormation } from './resume';
import { buildManagementState, type FormationRow, type ManagedRows } from './state';
import { switchCurrentFormation } from './switch-current';

const USER = '11111111-1111-4111-8111-111111111111';
const FORMATION = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const CHOSEN = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-11-11T12:20:00Z');

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  replan: vi.fn(),
}));

vi.mock('@learny/jobs', () => ({ emitAfterCommit: mocks.emit }));
vi.mock('../planning', () => ({ replanFormationAfterResume: mocks.replan }));

beforeEach(() => {
  mocks.emit.mockReset().mockResolvedValue(undefined);
  mocks.replan.mockReset().mockResolvedValue({
    created: 1,
    updated: 0,
    unchanged: 0,
    cancelled: 0,
    preserved: 0,
  });
});

function context(execute: ReturnType<typeof vi.fn>, userId: string | null = USER): ServiceContext {
  return {
    userId,
    requestId: 'req-formations-unit',
    db:
      userId === null
        ? null
        : ({
            run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }),
          } as unknown as UserDatabase),
    clock: new TestClock(NOW.toISOString()),
    logger: {} as never,
  };
}

function sequence(rows: readonly unknown[][]): ReturnType<typeof vi.fn> {
  const execute = vi.fn();
  for (const value of rows) execute.mockResolvedValueOnce(value);
  return execute;
}

function formationRow(overrides: Partial<FormationRow> = {}): FormationRow {
  return {
    id: FORMATION,
    title: 'SAP S/4HANA Finance',
    monogram: 'SAP',
    accent_color: 'green',
    status: 'active',
    last_opened_at: '2026-11-11T09:00:00Z',
    paused_at: null,
    updated_at: '2026-11-10T09:00:00Z',
    created_at: '2026-10-01T09:00:00Z',
    ...overrides,
  };
}

function profileRow(currentFormationId: string | null = FORMATION) {
  return { current_formation_id: currentFormationId, timezone: 'Europe/Paris' };
}

type ProgressRow = ManagedRows['rows'][number];

function managedRow(overrides: Partial<ProgressRow> = {}): ProgressRow {
  return {
    id: FORMATION,
    title: 'SAP S/4HANA Finance',
    monogram: 'SAP',
    accent_color: 'green',
    status: 'active',
    last_opened_at: '2026-11-11T09:00:00Z',
    created_at: '2026-10-01T09:00:00Z',
    module_count: 4,
    validated_count: 2,
    open_position: 2,
    ...overrides,
  };
}

describe('[SPEC-618] gestion des formations', () => {
  it('EF-2 — la pause écrit le statut, gèle les créneaux et émet un événement', async () => {
    const execute = sequence([
      [],
      [formationRow()],
      [],
      [],
      [],
      [],
      [profileRow(null)],
      [managedRow({ id: OTHER, title: 'Gestion de projet agile', status: 'active' })],
    ]);

    const result = await pauseFormation(context(execute), FORMATION);
    expect(result).toMatchObject({
      ok: true,
      value: {
        outcome: 'applied',
        pausedFormationId: null,
        state: { currentFormationId: OTHER, activeCount: 1 },
      },
    });
    const event = mocks.emit.mock.calls[0] as
      [unknown, string, unknown, { id: string }] | undefined;
    expect(event?.[1]).toBe('formation/paused');
    expect(event?.[2]).toMatchObject({
      userId: USER,
      formationId: FORMATION,
      pausedAt: NOW.toISOString(),
    });
    expect(event?.[3].id).toContain(`formation-paused:${FORMATION}:${NOW.toISOString()}:`);
  });

  it('EF-2 — une seconde pause est un no-op sans second événement', async () => {
    const execute = sequence([
      [],
      [formationRow({ status: 'paused' })],
      [profileRow(null)],
      [managedRow({ status: 'paused', open_position: null })],
    ]);

    const result = await pauseFormation(context(execute), FORMATION);
    expect(result).toMatchObject({ ok: true, value: { outcome: 'unchanged' } });
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('CL-2 — refuse un statut non pausable et une version obsolète', async () => {
    const anonymous = await pauseFormation(context(sequence([]), null), FORMATION);
    expect(anonymous).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });

    const missing = await pauseFormation(context(sequence([[], []])), FORMATION);
    expect(missing).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    const cadrage = await pauseFormation(
      context(sequence([[], [formationRow({ status: 'cadrage' })]])),
      FORMATION,
    );
    expect(cadrage).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: 'Cette formation ne peut pas être mise en pause.' },
    });

    const stale = await pauseFormation(context(sequence([[], [formationRow()]])), FORMATION, {
      expectedUpdatedAt: '2026-01-01T00:00:00Z',
    });
    expect(stale).toMatchObject({
      ok: false,
      error: {
        code: 'CONFLICT',
        message: 'Cette formation a changé entre-temps. Rechargez la liste.',
      },
    });
  });

  it('EF-2 — l’archive retire la formation active et choisit la remplaçante', async () => {
    const execute = sequence([
      [],
      [formationRow()],
      [],
      [],
      [],
      [],
      [profileRow(OTHER)],
      [managedRow({ id: OTHER, title: 'Gestion de projet agile' })],
    ]);

    const result = await archiveFormation(context(execute), FORMATION);
    expect(result).toMatchObject({
      ok: true,
      value: {
        outcome: 'applied',
        pausedFormationId: null,
        state: { currentFormationId: OTHER },
      },
    });
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('EF-2 — archiver une formation déjà archivée est un no-op et un cadrage est refusé', async () => {
    const unchanged = await archiveFormation(
      context(
        sequence([
          [],
          [formationRow({ status: 'archived' })],
          [profileRow(null)],
          [managedRow({ status: 'paused' })],
        ]),
      ),
      FORMATION,
    );
    expect(unchanged).toMatchObject({ ok: true, value: { outcome: 'unchanged' } });

    const refused = await archiveFormation(
      context(sequence([[], [formationRow({ status: 'cadrage' })]])),
      FORMATION,
    );
    expect(refused).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: 'Cette formation ne peut pas être archivée.' },
    });
  });

  it('EF-2/EF-3 — la reprise replanifie et choisit la formation courante', async () => {
    const execute = sequence([
      [],
      [profileRow(null)],
      [formationRow({ status: 'paused' })],
      [],
      [],
      [],
      [profileRow(FORMATION)],
      [managedRow()],
    ]);

    const result = await resumeFormation(context(execute), FORMATION);
    expect(result).toMatchObject({
      ok: true,
      value: {
        outcome: 'applied',
        pausedFormationId: null,
        state: { currentFormationId: FORMATION },
      },
    });
    expect(mocks.replan).toHaveBeenCalledWith(
      expect.anything(),
      USER,
      FORMATION,
      NOW,
      expect.anything(),
    );
    const event = mocks.emit.mock.calls[0] as
      [unknown, string, unknown, { id: string }] | undefined;
    expect(event?.[1]).toBe('formation/resumed');
    expect(event?.[2]).toMatchObject({
      userId: USER,
      formationId: FORMATION,
      resumedOn: '2026-11-11',
    });
    expect(event?.[3].id).toContain(`formation-resumed:${FORMATION}:`);
  });

  it('EF-3 — la limite renvoie `limit` sans rien écrire', async () => {
    const execute = sequence([
      [],
      [profileRow(null)],
      [formationRow({ status: 'paused' })],
      [{ id: OTHER }, { id: CHOSEN }, { id: '55555555-5555-4555-8555-555555555555' }],
      [profileRow(OTHER)],
      [managedRow({ id: OTHER })],
    ]);

    const result = await resumeFormation(context(execute), FORMATION);
    expect(result).toMatchObject({
      ok: true,
      value: { outcome: 'limit', pausedFormationId: null },
    });
    expect(mocks.replan).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('EF-3 — une reprise avec choix met la formation choisie en pause puis replanifie', async () => {
    const execute = sequence([
      [],
      [profileRow(OTHER)],
      [formationRow({ status: 'paused' })],
      [{ id: OTHER }, { id: CHOSEN }, { id: '55555555-5555-4555-8555-555555555555' }],
      [formationRow({ id: OTHER })],
      [],
      [],
      [],
      [],
      [],
      [],
      [profileRow(FORMATION)],
      [managedRow()],
    ]);

    const result = await resumeFormation(context(execute), FORMATION, {
      pauseFormationId: OTHER,
    });
    expect(result).toMatchObject({
      ok: true,
      value: { outcome: 'applied', pausedFormationId: OTHER },
    });
    expect(mocks.emit).toHaveBeenCalledTimes(2);
    expect(mocks.emit).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      'formation/paused',
      { userId: USER, formationId: OTHER, pausedAt: NOW.toISOString() },
      expect.anything(),
    );
    expect(mocks.emit).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      'formation/resumed',
      expect.objectContaining({ formationId: FORMATION }),
      expect.anything(),
    );
  });

  it('EF-3 — refuse une formation choisie qui n’est plus active', async () => {
    const result = await resumeFormation(
      context(
        sequence([
          [],
          [profileRow(null)],
          [formationRow({ status: 'paused' })],
          [{ id: OTHER }, { id: CHOSEN }, { id: '55555555-5555-4555-8555-555555555555' }],
        ]),
      ),
      FORMATION,
      { pauseFormationId: '66666666-6666-4666-8666-666666666666' },
    );
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'CONFLICT',
        message:
          'La formation choisie n’est plus active. Rechargez la liste et choisissez à nouveau.',
      },
    });
  });

  it('EF-2/CL-2 — refuse une reprise impossible, un profil absent ou une version obsolète', async () => {
    const noProfile = await resumeFormation(context(sequence([[], []])), FORMATION);
    expect(noProfile).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    const cadrage = await resumeFormation(
      context(sequence([[], [profileRow(null)], [formationRow({ status: 'cadrage' })]])),
      FORMATION,
    );
    expect(cadrage).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: 'Cette formation ne peut pas être reprise.' },
    });

    const active = await resumeFormation(
      context(
        sequence([
          [],
          [profileRow(null)],
          [formationRow({ status: 'active' })],
          [profileRow(null)],
          [managedRow()],
        ]),
      ),
      FORMATION,
    );
    expect(active).toMatchObject({ ok: true, value: { outcome: 'unchanged' } });

    const stale = await resumeFormation(
      context(sequence([[], [profileRow(null)], [formationRow({ status: 'paused' })]])),
      FORMATION,
      { expectedUpdatedAt: '2026-01-01T00:00:00Z' },
    );
    expect(stale).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  });

  it('EF-1/ET-5 — changer de formation courante vérifie qu’elle est active', async () => {
    const execute = sequence([
      [],
      [{ status: 'active' }],
      [],
      [profileRow(FORMATION)],
      [managedRow()],
    ]);
    const result = await switchCurrentFormation(context(execute), { formationId: FORMATION });
    expect(result).toMatchObject({
      ok: true,
      value: { currentFormationId: FORMATION, activeCount: 1 },
    });

    const paused = await switchCurrentFormation(context(sequence([[], [{ status: 'paused' }]])), {
      formationId: FORMATION,
    });
    expect(paused).toMatchObject({
      ok: false,
      error: {
        code: 'CONFLICT',
        message: 'Seule une formation active peut devenir la formation courante.',
      },
    });

    const missing = await switchCurrentFormation(context(sequence([[], []])), {
      formationId: FORMATION,
    });
    expect(missing).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    const anonymous = await switchCurrentFormation(context(sequence([]), null), {
      formationId: FORMATION,
    });
    expect(anonymous).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
  });

  it('EF-1 — ordonne la formation courante, les actives puis les pauses', () => {
    const rows: ProgressRow[] = [
      managedRow({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        title: 'Active A',
        last_opened_at: '2026-11-10T09:00:00Z',
      }),
      managedRow({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        title: 'Active B',
        last_opened_at: '2026-11-09T09:00:00Z',
      }),
      managedRow({
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        title: 'Pause C',
        status: 'paused',
        last_opened_at: null,
        created_at: '2026-11-08T09:00:00Z',
      }),
      managedRow({
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        title: 'Pause D',
        status: 'paused',
        last_opened_at: '2026-11-11T10:00:00Z',
      }),
      managedRow({
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        title: 'Active E',
        accent_color: 'rose',
        last_opened_at: null,
        created_at: '2026-11-11T08:00:00Z',
        module_count: 0,
        validated_count: 0,
        open_position: null,
      }),
    ];

    const state = buildManagementState({
      profile: { current_formation_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', timezone: 'UTC' },
      rows,
    });
    expect(state.currentFormationId).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(state.activeCount).toBe(3);
    expect(state.formations.map((formation) => formation.id)).toEqual([
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    ]);
    expect(state.formations[1]).toMatchObject({
      accent: 'indigo',
      progressPercent: 0,
      currentModulePosition: null,
    });
    expect(state.formations[2]).toMatchObject({ accent: 'green', progressPercent: 50 });

    const empty = buildManagementState({
      profile: { current_formation_id: null, timezone: 'UTC' },
      rows: [managedRow({ status: 'paused' })],
    });
    expect(empty.currentFormationId).toBeNull();
    expect(empty.activeCount).toBe(0);
  });
});
