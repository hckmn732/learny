// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  GlobalQuizSessionDtoSchema,
  ReviewAnswerResultDtoSchema,
  type GlobalQuizSessionDto,
  type ReviewAnswerInput,
} from '@learny/contracts';

import { api, ApiError } from '../../lib/api-client';

import { GlobalQuizSession } from './GlobalQuizSession';

const NOTION = '0b6f2a7e-9a3c-4c1c-8a55-3d1f6f1d2a01';
const BRICK = '3f1c8a5e-5d0e-4a0b-9a6e-7b2c4d9e1f02';
const VERSION = '7c3f1a9e-2b4d-4c6e-9f10-1a2b3c4d5e6f';
const SESSION = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a';
const ATTEMPT = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

function fixture(currentPosition = 0): GlobalQuizSessionDto {
  return GlobalQuizSessionDtoSchema.parse({
    sessionId: SESSION,
    attemptId: ATTEMPT,
    formationId: '5b4a3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d',
    forDate: '2026-11-11',
    mode: 'full',
    status: 'in_progress',
    header: {
      notionCount: 7,
      modulesLabel: 'Modules 1 et 2 mêlés',
      estimatedMinutes: 8,
      subtitle: 'SAP S/4HANA Finance · session du mercredi 11 novembre',
    },
    modeOptions: { fullMinutes: 8, microMinutes: 5 },
    note: '7 notions à revoir aujourd’hui, lacunes en priorité.',
    rationale: [],
    items: [
      {
        position: 0,
        brickId: BRICK,
        brickVersionId: VERSION,
        type: 'recall_card',
        name: 'Carte de rappel',
        tech: 'Rappel actif',
        displayLabel: 'Variante d’exercice',
        scopeLabel: 'Module 2',
        reason: 'Choisi pour votre oubli',
        notionIds: [NOTION],
        payload: {
          front: 'Que définit une variante d’exercice comptable ?',
          back: 'Le nombre de périodes comptables d’un exercice.',
          sourceLabel: 'votre cours du module 2, chapitre 2',
          sources: [],
        },
        intervals: {
          again: '2026-11-12T08:00:00Z',
          hard: '2026-11-13T08:00:00Z',
          good: '2026-11-17T08:00:00Z',
          easy: '2026-11-25T08:00:00Z',
        },
        state: 'todo',
        result: null,
      },
      {
        position: 1,
        brickId: BRICK,
        brickVersionId: VERSION,
        type: 'matching',
        name: 'Association',
        tech: 'Notions proches',
        displayLabel: 'Notions de base SAP',
        scopeLabel: 'Modules 1 et 2',
        reason: null,
        notionIds: [NOTION],
        payload: {
          instruction: 'Notions de base SAP : reliez chaque notion à sa définition.',
          lefts: [{ id: 'p1', text: 'Société' }],
          rights: [{ id: 'r1', text: 'Entité juridique' }],
          sources: [],
        },
        intervals: null,
        state: 'todo',
        result: null,
      },
      {
        position: 2,
        brickId: BRICK,
        brickVersionId: VERSION,
        type: 'cloze',
        name: 'Texte à trous',
        tech: 'Rappel actif',
        displayLabel: 'Fiori et devises',
        scopeLabel: 'Modules 1 et 2',
        reason: null,
        notionIds: [NOTION],
        payload: {
          template: 'Une {{1}} du launchpad.',
          gaps: [{ id: 1 }],
          sources: [],
        },
        intervals: null,
        state: 'todo',
        result: null,
      },
    ],
    currentPosition,
    summary: null,
  });
}

function answered(dto: GlobalQuizSessionDto, rating: string | null): GlobalQuizSessionDto {
  const skipped = rating === null;
  return {
    ...dto,
    items: dto.items.map((item) =>
      item.position !== 0
        ? item
        : {
            ...item,
            state: skipped ? 'skipped' : 'answered',
            result: skipped
              ? {
                  position: 0,
                  skipped: true,
                  isCorrect: null,
                  correction: null,
                  explanation: null,
                  notions: [],
                }
              : {
                  position: 0,
                  skipped: false,
                  isCorrect: rating !== 'again',
                  correction: null,
                  explanation: null,
                  notions: [{ notionId: NOTION, rating, nextDueAt: '2026-11-17T08:00:00Z' }],
                },
          },
    ),
  };
}

