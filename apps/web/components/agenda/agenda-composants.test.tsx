// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AgendaSlot } from '@learny/contracts';
import { setClock } from '@learny/core';
import { createFixedClock } from '@learny/testing/clock';
import { cleanup, renderComponent, screen } from '@learny/testing/render';

import { AgendaLegend } from './AgendaLegend';
import { AgendaTotals } from './AgendaTotals';
import { DayView } from './DayView';
import { MiniCalendar } from './MiniCalendar';
import { NowLine } from './NowLine';
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

    it('termine par une ellipse le texte d’un créneau d’une heure en vue Semaine', () => {
      renderComponent(
        <SlotBlock
          slot={slot({ id: 'a', title: 'Marge de remédiation', meta: 'Si le quiz échoue' })}
          selected={false}
          mode="semaine"
          top={2}
          height={56}
          onSelect={() => undefined}
        />,
      );
      const spans = screen.getByTestId('agenda-slot-a').querySelectorAll('span');
      expect(spans).toHaveLength(3);
      for (const span of spans) expect(span.className).toContain('truncate');
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

  describe('DayView', () => {
    const daySlots = [
      slot({ id: 'warmup', kind: 'warmup', startMinutes: 830, endMinutes: 832 }),
      slot({ id: 'quiz', kind: 'validation_quiz', startMinutes: 840, endMinutes: 900 }),
      slot({ id: 'global', kind: 'global_quiz', startMinutes: 1020, endMinutes: 1050 }),
    ];

    it('positionne chaque créneau selon son heure de début et sa durée (EF-7, ET-6)', () => {
      renderComponent(
        <DayView
          date="2026-11-11"
          slots={daySlots}
          today="2026-11-11"
          timezone="Europe/Paris"
          selectedId={null}
          onSelect={() => undefined}
        />,
      );
      const quiz = screen.getByTestId('agenda-slot-quiz');
      expect(quiz.style.top).toBe('302px');
      expect(quiz.style.height).toBe('56px');
      const global = screen.getByTestId('agenda-slot-global');
      expect(global.style.top).toBe('482px');
      expect(global.style.height).toBe('26px');
      expect(screen.getByTestId('agenda-slot-warmup').style.top).toBe('292px');
      expect(quiz.className).toContain('absolute');
      expect(quiz.className).not.toContain('relative');
    });

    it('partage la largeur de deux créneaux qui se chevauchent (ET-7)', () => {
      renderComponent(
        <DayView
          date="2026-11-12"
          slots={[
            slot({ id: 'a', startMinutes: 540, endMinutes: 600, date: '2026-11-12' }),
            slot({ id: 'b', startMinutes: 570, endMinutes: 630, date: '2026-11-12' }),
          ]}
          today="2026-11-11"
          timezone="Europe/Paris"
          selectedId={null}
          onSelect={() => undefined}
        />,
      );
      const a = screen.getByTestId('agenda-slot-a');
      const b = screen.getByTestId('agenda-slot-b');
      expect(a.style.top).toBe('2px');
      expect(b.style.top).toBe('32px');
      expect(a.style.width).toBe(b.style.width);
      expect(a.style.left).not.toBe(b.style.left);
    });

    it('affiche la ligne de l’heure à 13:20 sur le jour courant seulement (EF-12, CA-2)', () => {
      const { rerender } = renderComponent(
        <DayView
          date="2026-11-11"
          slots={daySlots}
          today="2026-11-11"
          timezone="Europe/Paris"
          selectedId={null}
          onSelect={() => undefined}
        />,
      );
      expect(screen.getByTestId('agenda-now-line').style.top).toBe('260px');
      rerender(
        <DayView
          date="2026-11-12"
          slots={daySlots}
          today="2026-11-11"
          timezone="Europe/Paris"
          selectedId={null}
          onSelect={() => undefined}
        />,
      );
      expect(screen.queryByTestId('agenda-now-line')).toBeNull();
    });
  });

  describe('NowLine', () => {
    it('suit l’horloge de l’application fournie, pas celle du navigateur (EF-12)', () => {
      // 12:20Z = 13:20 à Paris : 4 h 20 après 09:00 → 260 px ; 13:01Z = 14:01 → 301 px.
      const { rerender } = renderComponent(
        <NowLine
          timezone="Europe/Paris"
          gridStartHour={9}
          gridEndHour={18}
          visible
          clock={createFixedClock('2026-11-11T12:20:00Z')}
        />,
      );
      expect(screen.getByTestId('agenda-now-line').style.top).toBe('260px');
      rerender(
        <NowLine
          timezone="Europe/Paris"
          gridStartHour={9}
          gridEndHour={18}
          visible
          clock={createFixedClock('2026-11-16T13:01:00Z')}
        />,
      );
      expect(screen.getByTestId('agenda-now-line').style.top).toBe('301px');
    });

    it('se masque hors de la plage horaire affichée', () => {
      renderComponent(
        <NowLine
          timezone="Europe/Paris"
          gridStartHour={9}
          gridEndHour={18}
          visible
          clock={createFixedClock('2026-11-11T19:30:00Z')}
        />,
      );
      expect(screen.queryByTestId('agenda-now-line')).toBeNull();
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
        screen.getByTestId<HTMLButtonElement>('slot-move');
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
