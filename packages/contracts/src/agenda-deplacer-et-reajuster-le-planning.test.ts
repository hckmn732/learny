import { describe, expect, it } from 'vitest';

import type { AgendaDto } from './agenda';
import {
  agendaReplanRoutes,
  BlockedModule,
  ReplanApplyInput,
  ReplanOptionsDto,
  ReplanOutput,
  SlotAlternativesDto,
  SlotMoveInput,
  SlotMoveOutput,
} from './agenda-deplacer-et-reajuster-le-planning';

const FORMATION = '7f6c2b0e-1f2a-4c3d-8e9f-0a1b2c3d4e5f';
const MODULE = '9a6c2b0e-1f2a-4c3d-8e9f-0a1b2c3d4e5f';
const SLOT = '8a6c2b0e-1f2a-4c3d-8e9f-0a1b2c3d4e5f';

function agenda(): AgendaDto {
  return {
    timezone: 'Europe/Paris',
    today: '2026-11-11',
    currentFormationId: FORMATION,
    bounds: { start: '2026-11-02', end: '2026-12-11' },
    captionPeriod: { start: '2026-11-02', end: '2026-12-11' },
    studyDays: [1, 2, 3, 4, 5],
    formations: [{ id: FORMATION, title: 'SAP', sigle: 'SAP', status: 'active' }],
    slots: [
      {
        id: SLOT,
        formationId: FORMATION,
        moduleId: MODULE,
        moduleNumber: 3,
        kind: 'validation_quiz',
        typeLabel: 'Quiz de validation',
        title: 'Quiz de validation',
        meta: null,
        date: '2026-11-11',
        startsAt: '2026-11-11T13:00:00.000Z',
        endsAt: '2026-11-11T14:00:00.000Z',
        startMinutes: 840,
        endMinutes: 900,
        status: 'planned',
        href: `/formations/${FORMATION}/modules/${MODULE}/quiz`,
        activityId: null,
        movable: true,
      },
    ],
    totals: { plannedMinutes: 60, doneMinutes: 0, marginsRemaining: 0 },
    blockedModule: {
      formationId: FORMATION,
      moduleId: MODULE,
      moduleNumber: 3,
      title: 'Comptabilité générale',
      reason: 'delayed',
    },
  };
}

const alternative = {
  date: '2026-11-16',
  startsAt: '2026-11-16T09:00:00.000Z',
  endsAt: '2026-11-16T10:00:00.000Z',
  startMinutes: 600,
  endMinutes: 660,
  moment: 'matin' as const,
  reasons: ['Jour d’étude', 'Créneau libre'],
};

