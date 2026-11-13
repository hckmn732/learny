import { describe, expect, it } from 'vitest';

import {
  MAX_ACTIVE_FORMATIONS,
  activeFormationsForLimit,
  activeLimitDecision,
  nextCurrentFormation,
  transitionFor,
} from './active-limit';

describe('[SPEC-618] limite des formations actives', () => {
  it('autorise 0, 1 et 3 actives et exige un choix à partir de la quatrième (BR-FOR-10)', () => {
    expect(MAX_ACTIVE_FORMATIONS).toBe(3);
    expect(activeLimitDecision(0, null)).toBe('allowed');
    expect(activeLimitDecision(1, null)).toBe('allowed');
    expect(activeLimitDecision(2, null)).toBe('allowed');
    expect(activeLimitDecision(3, null)).toBe('requires-pause');
    expect(activeLimitDecision(4, null)).toBe('requires-pause');
    expect(activeLimitDecision(3, '11111111-1111-4111-8111-111111111111')).toBe(
      'allowed-with-pause',
    );
  });

  it('met en pause avant de reprendre et refuse les transitions invalides (EF-2, EF-3)', () => {
    const pause = transitionFor('active', 'pause');
    expect(pause).toEqual({ outcome: 'applied', nextStatus: 'paused' });
    const resume = transitionFor('paused', 'resume');
    expect(resume).toEqual({ outcome: 'applied', nextStatus: 'active' });

    // Idempotence : une seconde demande identique ne change rien et n’émet pas d’événement.
    expect(transitionFor('paused', 'pause')).toEqual({
      outcome: 'unchanged',
      nextStatus: 'paused',
    });
    expect(transitionFor('active', 'resume')).toEqual({
      outcome: 'unchanged',
      nextStatus: 'active',
    });
    expect(transitionFor('archived', 'archive')).toEqual({
      outcome: 'unchanged',
      nextStatus: 'archived',
    });

    // Une formation en cadrage, terminée ou archivée ne peut pas être reprise.
    expect(transitionFor('cadrage', 'resume')).toBeNull();
    expect(transitionFor('programme_proposed', 'resume')).toBeNull();
    expect(transitionFor('completed', 'resume')).toBeNull();
    expect(transitionFor('archived', 'resume')).toBeNull();
    expect(transitionFor('cadrage', 'pause')).toBeNull();
    expect(transitionFor('completed', 'archive')).toBeNull();
    expect(transitionFor('active', 'archive')).toEqual({
      outcome: 'applied',
      nextStatus: 'archived',
    });
    expect(transitionFor('paused', 'archive')).toEqual({
      outcome: 'applied',
      nextStatus: 'archived',
    });
  });

  it('choisit la dernière formation active consultée après un retrait (CL-5)', () => {
    const candidates = [
      { formationId: 'a', lastOpenedAt: '2026-11-09T10:00:00.000Z', createdAt: '2026-10-01' },
      { formationId: 'b', lastOpenedAt: '2026-11-11T08:00:00.000Z', createdAt: '2026-10-02' },
      { formationId: 'c', lastOpenedAt: null, createdAt: '2026-10-03' },
    ];
    expect(nextCurrentFormation(candidates, 'b')).toBe('a');
    expect(nextCurrentFormation(candidates, 'a')).toBe('b');
    expect(nextCurrentFormation([], 'a')).toBeNull();
  });

  it('ne propose que les formations actives dans le dialogue de limite (EF-3)', () => {
    const formations = [
      { id: 'a', status: 'active' },
      { id: 'b', status: 'paused' },
      { id: 'c', status: 'active' },
      { id: 'd', status: 'archived' },
    ];
    expect(activeFormationsForLimit(formations).map((formation) => formation.id)).toEqual([
      'a',
      'c',
    ]);
  });
});
