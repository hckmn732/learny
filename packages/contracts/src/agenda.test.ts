import { describe, expect, it } from 'vitest';

import { AGENDA_MAX_RANGE_DAYS, AgendaDto, AgendaQuery, agendaGet } from './agenda';

describe('[SPEC-704] agenda : contrats', () => {
  it('accepte une fenêtre civile valide et fournit des valeurs par défaut lisibles', () => {
    const parsed = AgendaQuery.safeParse({
      from: '2026-11-09',
      to: '2026-11-13',
      formation: 'all',
    });
    expect(parsed.success).toBe(true);
    expect(agendaGet.method).toBe('GET');
    expect(agendaGet.path).toBe('/api/v1/agenda');
    expect(agendaGet.errors).toContain('NOT_FOUND');
    expect(AGENDA_MAX_RANGE_DAYS).toBe(42);
  });

  it('refuse une fenêtre inversée ou de plus de 42 jours', () => {
    expect(
      AgendaQuery.safeParse({ from: '2026-11-13', to: '2026-11-09', formation: 'all' }).success,
    ).toBe(false);
    expect(
      AgendaQuery.safeParse({ from: '2026-11-01', to: '2026-12-15', formation: 'all' }).success,
    ).toBe(false);
    expect(
      AgendaQuery.safeParse({ from: '2026-11-01', to: '2026-11-15', formation: 'pas-un-uuid' })
        .success,
    ).toBe(false);
  });

  it('valide un DTO complet et refuse les statuts masqués (BR-AGE-04)', () => {
    const dto = {
      timezone: 'Europe/Paris',
      today: '2026-11-11',
      currentFormationId: '7f6c2b0e-1f2a-4c3d-8e9f-0a1b2c3d4e5f',
      bounds: { start: '2026-11-02', end: '2026-12-11' },
      captionPeriod: { start: '2026-11-02', end: '2026-12-11' },
      studyDays: [1, 2, 3, 4, 5],
      formations: [
        {
          id: '7f6c2b0e-1f2a-4c3d-8e9f-0a1b2c3d4e5f',
          title: 'SAP',
          sigle: 'SAP',
          status: 'active',
        },
      ],
      slots: [
        {
          id: '8a6c2b0e-1f2a-4c3d-8e9f-0a1b2c3d4e5f',
          formationId: '7f6c2b0e-1f2a-4c3d-8e9f-0a1b2c3d4e5f',
          moduleId: null,
          moduleNumber: null,
          kind: 'validation_quiz',
          typeLabel: 'Quiz de validation',
          title: 'Quiz de validation',
          meta: 'Tentative 2 · seuil 80 %',
          date: '2026-11-11',
          startsAt: '2026-11-11T13:00:00.000Z',
          endsAt: '2026-11-11T14:00:00.000Z',
          startMinutes: 840,
          endMinutes: 900,
          status: 'planned',
          href: '/formations/7f6c2b0e-1f2a-4c3d-8e9f-0a1b2c3d4e5f/modules/3/quiz',
          activityId: null,
          movable: true,
        },
      ],
      totals: { plannedMinutes: 60, doneMinutes: 0, marginsRemaining: 0 },
    };
    expect(AgendaDto.safeParse(dto).success).toBe(true);
    expect(
      AgendaDto.safeParse({ ...dto, slots: [{ ...dto.slots[0], status: 'cancelled' }] }).success,
    ).toBe(false);
    expect(
      AgendaDto.safeParse({ ...dto, slots: [{ ...dto.slots[0], endMinutes: 1440 }] }).success,
    ).toBe(false);
  });
});