function renderSession(
  initial: GlobalQuizSessionDto,
  dueLabelsByPosition: Record<string, Partial<Record<string, string>>> = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GlobalQuizSession
        dueLabelsByPosition={dueLabelsByPosition}
        formationId={initial.formationId}
        initial={initial}
        timeZone="Europe/Paris"
      />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('[SPEC-701] GlobalQuizSession', () => {
  it('EF-9 — retourne la carte, focalise « Raté », note « Bon » et verrouille les autres', async () => {
    let current = fixture();
    vi.spyOn(api, 'globalQuizToday').mockImplementation(() => Promise.resolve(current));
    const answer = vi.spyOn(api, 'reviewAnswer').mockImplementation((input) => {
      current = answered(current, 'good');
      return Promise.resolve(
        ReviewAnswerResultDtoSchema.parse({
          position: input.body.position,
          skipped: false,
          isCorrect: true,
          correction: null,
          explanation: null,
          notions: [{ notionId: NOTION, rating: 'good', nextDueAt: '2026-11-17T08:00:00Z' }],
        }),
      );
    });

    renderSession(current, {
      '0': { again: 'Demain', hard: 'Dans 2 jours', good: 'Dans 6 jours', easy: 'Dans 2 semaines' },
    });

    expect(screen.getByTestId('recall-card-front')).toBeTruthy();
    fireEvent.click(screen.getByTestId('recall-card-flip'));
    const again = await screen.findByTestId('recall-grade-again');
    await waitFor(() => {
      expect(document.activeElement).toBe(again);
    });
    expect(screen.getByTestId('recall-grade-good').textContent).toContain('Dans 6 jours');

    fireEvent.click(screen.getByTestId('recall-grade-good'));
    await waitFor(() => {
      expect(screen.getByTestId('recall-grade-good').getAttribute('aria-pressed')).toBe('true');
    });
    expect(screen.getByTestId('recall-grade-again').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('recall-grade-hard').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('recall-grade-easy').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('gq-next').hasAttribute('disabled')).toBe(false);
    expect(answer.mock.calls[0]?.[0]).toMatchObject({
      params: { sid: SESSION },
      body: { position: 0, response: { selfRating: 'good' } },
    });
  });

  it('EF-10 — « Passer » envoie skipped et avance au jeu suivant', async () => {
    let current = fixture();
    vi.spyOn(api, 'globalQuizToday').mockImplementation(() => Promise.resolve(current));
    const answer = vi.spyOn(api, 'reviewAnswer').mockImplementation((input) => {
      current = answered(current, null);
      return Promise.resolve(
        ReviewAnswerResultDtoSchema.parse({
          position: input.body.position,
          skipped: true,
          isCorrect: null,
          correction: null,
          explanation: null,
          notions: [],
        }),
      );
    });

    renderSession(current);
    fireEvent.click(screen.getByTestId('gq-skip'));

    await waitFor(() => {
      expect(screen.getByTestId('gq-game-title').textContent).toBe('Association');
    });
    const body = answer.mock.calls[0]?.[0]?.body as ReviewAnswerInput;
    expect(body.skipped).toBe(true);
    expect(body.response).toBeUndefined();
  });

  it('EF-10 — le dernier jeu affiche « Terminer la session » et clôt la session', async () => {
    let current = fixture(2);
    vi.spyOn(api, 'globalQuizToday').mockImplementation(() => Promise.resolve(current));
    vi.spyOn(api, 'reviewAnswer').mockImplementation((input) => {
      current = {
        ...current,
        items: current.items.map((item) =>
          item.position === 2 ? { ...item, state: 'skipped' } : item,
        ),
      };
      return Promise.resolve(
        ReviewAnswerResultDtoSchema.parse({
          position: input.body.position,
          skipped: true,
          isCorrect: null,
          correction: null,
          explanation: null,
          notions: [],
        }),
      );
    });
    const complete = vi.spyOn(api, 'reviewComplete').mockResolvedValue({
      reviewedCount: 0,
      minutes: 1,
      okCount: 0,
      soonCount: 1,
      streakDays: 12,
      nextSessionAt: '2026-11-12T16:00:00Z',
    });

    renderSession(current);
    expect(screen.getByTestId('gq-next').textContent).toBe('Terminer la session');
    fireEvent.click(screen.getByTestId('gq-skip'));
    await waitFor(() => {
      expect(screen.getByTestId('gq-next').hasAttribute('disabled')).toBe(false);
    });
    fireEvent.click(screen.getByTestId('gq-next'));
    await waitFor(() => {
      expect(complete).toHaveBeenCalledWith({ params: { sid: SESSION } });
    });
    await waitFor(() => {
      expect(screen.getByTestId('gq-end')).toBeTruthy();
    });
  });

  it('EF-12 — une erreur réseau affiche une alerte et « Réessayer » réutilise le clientAnswerId', async () => {
    let current = fixture();
    vi.spyOn(api, 'globalQuizToday').mockImplementation(() => Promise.resolve(current));
    const answer = vi
      .spyOn(api, 'reviewAnswer')
      .mockRejectedValueOnce(new ApiError('INTERNAL_ERROR', 'Panne simulée.', { status: 500 }))
      .mockImplementation((input) => {
        current = answered(current, 'good');
        return Promise.resolve(
          ReviewAnswerResultDtoSchema.parse({
            position: input.body.position,
            skipped: false,
            isCorrect: true,
            correction: null,
            explanation: null,
            notions: [{ notionId: NOTION, rating: 'good', nextDueAt: '2026-11-17T08:00:00Z' }],
          }),
        );
      });

    renderSession(current);
    fireEvent.click(screen.getByTestId('recall-card-flip'));
    fireEvent.click(await screen.findByTestId('recall-grade-good'));

    const alert = await screen.findByTestId('gq-answer-error');
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toContain('Votre réponse n’a pas pu être enregistrée. Réessayez.');

    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => {
      expect(answer).toHaveBeenCalledTimes(2);
    });
    const first = answer.mock.calls[0]?.[0]?.body as ReviewAnswerInput;
    const second = answer.mock.calls[1]?.[0]?.body as ReviewAnswerInput;
    expect(second.clientAnswerId).toBe(first.clientAnswerId);
    await waitFor(() => {
      expect(screen.queryByTestId('gq-answer-error')).toBeNull();
    });
  });
});
