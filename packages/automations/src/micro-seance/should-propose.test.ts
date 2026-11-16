import { describe, expect, it } from 'vitest';

import { shouldProposeMicroSession, type MicroProposalInput } from './should-propose';

const WEDNESDAY = '2026-11-11';
const BASE: MicroProposalInput = {
  today: WEDNESDAY,
  studyDays: [1, 2, 3, 4, 5],
  dailyActivity: null,
  slotsToday: [],
  currentFormationId: 'formation-current',
  candidates: [
    { formationId: 'formation-current', lastOpenedAt: '2026-10-01T08:00:00Z', microItemCount: 3 },
    { formationId: 'formation-recent', lastOpenedAt: '2026-11-10T08:00:00Z', microItemCount: 2 },
  ],
};

describe('[SPEC-713] micro-séance — condition de déclenchement (EF-2)', () => {
  it('propose la formation courante quand elle a une micro-séance non vide', () => {
    const decision = shouldProposeMicroSession(BASE);
    expect(decision.propose).toBe(true);
    expect(decision.formationId).toBe('formation-current');
    expect(decision.notionCount).toBe(3);
  });

  it('retient la formation active ouverte le plus récemment si la courante est vide', () => {
    const decision = shouldProposeMicroSession({
      ...BASE,
      currentFormationId: 'formation-current',
      candidates: [
        {
          formationId: 'formation-current',
          lastOpenedAt: '2026-11-11T08:00:00Z',
          microItemCount: 0,
        },
        { formationId: 'formation-old', lastOpenedAt: '2026-10-01T08:00:00Z', microItemCount: 2 },
        {
          formationId: 'formation-recent',
          lastOpenedAt: '2026-11-10T08:00:00Z',
          microItemCount: 1,
        },
      ],
    });
    expect(decision.propose).toBe(true);
    expect(decision.formationId).toBe('formation-recent');
  });

  it('CL-5 — une activité qualifiante faite le jour empêche la proposition', () => {
    expect(shouldProposeMicroSession({ ...BASE, dailyActivity: { qualifying: true } }).reason).toBe(
      'already_active',
    );
  });

  it('CL-5 — un créneau du jour terminé empêche la proposition', () => {
    expect(shouldProposeMicroSession({ ...BASE, slotsToday: [{ status: 'done' }] }).reason).toBe(
      'already_active',
    );
    expect(
      shouldProposeMicroSession({ ...BASE, slotsToday: [{ status: 'planned' }] }).propose,
    ).toBe(true);
  });

  it('CL-9 — un jour hors du rythme ne propose rien', () => {
    expect(shouldProposeMicroSession({ ...BASE, studyDays: [1, 2, 4, 5] }).reason).toBe(
      'study_day',
    );
    expect(
      shouldProposeMicroSession({ ...BASE, today: '2026-11-14', studyDays: [1, 2, 3, 4, 5] })
        .propose,
    ).toBe(false);
  });

  it('CL-10 — aucune notion à réviser : aucun candidat', () => {
    const decision = shouldProposeMicroSession({
      ...BASE,
      candidates: [{ formationId: 'formation-current', lastOpenedAt: null, microItemCount: 0 }],
    });
    expect(decision).toMatchObject({ propose: false, formationId: null, reason: 'no_candidate' });
  });
});
