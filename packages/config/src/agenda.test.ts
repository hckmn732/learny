import { describe, expect, it } from 'vitest';

import {
  AGENDA_LEGEND_BASE_KINDS,
  AGENDA_SLOT_KINDS,
  AGENDA_SLOT_STYLES,
  agendaLegendLabel,
  agendaSlotLabel,
  agendaSlotStyleOf,
} from './agenda';

describe('[SPEC-704] agenda : types, libellés et couleurs (ET-3)', () => {
  it('couvre les douze types de créneaux avec les couleurs de la maquette', () => {
    expect(AGENDA_SLOT_KINDS).toHaveLength(12);
    expect(agendaSlotStyleOf('contributions').background).toBe('#E1F4EF');
    expect(agendaSlotStyleOf('course')).toMatchObject({
      background: '#ECECFC',
      text: '#2E2E8F',
    });
    expect(agendaSlotStyleOf('validation_quiz')).toMatchObject({
      background: '#FFEDE0',
      text: '#8F3305',
    });
    expect(agendaSlotStyleOf('mock_exam')).toMatchObject({
      background: '#FFEDE0',
      text: '#8F3305',
    });
    expect(agendaSlotStyleOf('global_quiz')).toMatchObject({
      background: '#F0E9FE',
      text: '#5B21B6',
    });
    expect(agendaSlotStyleOf('buffer')).toMatchObject({
      background: '#FFFFFF',
      text: '#62626B',
      border: '1px dashed #A8A7A0',
    });
    expect(agendaSlotStyleOf('weekly_review')).toMatchObject({
      background: '#F4F4F1',
      text: '#3F3F46',
    });
    expect(Object.keys(AGENDA_SLOT_STYLES).sort()).toEqual([...AGENDA_SLOT_KINDS].sort());
  });

  it('fournit les libellés de la légende (EF-10)', () => {
    expect(agendaSlotLabel('buffer')).toBe('Marge de rattrapage');
    expect(agendaLegendLabel('global_quiz')).toBe('Quiz global · révision');
    expect(agendaLegendLabel('course')).toBe('Cours');
    expect(AGENDA_LEGEND_BASE_KINDS).toEqual([
      'contributions',
      'course',
      'exercise',
      'validation_quiz',
      'global_quiz',
      'buffer',
    ]);
    expect(agendaSlotStyleOf('inconnu').label).toBe('inconnu');
  });
});
