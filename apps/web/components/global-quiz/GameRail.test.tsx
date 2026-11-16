// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ReviewItemDtoSchema, type ReviewItemDto } from '@learny/contracts';

import { GameRail } from './GameRail';
import { TutorRationale } from './TutorRationale';

const NOTION = '0b6f2a7e-9a3c-4c1c-8a55-3d1f6f1d2a01';
const BRICK = '3f1c8a5e-5d0e-4a0b-9a6e-7b2c4d9e1f02';
const VERSION = '7c3f1a9e-2b4d-4c6e-9f10-1a2b3c4d5e6f';

function item(reason: ReviewItemDto['reason']): ReviewItemDto {
  return ReviewItemDtoSchema.parse({
    position: 0,
    brickId: BRICK,
    brickVersionId: VERSION,
    type: 'recall_card',
    name: 'Carte de rappel',
    tech: 'Rappel actif',
    displayLabel: 'Variante d’exercice',
    scopeLabel: 'Module 2',
    reason,
    notionIds: [NOTION],
    payload: { front: 'Question', back: 'Réponse', sourceLabel: 'cours', sources: [] },
    intervals: null,
    state: 'todo',
    result: null,
  });
}

afterEach(cleanup);

describe('[SPEC-716] rail du quiz global', () => {
  it('EF-7 — affiche la raison du choix sous la notion', () => {
    render(
      <GameRail
        currentPosition={0}
        items={[item({ code: 'gap_forgetting', label: 'Choisi pour votre oubli' })]}
        onSelect={() => {}}
      />,
    );
    const reason = screen.getByTestId('global-quiz-rail-reason');
    expect(reason.textContent).toBe('Choisi pour votre oubli');
    expect(reason.className).toContain('text-orange-ink');
    expect(reason.className).toContain('text-11');
    expect(reason.className).toContain('font-700');
  });

  it('EF-7 — variantes de ton fournies par l’API', () => {
    render(
      <GameRail
        currentPosition={0}
        items={[item({ code: 'gap_confusion', label: 'Choisi pour ta confusion' })]}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByTestId('global-quiz-rail-reason').textContent).toBe(
      'Choisi pour ta confusion',
    );
  });

  it('EF-7 — l’encadré rend les lignes de lacune imposée', () => {
    render(
      <TutorRationale
        rationale={[]}
        tuned={[
          {
            label: 'Lacune en priorité',
            text: 'Variante d’exercice, oubliée depuis le 6 nov., revient en carte de rappel.',
          },
        ]}
      />,
    );
    const line = screen.getByTestId('global-quiz-tuned-gap');
    expect(line.textContent).toContain('Lacune en priorité');
    expect(line.textContent).toContain('revient en carte de rappel.');
  });
});
