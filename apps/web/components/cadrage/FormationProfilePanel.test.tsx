// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import type { CadrageProfile } from '@learny/contracts';
import { cleanup, renderComponent, screen } from '@learny/testing/render';

import { FormationProfilePanel } from './FormationProfilePanel';

afterEach(cleanup);

function profile(): CadrageProfile {
  return {
    scope: { value: 'Comptabilité générale', state: 'done' },
    starting_point: { value: null, state: 'todo' },
    target_level: { value: null, state: 'waiting' },
    volume: { value: null, state: 'todo' },
    dates: { value: null, state: 'todo' },
  };
}

describe('[SPEC-604] FormationProfilePanel', () => {
  it('CA-5 — le bouton désactivé est expliqué par aria-describedby', () => {
    renderComponent(
      <FormationProfilePanel
        canGenerate={false}
        finished={false}
        profile={profile()}
        questionsAsked={3}
      />,
    );
    const button = screen.getByTestId('cadrage-generate');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('aria-describedby')).toBe('cadrage-generate-help');
    expect(screen.getByText('Précisez d’abord le périmètre et le niveau visé.')).toBeTruthy();
    expect(screen.getByText('Question 3 sur 5 au plus')).toBeTruthy();
    expect(screen.getByText('3/5')).toBeTruthy();
    expect(screen.getByTestId('profile-rubric-target_level').textContent).toContain(
      'En attente de votre réponse',
    );
  });

  it('CA-3 — l’aperçu d’une sélection multiple est en gras dans la rubrique', () => {
    renderComponent(
      <FormationProfilePanel
        canGenerate={false}
        finished={false}
        preview={{ target_level: 'Utilisateur autonome, Certification SAP' }}
        profile={profile()}
        questionsAsked={3}
      />,
    );
    const rubric = screen.getByTestId('profile-rubric-target_level');
    expect(rubric.textContent).toContain('Utilisateur autonome, Certification SAP');
    expect(rubric.querySelector('.font-600')).toBeTruthy();
  });

  it('CA-5 — le bouton est actif quand périmètre et niveau visé sont renseignés', () => {
    const value = profile();
    value.target_level = { value: 'Certification SAP', state: 'done' };
    renderComponent(
      <FormationProfilePanel
        canGenerate
        finished
        onGenerate={() => undefined}
        profile={value}
        questionsAsked={4}
      />,
    );
    const button = screen.getByTestId('cadrage-generate');
    expect(button.getAttribute('aria-disabled')).toBe('false');
    expect(button.getAttribute('aria-describedby')).toBeNull();
    expect(screen.getByText('4 questions · cadrage terminé')).toBeTruthy();
  });
});
