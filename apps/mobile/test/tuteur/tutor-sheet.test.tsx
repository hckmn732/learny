// Jest + RNTL [SPEC-3303] — feuille du tuteur : fil, rendu incrémental, sources, suites,
// interruption, contexte, Teste-moi, carte et accessibilité (CA-1, CA-4, CA-5, ET-5, EF-3, EF-7).
//
// The sheet is rendered from a snapshot; the controller is proved separately (Vitest). The tests
// pin the incremental rendering (typing, then the fragments) and every action the learner can take
// without a device.
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { AutomationActionItem } from '@learny/contracts';

import { TutorSheet } from '../../src/features/tuteur/TutorSheet';
import { expectAccessible } from '../utils/expectAccessible';

import { HANDLERS, snapshotOf, tutorMessage } from './fixtures';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

function renderSheet(element: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>);
}

const CARD: AutomationActionItem = {
  id: 'a-card',
  automation: 'questions_cartes',
  kind: 'card_created',
  summary: 'Question devenue carte',
  formationId: null,
  payload: {
    conversationId: 'c-1',
    question: 'Pourquoi deux dates sur une pièce ?',
    answer: 'La date de pièce fixe la période comptable.',
    notionLabel: 'Date de pièce',
    sourceLabel: 'Chapitre 2 · L’en-tête de pièce',
  },
  undoPayload: null,
  requiresConsent: true,
  status: 'pending_consent',
  decidedAt: null,
  createdAt: '2026-11-11T12:20:00.000Z',
};

