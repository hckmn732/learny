// Jest + RNTL [SPEC-3305] — auto-évaluation de la carte de rappel (EF-3, CA-2).
import { fireEvent, render, screen } from '@testing-library/react-native';

import { RecallGrades, dueDayLabel, dueLabelFor } from '../../src/features/reviser/RecallGrades';

import { RECALL_ITEM } from './fixtures';

const NOW = new Date('2026-11-11T12:20:00.000Z');
const ZONE = 'Europe/Paris';

describe('[SPEC-3305] quatre niveaux de la carte de rappel (EF-3, CA-2)', () => {
  it('affiche Raté, Difficile, Bon et Facile avec leur échéance (CA-2)', async () => {
    await render(
      <RecallGrades
        intervals={RECALL_ITEM.intervals}
        timeZone={ZONE}
        now={NOW}
        disabled={false}
        onGrade={() => undefined}
      />,
    );

    expect(screen.getByTestId('review-grade-again')).toBeTruthy();
    expect(screen.getByTestId('review-grade-hard')).toBeTruthy();
    expect(screen.getByTestId('review-grade-good')).toBeTruthy();
    expect(screen.getByTestId('review-grade-easy')).toBeTruthy();
    expect(screen.getByText('Raté')).toBeTruthy();
    expect(screen.getByText('Difficile')).toBeTruthy();
    expect(screen.getByText('Bon')).toBeTruthy();
    expect(screen.getByText('Facile')).toBeTruthy();
    expect(screen.getByTestId('review-grade-prompt')).toHaveTextContent('Aviez-vous trouvé ?');
  });

  it('remonte le niveau choisi au parent (CA-2)', async () => {
    const onGrade = jest.fn();
    await render(
      <RecallGrades
        intervals={RECALL_ITEM.intervals}
        timeZone={ZONE}
        now={NOW}
        disabled={false}
        onGrade={onGrade}
      />,
    );

    await fireEvent.press(screen.getByTestId('review-grade-good'));

    expect(onGrade).toHaveBeenCalledWith('good');
  });

  it('verrouille les boutons pendant l’envoi (EF-3)', async () => {
    await render(
      <RecallGrades
        intervals={RECALL_ITEM.intervals}
        timeZone={ZONE}
        now={NOW}
        disabled
        onGrade={() => undefined}
      />,
    );

    const button = screen.getByTestId('review-grade-good') as {
      props: { accessibilityState?: { disabled?: boolean } };
    };
    expect(button.props.accessibilityState?.disabled).toBe(true);
  });

  it('formate l’échéance dans le fuseau de l’apprenant (BR-MEM-02)', () => {
    expect(dueDayLabel(RECALL_ITEM.intervals?.again ?? '', ZONE, NOW)).toBe('aujourd’hui');
    expect(dueDayLabel(RECALL_ITEM.intervals?.good ?? '', ZONE, NOW)).toBe('lun. 23 nov.');
    expect(dueLabelFor('good', RECALL_ITEM.intervals, ZONE, NOW)).toBe(
      'Revient lun. 23 nov. · 13:20',
    );
    expect(dueLabelFor('good', null, ZONE, NOW)).toBe('');
  });
});