describe('[SPEC-705] contrats du déplacement et du réajustement', () => {
  it('publie les quatre routes documentées (ET-3, ET-4)', () => {
    expect(agendaReplanRoutes.slotAlternativesGet).toMatchObject({
      method: 'GET',
      path: '/api/v1/slots/:sid/alternatives',
      auth: 'user',
    });
    expect(agendaReplanRoutes.slotMove).toMatchObject({
      method: 'POST',
      path: '/api/v1/slots/:sid/move',
      idempotent: true,
    });
    expect(agendaReplanRoutes.formationReplanOptions.path).toBe(
      '/api/v1/formations/:fid/replan-options',
    );
    expect(agendaReplanRoutes.formationReplan.idempotent).toBe(true);
    expect(agendaReplanRoutes.slotMove.errors).toContain('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('accepte trois alternatives au plus et refuse une raison vide (EF-1)', () => {
    const valid = {
      slotId: SLOT,
      version: 'slot-1234567890abcdef',
      timezone: 'Europe/Paris',
      durationMinutes: 60,
      day: '2026-11-11',
      alternatives: [alternative, { ...alternative, startsAt: '2026-11-17T09:00:00.000Z' }],
    };
    expect(SlotAlternativesDto.safeParse(valid).success).toBe(true);
    expect(
      SlotAlternativesDto.safeParse({
        ...valid,
        alternatives: [alternative, alternative, alternative, alternative],
      }).success,
    ).toBe(false);
    expect(
      SlotAlternativesDto.safeParse({
        ...valid,
        alternatives: [{ ...alternative, reasons: [] }],
      }).success,
    ).toBe(false);
    expect(
      SlotAlternativesDto.safeParse({
        ...valid,
        alternatives: [{ ...alternative, moment: 'nuit' }],
      }).success,
    ).toBe(false);
  });

  it('refuse un déplacement sans fin postérieure ou sans version (CL-1, CL-2)', () => {
    expect(
      SlotMoveInput.safeParse({
        expectedVersion: 'slot-1234567890abcdef',
        startsAt: '2026-11-16T09:00:00.000Z',
        endsAt: '2026-11-16T10:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      SlotMoveInput.safeParse({
        expectedVersion: 'slot-1234567890abcdef',
        startsAt: '2026-11-16T10:00:00.000Z',
        endsAt: '2026-11-16T09:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(SlotMoveInput.safeParse({ startsAt: 'invalide', endsAt: 'invalide' }).success).toBe(
      false,
    );
  });

  it('valide la réponse du déplacement avec l’agenda recalculé (ET-3)', () => {
    expect(
      SlotMoveOutput.safeParse({
        movedSlot: agenda().slots[0],
        replacedSlotId: SLOT,
        version: 'slot-1234567890abcdef',
        explanation: 'Activité déplacée au 2026-11-16 10:00.',
        agenda: agenda(),
      }).success,
    ).toBe(true);
    expect(
      SlotMoveOutput.safeParse({
        movedSlot: agenda().slots[0],
        replacedSlotId: SLOT,
        version: '',
        explanation: 'x',
        agenda: agenda(),
      }).success,
    ).toBe(false);
  });

  it('valide les trois options BR-FOR-14 et le module bloqué (EF-2)', () => {
    const blocked = BlockedModule.parse(agenda().blockedModule);
    expect(blocked.reason).toBe('delayed');
    const options = {
      formationId: FORMATION,
      planVersion: 'plan-1234567890abcdef',
      blocked,
      currentEndDate: '2026-12-11',
      currentHoursPerDay: 5,
      options: [
        {
          kind: 'shift_end',
          feasible: true,
          reason: null,
          currentEndDate: '2026-12-11',
          projectedEndDate: '2026-12-13',
          extraDays: 2,
          currentHoursPerDay: 5,
          newHoursPerDay: null,
          removedMinutes: null,
        },
        {
          kind: 'increase_volume',
          feasible: false,
          reason: 'Capacité insuffisante.',
          currentEndDate: '2026-12-11',
          projectedEndDate: null,
          extraDays: null,
          currentHoursPerDay: 5,
          newHoursPerDay: 6,
          removedMinutes: null,
        },
        {
          kind: 'lighten',
          feasible: true,
          reason: null,
          currentEndDate: '2026-12-11',
          projectedEndDate: '2026-12-11',
          extraDays: null,
          currentHoursPerDay: 5,
          newHoursPerDay: null,
          removedMinutes: 129,
        },
      ],
    };
    expect(ReplanOptionsDto.safeParse(options).success).toBe(true);
    expect(
      ReplanOptionsDto.safeParse({ ...options, options: [...options.options, options.options[0]] })
        .success,
    ).toBe(false);
    expect(
      ReplanOptionsDto.safeParse({ ...options, blocked: { ...blocked, reason: 'inconnu' } })
        .success,
    ).toBe(false);
  });

  it('accepte un choix explicite et refuse un choix inconnu (ET-4)', () => {
    expect(
      ReplanApplyInput.safeParse({
        choice: 'shift_end',
        expectedPlanVersion: 'plan-1234567890abcdef',
      }).success,
    ).toBe(true);
    expect(
      ReplanApplyInput.safeParse({ choice: 'tout', expectedPlanVersion: 'plan-1' }).success,
    ).toBe(false);
    expect(ReplanApplyInput.safeParse({ choice: 'lighten' }).success).toBe(false);
  });

  it('décrit un résultat appliqué, inchangé ou en attente d’accord (BR-AUT-11)', () => {
    const output = {
      outcome: 'consent_required',
      formationId: FORMATION,
      planVersion: 'plan-1234567890abcdef',
      explanation: 'Le programme est allégé de 129 min ; votre accord est requis.',
      endDate: '2026-12-11',
      hoursPerDay: 5,
      consentActionId: FORMATION,
    };
    expect(ReplanOutput.safeParse(output).success).toBe(true);
    expect(ReplanOutput.safeParse({ ...output, outcome: 'refusé' }).success).toBe(false);
    expect(
      ReplanOutput.safeParse({ ...output, endDate: null, consentActionId: null }).success,
    ).toBe(true);
  });
});