describe('[SPEC-3303] feuille du tuteur : fil et rendu incrémental', () => {
  it('affiche l’historique, les sources et les suites (CA-1, BR-TUT-03)', async () => {
    const view = await renderSheet(
      <TutorSheet
        state={snapshotOf()}
        subtitle="Comptabilité générale · chapitre 2"
        online
        {...HANDLERS}
      />,
    );
    expect(view.getByTestId('tutor-sheet')).toBeTruthy();
    expect(view.getByTestId('tutor-title')).toHaveTextContent('Tuteur');
    expect(view.getByTestId('tutor-subtitle')).toHaveTextContent(
      'Comptabilité générale · chapitre 2',
    );
    expect(view.getByTestId('tutor-message-0')).toBeTruthy();
    expect(view.getByText('Pourquoi deux dates sur une pièce ?')).toBeTruthy();
    expect(view.getByTestId('tutor-message-1-markdown')).toBeTruthy();
    expect(view.getByTestId('tutor-source-0')).toHaveTextContent('Chapitre 2 · L’en-tête de pièce');
    expect(view.getByTestId('tutor-follow-up-0')).toHaveTextContent('Un exemple concret');
    expect(view.getByTestId('tutor-footnote')).toHaveTextContent(/Le tuteur cite ses sources/);
    expect(view.getByTestId('tutor-context-count')).toHaveTextContent('Contexte · 3 éléments');
  });

  it('affiche l’indicateur de frappe puis le texte fragment par fragment (EF-3, CA-1)', async () => {
    const typing = snapshotOf({
      messages: [],
      turn: { status: 'typing', text: '', sources: [], followUps: [], selfTest: null, code: null },
      busy: true,
    });
    const view = await renderSheet(
      <TutorSheet state={typing} subtitle="Cours" online {...HANDLERS} />,
    );
    expect(view.getByTestId('tutor-typing')).toBeTruthy();
    expect(view.getByTestId('tutor-input')).toBeTruthy();

    const streaming = snapshotOf({
      messages: [],
      turn: {
        status: 'streaming',
        text: 'La date de pièce fixe la période',
        sources: [],
        followUps: [],
        selfTest: null,
        code: null,
      },
      busy: true,
    });
    await view.rerender(
      <SafeAreaProvider initialMetrics={METRICS}>
        <TutorSheet state={streaming} subtitle="Cours" online {...HANDLERS} />
      </SafeAreaProvider>,
    );
    expect(view.queryByTestId('tutor-typing')).toBeNull();
    expect(view.getByTestId('tutor-live-markdown')).toHaveTextContent(
      'La date de pièce fixe la période',
    );
    // Pendant le flux, l'envoi laisse la place à « Arrêter » (EF-5).
    expect(view.queryByTestId('tutor-send')).toBeNull();
    expect(view.getByTestId('tutor-stop')).toBeTruthy();
  });

  it('annonce la réponse une fois complète seulement (ET-5)', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    announce.mockClear();
    await renderSheet(<TutorSheet state={snapshotOf()} subtitle="Cours" online {...HANDLERS} />);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('La réponse du tuteur est complète.');
    announce.mockRestore();
  });

  it('conserve le texte partiel d’une réponse interrompue et propose « Réessayer » (CA-4)', async () => {
    const onRetry = jest.fn();
    const interrupted = snapshotOf({
      messages: [
        tutorMessage({ id: 'm-cut', text: 'La date de pièce', interrupted: true, sources: [] }),
      ],
    });
    const view = await renderSheet(
      <TutorSheet state={interrupted} subtitle="Cours" online {...HANDLERS} onRetry={onRetry} />,
    );
    expect(view.getByTestId('tutor-interrupted')).toHaveTextContent(/Réponse interrompue/);
    expect(view.getByTestId('tutor-message-0-markdown')).toHaveTextContent('La date de pièce');
    await fireEvent.press(view.getByTestId('tutor-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('[SPEC-3303] feuille du tuteur : actions et états', () => {
  it('ouvre la fiche du contexte et retire un élément (CA-5)', async () => {
    const onToggleContext = jest.fn();
    const view = await renderSheet(
      <TutorSheet
        state={snapshotOf()}
        subtitle="Cours"
        online
        {...HANDLERS}
        onToggleContext={onToggleContext}
      />,
    );
    await fireEvent.press(view.getByTestId('tutor-context'));
    await waitFor(() => {
      expect(view.getByTestId('tutor-context-sheet')).toBeTruthy();
    });
    expect(view.getByTestId('tutor-context-chapter')).toBeTruthy();
    await fireEvent(view.getByTestId('tutor-context-switch-chapter'), 'valueChange', false);
    expect(onToggleContext).toHaveBeenCalledWith('chapter');
  });

  it('crée une carte après confirmation, en mode « avec ma confirmation » (CA-3, BR-AUT-06)', async () => {
    const onCreateCard = jest.fn(() => Promise.resolve(true));
    const view = await renderSheet(
      <TutorSheet
        state={snapshotOf({ card: CARD })}
        subtitle="Cours"
        online
        {...HANDLERS}
        onCreateCard={onCreateCard}
      />,
    );
    await fireEvent.press(view.getByTestId('tutor-create-card'));
    await waitFor(() => {
      expect(view.getByTestId('tutor-card-sheet')).toBeTruthy();
    });
    expect(view.getByTestId('tutor-card-question')).toHaveTextContent(
      'Pourquoi deux dates sur une pièce ?',
    );
    await fireEvent.press(view.getByTestId('tutor-card-confirm'));
    await waitFor(() => {
      expect(onCreateCard).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(view.getByTestId('tutor-toast')).toHaveTextContent(
        /Carte créée · elle reviendra dans le quiz global/,
      );
    });
  });

  it('affiche l’erreur d’un modèle non configuré et renvoie au web (EF-7)', async () => {
    const onConfigureModels = jest.fn();
    const view = await renderSheet(
      <TutorSheet
        state={snapshotOf({
          messages: [],
          error: { code: 'AI_MODEL_MISSING', retryAfterSec: null },
        })}
        subtitle="Cours"
        online
        {...HANDLERS}
        onConfigureModels={onConfigureModels}
      />,
    );
    expect(view.getByTestId('tutor-error')).toHaveTextContent(
      /aucun modèle d’IA n’est configuré pour la discussion/,
    );
    await fireEvent.press(view.getByTestId('tutor-configure-models'));
    expect(onConfigureModels).toHaveBeenCalledTimes(1);
  });

  it('désactive la saisie hors ligne (CL-4)', async () => {
    const view = await renderSheet(
      <TutorSheet state={snapshotOf()} subtitle="Cours" online={false} {...HANDLERS} />,
    );
    expect(view.getByTestId('tutor-offline')).toHaveTextContent(
      /Le tuteur est disponible une fois en ligne/,
    );
    expect(view.getByTestId('tutor-input').props.editable).toBe(false);
    expect(view.getByTestId('tutor-send').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  it('propose les questions de l’API sur une discussion vide (EF-4)', async () => {
    const onSendFollowUp = jest.fn();
    const view = await renderSheet(
      <TutorSheet
        state={snapshotOf({
          messages: [],
          suggestions: [{ key: 'example', label: 'Un exemple concret' }],
        })}
        subtitle="Cours"
        online
        {...HANDLERS}
        onSendFollowUp={onSendFollowUp}
      />,
    );
    expect(view.getByTestId('tutor-empty')).toBeTruthy();
    await fireEvent.press(view.getByTestId('tutor-suggestion-0'));
    expect(onSendFollowUp).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'example', label: 'Un exemple concret' }),
    );
  });
});

describe('[SPEC-3303] accessibilité de la feuille', () => {
  it('annonce les contrôles et garde des cibles nommées (WCAG 2.2 AA)', async () => {
    const view = await renderSheet(
      <TutorSheet state={snapshotOf({ card: CARD })} subtitle="Cours" online {...HANDLERS} />,
    );
    expectAccessible(view, 'tutor-close', { role: 'button', label: 'Fermer la feuille du tuteur' });
    expectAccessible(view, 'tutor-new-discussion', {
      role: 'button',
      label: 'Nouvelle discussion',
    });
    expectAccessible(view, 'tutor-input', { label: 'Votre question au tuteur' });
    expectAccessible(view, 'tutor-source-0', {
      role: 'button',
      label: 'Source : Chapitre 2 · L’en-tête de pièce',
    });
    expectAccessible(view, 'tutor-follow-up-0', { role: 'button', label: 'Un exemple concret' });
    expectAccessible(view, 'tutor-create-card', { role: 'button', label: 'Créer une carte' });
  });
});
