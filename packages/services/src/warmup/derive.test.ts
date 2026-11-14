import { describe, expect, it } from 'vitest';

import {
  formatWarmupDay,
  nextLocalDay,
  nextSessionHref,
  offsetIso,
  questionOfBrick,
  sessionKindLabel,
  trimQuestion,
  warmupConsumedSummary,
  warmupDurationMin,
  warmupFollowText,
  warmupMeta,
  warmupMinutes,
  warmupNextLabel,
  warmupProgress,
  warmupScore,
  warmupSlotWindow,
  warmupStatus,
  warmupSubtitle,
  warmupTitle,
  warmupWhen,
} from './derive';

const PARIS = 'Europe/Paris';

describe('[SPEC-714] échauffement · calculs et textes', () => {
  it('EF-4 — la durée vaut ceil(N × 40 s / 60), au moins 2 minutes', () => {
    expect(warmupDurationMin(2)).toBe(2);
    expect(warmupDurationMin(3)).toBe(2);
    expect(warmupDurationMin(5)).toBe(4);
  });

  it('EF-4 — le créneau commence 10 minutes avant la séance', () => {
    const window = warmupSlotWindow('2026-11-11T14:00:00+01:00', 3);
    expect(window.startsAt.toISOString()).toBe('2026-11-11T12:50:00.000Z');
    expect(window.endsAt.toISOString()).toBe('2026-11-11T12:52:00.000Z');
    const long = warmupSlotWindow('2026-11-11T14:00:00+01:00', 5);
    expect(long.endsAt.getTime() - long.startsAt.getTime()).toBe(4 * 60_000);
  });

  it('EF-6, EF-7 — titre, sous-titre et ligne de « Votre journée »', () => {
    expect(sessionKindLabel('validation_quiz')).toBe('quiz');
    expect(sessionKindLabel('contributions')).toBe('séance d’apports');
    expect(warmupTitle('validation_quiz', '14:00')).toBe(
      'Échauffement · avant votre quiz de 14:00',
    );
    expect(warmupSubtitle(3, 2, 'yesterday_prerequisites')).toBe(
      '3 questions de rappel, 2 minutes : la veille et les prérequis du chapitre.',
    );
    expect(warmupSubtitle(2, 2, 'yesterday')).toBe(
      '2 questions de rappel, 2 minutes : les notions vues la veille.',
    );
    expect(warmupMeta(3, 2)).toBe('3 questions de rappel · 2 min · ajouté par le tuteur');
  });

  it('EF-7 — compteur, score et suite de la carte', () => {
    expect(warmupProgress(0, 3)).toBe('Question 1 sur 3');
    expect(warmupProgress(2, 3)).toBe('Question 3 sur 3');
    expect(warmupProgress(3, 3)).toBe('Terminé');
    expect(warmupScore(2, 3)).toBe('Échauffement fait : 2 sur 3');
    expect(
      warmupFollowText({
        reviewQuestions: [
          'Quel objet regroupe la liste des comptes généraux utilisables par une société ?',
        ],
        kind: 'validation_quiz',
        tonight: true,
      }),
    ).toBe(
      'À revoir : « Quel objet regroupe la liste des comptes généraux utilisables par une société ». Cette notion repasse dans le quiz global de ce soir.',
    );
    expect(
      warmupFollowText({ reviewQuestions: ['A ?', 'B ?'], kind: 'course', tonight: false }),
    ).toBe('À revoir : « A », « B ». Ces notions repassent dans le prochain quiz global.');
    expect(warmupFollowText({ reviewQuestions: [], kind: 'validation_quiz', tonight: true })).toBe(
      'Tout est là. Vous êtes prêt pour le quiz de validation.',
    );
    expect(warmupFollowText({ reviewQuestions: [], kind: 'course', tonight: true })).toBe(
      'Tout est là. Vous êtes prêt pour la suite.',
    );
    expect(trimQuestion('Quel objet ?')).toBe('Quel objet');
  });

  it('EF-7 — libellé et destination du bouton de suite', () => {
    expect(warmupNextLabel('validation_quiz')).toBe('Passer au quiz de validation');
    expect(warmupNextLabel('mock_exam')).toBe('Commencer l’examen blanc');
    expect(
      nextSessionHref({
        kind: 'validation_quiz',
        formationId: 'f1',
        moduleId: 'm1',
        activityId: null,
      }),
    ).toBe('/formations/f1/modules/m1/quiz');
    expect(
      nextSessionHref({
        kind: 'exercise',
        formationId: 'f1',
        moduleId: 'm1',
        activityId: 'a1',
      }),
    ).toBe('/formations/f1/modules/m1/exercices/a1');
    expect(
      nextSessionHref({ kind: 'mock_exam', formationId: 'f1', moduleId: null, activityId: null }),
    ).toBe('/formations/f1/examen-blanc');
  });

  it('EF-7 — statut de la carte', () => {
    expect(
      warmupStatus({ itemCount: 3, answerCount: 0, attemptStatus: null, submitted: false }),
    ).toBe('todo');
    expect(
      warmupStatus({
        itemCount: 3,
        answerCount: 1,
        attemptStatus: 'in_progress',
        submitted: false,
      }),
    ).toBe('in_progress');
    expect(
      warmupStatus({
        itemCount: 3,
        answerCount: 3,
        attemptStatus: 'in_progress',
        submitted: false,
      }),
    ).toBe('done');
    expect(
      warmupStatus({ itemCount: 3, answerCount: 0, attemptStatus: 'graded', submitted: true }),
    ).toBe('done');
  });

  it('EF-3 — questions lues dans les briques recall_card et choice_question', () => {
    expect(
      questionOfBrick('recall_card', { front: 'Question ?', back: 'Réponse.', sources: [] }),
    ).toEqual({ question: 'Question ?', answer: 'Réponse.' });
    expect(
      questionOfBrick('choice_question', {
        stem: 'Quelle clé ?',
        mode: 'single',
        options: [
          { id: 'a', text: '40', correct: true, notionId: null },
          { id: 'b', text: '50', correct: false, notionId: null },
        ],
        explanation: 'La clé 40 débite.',
      }),
    ).toEqual({ question: 'Quelle clé ?', answer: '40. La clé 40 débite.' });
    expect(questionOfBrick('instruction', {})).toBeNull();
  });

  it('EF-4, EF-10 — instants locaux, jour et matin/après-midi', () => {
    expect(offsetIso('2026-11-11T13:00:00Z', PARIS)).toBe('2026-11-11T14:00:00+01:00');
    expect(formatWarmupDay('2026-11-11')).toBe('mercredi 11 novembre');
    expect(nextLocalDay('2026-11-30')).toBe('2026-12-01');
    expect(warmupWhen('2026-11-11T08:05:00Z', '2026-11-11T12:20:00Z', PARIS)).toBe('ce matin');
    expect(warmupWhen('2026-11-11T14:05:00Z', '2026-11-11T18:20:00Z', PARIS)).toBe(
      'cet après-midi',
    );
    expect(warmupWhen('2026-11-10T18:05:00Z', '2026-11-11T12:20:00Z', PARIS)).toBe('hier');
    expect(warmupMinutes('2026-11-11T12:20:00Z', '2026-11-11T12:21:10Z')).toBe(2);
  });

  it('EF-10 — résumé de l’action consommée, singulier et pluriel', () => {
    expect(
      warmupConsumedSummary({
        knewCount: 2,
        count: 3,
        reviewLabels: ['Plan comptable'],
        nextQuiz: false,
      }),
    ).toBe('Échauffement fait : 2 sur 3 ; 1 notion repasse dans le quiz global du soir.');
    expect(
      warmupConsumedSummary({
        knewCount: 3,
        count: 3,
        reviewLabels: [],
        nextQuiz: false,
      }),
    ).toBe('Échauffement fait : 3 sur 3.');
    expect(
      warmupConsumedSummary({
        knewCount: 1,
        count: 3,
        reviewLabels: ['A', 'B'],
        nextQuiz: true,
      }),
    ).toBe('Échauffement fait : 1 sur 3 ; 2 notions repassent dans le prochain quiz global.');
  });
});
