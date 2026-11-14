// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgendaSlot } from '@learny/contracts';
import { setClock } from '@learny/core';
import { createFixedClock } from '@learny/testing/clock';
import { cleanup, renderComponent, screen } from '@learny/testing/render';

import { AgendaLegend } from './AgendaLegend';
import { AgendaTotals } from './AgendaTotals';
import { MiniCalendar } from './MiniCalendar';
import { SlotBlock } from './SlotBlock';
import { SlotDetail } from './SlotDetail';
import { WeekView } from './WeekView';

setClock(createFixedClock());

function slot(input: Partial<AgendaSlot> & Pick<AgendaSlot, 'id'>): AgendaSlot {
  return {
    formationId: 'f-sap',
    moduleId: null,
    moduleNumber: null,
    kind: 'course',
    typeLabel: 'Cours',
    title: 'Séance',
    meta: null,
    date: '2026-11-11',
    startsAt: '2026-11-11T09:00:00.000Z',
    endsAt: '2026-11-11T10:00:00.000Z',
    startMinutes: 540,
    endMinutes: 600,
    status: 'planned',
    href: '/formations/f-sap',
    activityId: null,
    movable: true,
    ...input,
  };
}

afterEach(cleanup);

describe('[SPEC-704] composants agenda', () => {
  describe('SlotBlock', () => {
    it('expose le nom accessible {titre}, {type}, {jour} {horaire}, {statut} (ET-9)', () => {
      renderComponent(
        <SlotBlock
          slot={slot({
            id: 'a',
            title: 'Quiz de validation',
            kind: 'validation_quiz',
            typeLabel: 'Quiz de validation',
            status: 'planned',
          })}
          selected={false}
          mode="semaine"
          top={2}
          height={56}
          left="0%"
          width="100%"
          onSelect={() => undefined}
        />,
      );
      const button = screen.getByRole('button', {
        name: 'Quiz de validation, 09:00 – 10:00, Quiz de validation, Mercredi 11 nov., Prévu',
      });
      expect(button.getAttribute('aria-pressed')).toBe('false');
    });

    it('marque le créneau sélectionné avec aria-pressed et l’anneau (EF-6)', () => {
      renderComponent(
        <SlotBlock
          slot={slot({ id: 'a' })}
          selected
          mode="semaine"
          top={2}
          height={56}
          left="0%"
          width="100%"
          onSelect={() => undefined}
        />,
      );
      const element = screen.getByTestId('agenda-slot-a');
      expect(element.getAttribute('aria-pressed')).toBe('true');
      expect(element.style.boxShadow).toBe('rgb(17, 17, 19) 0px 0px 0px 2px');
    });

    it('affiche un créneau fait à 0,72 d’opacité et un manqué en pointillé orange avec la mention (BR-AGE-04)', () => {
      renderComponent(
        <>
          <SlotBlock
            slot={slot({ id: 'done', status: 'done' })}
            selected={false}
            mode="semaine"
            top={2}
            height={56}
            onSelect={() => undefined}
          />
          <SlotBlock
            slot={slot({ id: 'missed', status: 'missed', meta: 'Notions dues' })}
            selected={false}
            mode="semaine"
            top={100}
            height={56}
            onSelect={() => undefined}
          />
        </>,
      );
      expect(screen.getByTestId('agenda-slot-done').style.opacity).toBe('0.72');
      const missed = screen.getByTestId('agenda-slot-missed');
      expect(missed.style.border).toBe('1px dashed rgb(249, 115, 22)');
      expect(missed.textContent).toContain('Manquée');
      expect(screen.getByRole('button', { name: /Manquée$/ })).toBeTruthy();
    });

    it('utilise la couleur du type sans valeur en dur dans le composant (ET-3)', () => {
      renderComponent(
        <SlotBlock
          slot={slot({ id: 'a', kind: 'contributions', typeLabel: 'Apports' })}
          selected={false}
          mode="semaine"
          top={2}
          height={56}
          onSelect={() => undefined}
        />,
      );
      const element = screen.getByTestId('agenda-slot-a');
      expect(element.style.background).toBe('rgb(225, 244, 239)');
      expect(element.style.color).toBe('rgb(11, 92, 77)');
    });
  });

  describe('navigation clavier', () => {
    it('déplace la sélection d’un créneau à l’autre avec les flèches (ET-9)', async () => {
      const moves: (-1 | 1)[] = [];
      const { user } = renderComponent(
        <WeekView
          days={[
            { date: '2026-11-10', slots: [slot({ id: 'm1', startMinutes: 540, endMinutes: 660 })] },
            {
              date: '2026-11-11',
              slots: [
                slot({ id: 'w1', startMinutes: 540, endMinutes: 720, date: '2026-11-11' }),
                slot({ id: 'w2', startMinutes: 840, endMinutes: 900, date: '2026-11-11' }),
              ],
            },
          ]}
          today="2026-11-12"
          timezone="Europe/Paris"
          allSlots={[]}
          selectedId="w1"
          onSelect={() => undefined}
          onPickDay={() => undefined}
          onArrow={(direction) => {
            moves.push(direction);
          }}
        />,
      );
      screen.getByTestId('agenda-slot-w1').focus();
      await user.keyboard('{ArrowRight}');
      await user.keyboard('{ArrowLeft}');
      expect(moves).toEqual([1, -1]);
    });
  });

  describe('MiniCalendar', () => {
    it('affiche le mois, la période de la formation et la case du jour affiché (EF-5)', async () => {
      const onPick = vi.fn();
      const { user } = renderComponent(
        <MiniCalendar
          monthOf="2026-11-11"
          today="2026-11-11"
          date="2026-11-09"
          captionPeriod={{ start: '2026-11-02', end: '2026-12-11' }}
          highlightedDays={['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']}
          studyDays={[1, 2, 3, 4, 5]}
          bounds={{ start: '2026-11-02', end: '2026-12-11' }}
          onPick={onPick}
        />,
      );
      expect(screen.getByTestId('agenda-minical-title').textContent).toBe('Novembre 2026');
      expect(screen.getByTestId('agenda-minical-formation').textContent).toBe(
        'Formation : 2 nov. – 11 déc.',
      );
      expect(screen.getByTestId('agenda-minical-day-2026-11-09').getAttribute('aria-current')).toBe(
        'date',
      );
      expect(screen.getByTestId('agenda-minical-day-2026-11-11').getAttribute('aria-label')).toBe(
        'Mercredi 11 nov.',
      );
      await user.click(screen.getByTestId('agenda-minical-day-2026-11-12'));
      expect(onPick).toHaveBeenCalledWith('2026-11-12');
    });
  });

  describe('SlotDetail', () => {
    it('affiche le panneau sombre avec le type, le titre, l’horaire et « Ouvrir » (EF-9)', () => {
      renderComponent(
        <SlotDetail
          slot={slot({
            id: 'w2',
            title: 'Quiz de validation',
            kind: 'validation_quiz',
            typeLabel: 'Quiz de validation',
            meta: 'Tentative 2 · seuil 80 %',
            startMinutes: 840,
            endMinutes: 900,
            href: '/formations/f-sap/modules/m3/quiz',
          })}
        />,
      );
      expect(screen.getByText('Activité sélectionnée')).toBeTruthy();
      expect(screen.getByTestId('agenda-detail-type').textContent).toBe('Quiz de validation');
      expect(screen.getByTestId('agenda-detail-when').textContent).toBe(
        'Mercredi 11 nov. · 14:00 – 15:00',
      );
      expect(screen.getByTestId('agenda-detail-open').getAttribute('href')).toBe(
        '/formations/f-sap/modules/m3/quiz',
      );
    });

    it('désactive « Déplacer » pour un créneau fait, manqué ou passé (EF-9)', () => {
      const moveButton = (): HTMLButtonElement =>
        screen.getByTestId<HTMLButtonElement>('agenda-detail-move');
      const { rerender } = renderComponent(
        <SlotDetail slot={slot({ id: 'a', status: 'done', movable: false })} />,
      );
      expect(moveButton().disabled).toBe(true);
      rerender(<SlotDetail slot={slot({ id: 'a', status: 'missed', movable: false })} />);
      expect(moveButton().disabled).toBe(true);
      rerender(<SlotDetail slot={slot({ id: 'a' })} />);
      expect(moveButton().disabled).toBe(false);
    });

    it('affiche l’état sans activité et masque les actions (EF-9)', () => {
      renderComponent(<SlotDetail slot={null} />);
      expect(screen.getByText('Aucune activité sur cette période.')).toBeTruthy();
      expect(screen.queryByTestId('agenda-detail-open')).toBeNull();
    });
  });

  describe('AgendaTotals', () => {
    it('écrit les totaux de la période selon EF-11 (CA-6)', () => {
      renderComponent(
        <AgendaTotals
          slots={[
            slot({
              id: 'a',
              startsAt: '2026-11-09T08:00:00.000Z',
              endsAt: '2026-11-09T10:00:00.000Z',
              status: 'done',
            }),
            slot({ id: 'b', kind: 'buffer', status: 'planned' }),
            slot({
              id: 'c',
              startsAt: '2026-11-10T08:00:00.000Z',
              endsAt: '2026-11-10T09:30:00.000Z',
            }),
          ]}
        />,
      );
      expect(screen.getByTestId('agenda-totals-planned').textContent).toContain('3 h 30 prévues');
      expect(screen.getByTestId('agenda-totals-done').textContent).toContain('2 h faites');
      expect(screen.getByTestId('agenda-totals-margins').textContent).toBe('1 marge de rattrapage');
    });
  });

  describe('AgendaLegend', () => {
    it('affiche les six entrées de la maquette (EF-10)', () => {
      renderComponent(<AgendaLegend kindsInPeriod={['course', 'buffer']} />);
      for (const label of [
        'Apports',
        'Cours',
        'Exercice',
        'Quiz de validation',
        'Quiz global · révision',
        'Marge de rattrapage',
      ]) {
        expect(screen.getByText(label)).toBeTruthy();
      }
    });

    it('ajoute les types complémentaires présents dans la période (EF-10)', () => {
      renderComponent(<AgendaLegend kindsInPeriod={['course', 'mock_exam', 'sprint']} />);
      expect(screen.getByText('Examen blanc')).toBeTruthy();
      expect(screen.getByText('Sprint')).toBeTruthy();
      expect(screen.queryByText('Échauffement')).toBeNull();
    });
  });
});
