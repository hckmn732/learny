// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WarmupDto } from '@learny/contracts';
import { cleanup, renderComponent, screen } from '@learny/testing/render';

import { WarmupCard } from './WarmupCard';

afterEach(cleanup);

function dto(overrides: Partial<WarmupDto> = {}): WarmupDto {
  return {
    activityId: '11111111-1111-4111-8111-111111111111',
    formationId: '22222222-2222-4222-8222-222222222222',
    nextSession: {
      kind: 'validation_quiz',
      startsAt: '2026-11-11T14:00:00+01:00',
      href: '/formations/22222222-2222-4222-8222-222222222222/modules/33333333-3333-4333-8333-333333333333/quiz',
    },
    scope: 'yesterday_prerequisites',
    items: [
      {
        position: 0,
        notionId: '44444444-4444-4444-8444-444444444444',
        notionLabel: 'Clé de comptabilisation',
        tag: 'yesterday',
        moduleNumber: null,
        question: 'Quelle clé de comptabilisation pour un débit sur un compte général ?',
        answer: '40. Et 50 pour un crédit sur un compte général.',
      },
      {
        position: 1,
        notionId: '55555555-5555-4555-8555-555555555555',
        notionLabel: 'Date comptable',
        tag: 'yesterday',
        moduleNumber: null,
        question: 'Qu’est-ce qui distingue la date comptable de la date de pièce ?',
        answer: 'La date comptable fixe la période.',
      },
      {
        position: 2,
        notionId: '66666666-6666-4666-8666-666666666666',
        notionLabel: 'Plan comptable',
        tag: 'prerequisite',
        moduleNumber: 2,
        question: 'Quel objet regroupe la liste des comptes généraux utilisables par une société ?',
        answer: 'Le plan comptable.',
      },
    ],
    answers: [],
    status: 'todo',
    ...overrides,
  };
}

const NOOP = (): Promise<WarmupDto> => Promise.resolve(dto());

describe('[SPEC-714] bloc d’échauffement', () => {
  it('CA-3 — l’état par défaut reprend les textes de la maquette', () => {
    renderComponent(<WarmupCard warmup={dto()} onAnswer={NOOP} />);
    expect(screen.getByTestId('warmup-title').textContent).toBe(
      'Échauffement · avant votre quiz de 14:00',
    );
    expect(screen.getByTestId('warmup-progress').textContent).toBe('Question 1 sur 3');
    expect(screen.getByTestId('warmup-tag').textContent).toBe('Vu hier');
    expect(screen.getByTestId('warmup-question').textContent).toBe(
      'Quelle clé de comptabilisation pour un débit sur un compte général ?',
    );
    expect(screen.getByTestId('warmup-reveal').textContent).toBe('Voir la réponse');
    expect(screen.queryByTestId('warmup-answer')).toBeNull();
  });

  it('EF-7, ET-5 — « Voir la réponse » révèle la réponse et déplace le focus', async () => {
    const { user } = renderComponent(<WarmupCard warmup={dto()} onAnswer={NOOP} />);
    await user.click(screen.getByTestId('warmup-reveal'));
    expect(screen.getByTestId('warmup-answer').textContent).toBe(
      '40. Et 50 pour un crédit sur un compte général.',
    );
    expect(screen.getByTestId('warmup-knew').textContent).toBe('Je savais');
    expect(screen.getByTestId('warmup-review').textContent).toBe('À revoir');
    expect(document.activeElement).toBe(screen.getByTestId('warmup-knew'));
  });

  it('CA-3, CA-4 — trois réponses puis le score et la notion à revoir', async () => {
    const onAnswer = vi.fn(() => Promise.resolve(dto()));
    const { user } = renderComponent(<WarmupCard warmup={dto()} onAnswer={onAnswer} />);
    for (const knew of [true, true, false]) {
      await user.click(screen.getByTestId('warmup-reveal'));
      await user.click(screen.getByTestId(knew ? 'warmup-knew' : 'warmup-review'));
    }
    expect(onAnswer).toHaveBeenCalledTimes(3);
    expect(onAnswer).toHaveBeenNthCalledWith(1, { position: 0, knew: true });
    expect(onAnswer).toHaveBeenNthCalledWith(3, { position: 2, knew: false });
    const done = screen.getByTestId('warmup-done');
    expect(done.getAttribute('role')).toBe('status');
    expect(screen.getByTestId('warmup-score').textContent).toBe('Échauffement fait : 2 sur 3');
    expect(screen.getByTestId('warmup-follow').textContent).toBe(
      'À revoir : « Quel objet regroupe la liste des comptes généraux utilisables par une société ». Cette notion repasse dans le quiz global de ce soir.',
    );
    expect(screen.getByTestId('warmup-next').textContent).toBe('Passer au quiz de validation');
    expect(screen.getByTestId('warmup-restart').textContent).toBe('Recommencer');
  });

  it('EF-7 — « Recommencer » rejoue sans aucun appel réseau', async () => {
    const onAnswer = vi.fn(() => Promise.resolve(dto()));
    const { user } = renderComponent(<WarmupCard warmup={dto()} onAnswer={onAnswer} />);
    for (const knew of [true, true, false]) {
      await user.click(screen.getByTestId('warmup-reveal'));
      await user.click(screen.getByTestId(knew ? 'warmup-knew' : 'warmup-review'));
    }
    onAnswer.mockClear();
    await user.click(screen.getByTestId('warmup-restart'));
    expect(screen.getByTestId('warmup-progress').textContent).toBe('Question 1 sur 3');
    expect(screen.queryByTestId('warmup-done')).toBeNull();
    await user.click(screen.getByTestId('warmup-reveal'));
    await user.click(screen.getByTestId('warmup-knew'));
    await user.click(screen.getByTestId('warmup-reveal'));
    await user.click(screen.getByTestId('warmup-knew'));
    await user.click(screen.getByTestId('warmup-reveal'));
    await user.click(screen.getByTestId('warmup-knew'));
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByTestId('warmup-score').textContent).toBe('Échauffement fait : 3 sur 3');
  });

  it('CL-8 — le texte de suite parle du prochain quiz quand la session est jouée', async () => {
    const { user } = renderComponent(
      <WarmupCard
        warmup={dto({
          answers: [
            { position: 0, knew: true },
            { position: 1, knew: true },
            { position: 2, knew: false },
          ],
          status: 'done',
          reviewRemaining: true,
        })}
        onAnswer={NOOP}
      />,
    );
    expect(screen.getByTestId('warmup-score').textContent).toBe('Échauffement fait : 2 sur 3');
    expect(screen.getByTestId('warmup-follow').textContent).toContain(
      'dans le prochain quiz global.',
    );
    await user.click(screen.getByTestId('warmup-restart'));
    expect(screen.getByTestId('warmup-progress').textContent).toBe('Question 1 sur 3');
  });
});
