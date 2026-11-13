// Unit tests of the programme GET routes (SPEC-605 ET-1, ET-5). The transaction and the
// owner-role client are fakes: these tests pin the version query and the page read.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FORMATION,
  USER,
  context,
  formationRow,
  profileRow,
  proposalRow,
  sequence,
} from '../../test/support/programme';

import { getProgrammePageState, getProgrammeState } from './get';
import { getProgrammeScreenState } from './get-active-programme';

const mocks = vi.hoisted(() => {
  const serviceExecute = vi.fn();
  return {
    serviceExecute,
    serviceDb: vi.fn(() => ({ execute: serviceExecute })),
  };
});

vi.mock('@learny/db', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  serviceDb: mocks.serviceDb,
}));

beforeEach(() => {
  mocks.serviceExecute.mockReset().mockResolvedValue([]);
});

describe('[SPEC-605] lecture du programme', () => {
  it('ET-1 — renvoie l’état courant de la formation', async () => {
    const execute = sequence([
      [formationRow({ status: 'programme_proposed' })],
      [proposalRow({ version: 1 })],
      [{ count: 0 }],
    ]);

    const result = await getProgrammeState(context(execute), FORMATION);
    expect(result).toMatchObject({
      ok: true,
      value: {
        formationId: FORMATION,
        formationStatus: 'programme_proposed',
        cadrageCompleted: false,
        proposal: { version: 1 },
      },
    });
  });

  it('ET-5 — la version demandée est transmise à la lecture', async () => {
    const execute = sequence([
      [formationRow({ status: 'programme_proposed' })],
      [proposalRow({ version: 2 }), proposalRow({ version: 1 })],
      [{ count: 0 }],
    ]);

    const result = await getProgrammeState(context(execute), FORMATION, { version: '1' });
    expect(result).toMatchObject({ ok: true, value: { proposal: { version: 1 } } });
  });

  it('ET-1 — la page serveur lit le même état sans requête de version', async () => {
    const execute = sequence([
      [formationRow({ status: 'programme_proposed' })],
      [proposalRow({ version: 1 })],
      [{ count: 0 }],
    ]);

    const result = await getProgrammePageState(context(execute), FORMATION);
    expect(result.ok && result.value.proposal?.version).toBe(1);
  });

  it('SPEC-606 — refuse un identifiant invalide sans transaction', async () => {
    const execute = sequence([]);

    await expect(getProgrammeScreenState(context(execute), 'pas-un-uuid')).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('SPEC-606 — refuse un programme actif sans module', async () => {
    const execute = sequence([[formationRow({ status: 'active' })], [profileRow()], [], []]);

    await expect(getProgrammeScreenState(context(execute), FORMATION)).resolves.toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', detail: 'Aucun module n’est planifié pour ce programme.' },
    });
  });

  it('refuse un appelant anonyme et une version invalide', async () => {
    const anonymous = await getProgrammeState(context(sequence([]), null), FORMATION);
    expect(anonymous).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });

    await expect(
      getProgrammeState(context(sequence([]), USER), FORMATION, { version: 0 }),
    ).rejects.toThrow();
  });
});
