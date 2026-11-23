// Jest + RNTL [SPEC-3305] — écran de session, rail, série et encadré du tuteur (EF-1, EF-2, CA-1).
import { cleanup, fireEvent, render } from '@testing-library/react-native';

import { ReviewSession } from '../../src/features/reviser/ReviewSession';

import { MATCHING_ITEM, RECALL_ITEM, session } from './fixtures';

const NOW = new Date('2026-11-11T12:20:00.000Z');

afterEach(async () => {
  await cleanup();
});

function renderSession(overrides: Partial<Parameters<typeof ReviewSession>[0]> = {}) {
  return render(
    <ReviewSession
      session={session()}
      position={0}
      timeZone="Europe/Paris"
      now={NOW}
      online
      pending={false}
      answerError={false}
      completeError={false}
      streakDays={12}
      summary={null}
      offlineEnded={false}
      correction={undefined}
      response={undefined}
      warmup={null}
      toast={null}
      onGrade={() => undefined}
      onResponse={() => undefined}
      onSubmit={() => undefined}
      onSkip={() => undefined}
      onNext={() => undefined}
      onClose={() => undefined}
      onUndo={() => undefined}
      onHome={() => undefined}
      {...overrides}
    />,
  );
}

describe('[SPEC-3305] session du jour (EF-1, EF-2, CA-1)', () => {
  it('affiche l’en-tête, la progression, le rail et la carte (CA-1)', async () => {
    const view = await renderSession();

    expect(await view.findByTestId('review-screen')).toBeTruthy();
    expect(view.getByTestId('review-title')).toHaveTextContent('Quiz global');
    expect(view.getByTestId('review-progress')).toHaveTextContent('Notion 1 sur 14');
    expect(view.getByTestId('review-rail')).toBeTruthy();
    expect(view.getByTestId('review-rail-0')).toBeTruthy();
    expect(view.getByTestId('review-card')).toBeTruthy();
    expect(view.getByText('Que définit une variante d’exercice comptable ?')).toBeTruthy();
    expect(view.getByTestId('review-streak')).toBeTruthy();
    expect(view.getByText('Série de 12 jours')).toBeTruthy();
    expect(view.getByTestId('review-tutor-note')).toBeTruthy();
    expect(view.getByText(/Le tuteur a reporté 4 notions à jeudi/)).toBeTruthy();
  });

  it('remonte le niveau de la carte et verrouille l’envoi (EF-3)', async () => {
    const onGrade = jest.fn();
    const view = await renderSession({ onGrade });

    await fireEvent.press(view.getByTestId('review-grade-easy'));

    expect(onGrade).toHaveBeenCalledWith('easy');
  });

  it('propose Suivant et Passer pour un jeu corrigé par le serveur (EF-2)', async () => {
    const onSkip = jest.fn();
    const onNext = jest.fn();
    const view = await renderSession({ position: 1, onSkip, onNext });

    expect(await view.findByTestId('review-rail-1')).toBeTruthy();
    await fireEvent.press(view.getByTestId('review-skip'));
    await fireEvent.press(view.getByTestId('review-next'));

    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('affiche « Terminer la session » au dernier jeu (EF-2)', async () => {
    const one = session({ items: [MATCHING_ITEM] });
    const view = await renderSession({ session: one, position: MATCHING_ITEM.position });

    expect(await view.findByText('Terminer la session')).toBeTruthy();
  });

  it('propose l’échauffement en tête quand il reste à faire (EF-1)', async () => {
    const onOpen = jest.fn();
    const view = await renderSession({ warmup: { count: 3, onOpen } });

    await fireEvent.press(await view.findByTestId('review-warmup-card'));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(view.getByText('Échauffement · 3 questions')).toBeTruthy();
  });

  it('bascule sur l’écran de fin au résumé du serveur (EF-4)', async () => {
    const view = await renderSession({
      summary: {
        reviewedCount: 5,
        minutes: 9,
        okCount: 4,
        soonCount: 1,
        streakDays: 13,
        nextSessionAt: '2026-11-12T16:00:00.000Z',
      },
    });

    expect(await view.findByTestId('review-end')).toBeTruthy();
    expect(view.queryByTestId('review-card')).toBeNull();
    expect(view.getByTestId('review-end-title')).toHaveTextContent('5 notions revues en 9 minutes');
  });

  it('signale une erreur d’envoi sans perdre la session (EF-6)', async () => {
    const view = await renderSession({ answerError: true, pending: true });

    expect(await view.findByTestId('review-answer-error')).toBeTruthy();
  });

  it('reste utilisable avec la carte de rappel seule (accessibilité)', async () => {
    const view = await renderSession({ session: session({ items: [RECALL_ITEM] }) });

    expect((await view.findByTestId('review-close')).props.accessibilityLabel).toBeDefined();
    expect(view.getByTestId('review-grade-good').props.accessibilityLabel).toContain('Bon');
  });
});
