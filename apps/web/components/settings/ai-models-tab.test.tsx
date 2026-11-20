// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@learny/api-client';
import type { AiModelsState } from '@learny/contracts';
import { cleanup, renderComponent, screen, within } from '@learny/testing/render';

import { AiModelsTab } from './ai-models-tab';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const CREDENTIAL = '66666666-6666-4666-8666-666666666666';
const TASKS = ['programme', 'course', 'gaps', 'tutor', 'light'] as const;

function state(withProvider: boolean, assigned: boolean): AiModelsState {
  const option = {
    modelId: 'gpt-5.5-e2e',
    label: 'OpenAI · ma clé',
    credentialId: CREDENTIAL,
    provider: 'openai' as const,
    providerLabel: 'OpenAI',
    outsideEu: true,
    qualificationStatus: 'qualified' as const,
  };
  return {
    tasks: TASKS.map((task) => {
      const chosen = assigned && task === 'tutor';
      return {
        task,
        requiredCapabilities: ['tools', 'structured'] as ('tools' | 'structured')[],
        modelId: chosen ? option.modelId : null,
        credentialId: chosen ? CREDENTIAL : null,
        provider: chosen ? ('openai' as const) : null,
        providerLabel: chosen ? 'OpenAI' : null,
        outsideEu: chosen,
        available: chosen,
        unavailableReason: chosen ? null : ('no_model_selected' as const),
        options: withProvider ? [option] : [],
      };
    }),
    providers: withProvider
      ? [
          {
            id: CREDENTIAL,
            provider: 'openai' as const,
            providerLabel: 'OpenAI',
            label: 'OpenAI',
            keyMasked: 'sk-••••••••a91F',
            status: 'qualified' as const,
            outsideEu: true,
            dataNote: 'Traite les données hors de l’Union européenne.',
            models: ['gpt-5.5-e2e'],
            qualifiedAt: '2026-11-10T10:00:00.000Z',
            failure: null,
          },
        ]
      : [],
    updatedAt: '2026-11-11T12:20:00.000Z',
  };
}

describe('[SPEC-709] onglet Modèles d’IA sans modèle par défaut', () => {
  it('affiche « Mes fournisseurs » avant « Modèle par tâche » avec un état vide explicite', () => {
    renderComponent(<AiModelsTab initial={state(false, false)} initialError={false} />);
    const providers = screen.getByTestId('ai-providers');
    const tasks = screen.getByTestId('ai-models-tasks');
    expect(
      providers.compareDocumentPosition(tasks) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByTestId('ai-providers-empty').textContent).toBe(
      'Aucun fournisseur configuré. Ajoutez une clé pour pouvoir choisir un modèle.',
    );
    expect(within(providers).getByTestId('provider-add')).toBeTruthy();
    expect(screen.queryAllByTestId('provider-card')).toHaveLength(0);
    expect(screen.getByTestId('ai-tasks-no-provider').textContent).toContain(
      'tant qu’aucun fournisseur n’est qualifié',
    );
  });

  it('verrouille les cinq sélecteurs et ne cite ni Claude ni « Par défaut »', () => {
    renderComponent(<AiModelsTab initial={state(false, false)} initialError={false} />);
    const selects = screen.getAllByTestId<HTMLSelectElement>('ai-task-model');
    expect(selects).toHaveLength(5);
    for (const select of selects) expect(select.disabled).toBe(true);
    for (const row of screen.getAllByTestId('ai-task-unavailable')) {
      expect(row.textContent).toContain('Aucun modèle choisi pour cette tâche.');
    }
    expect(screen.queryAllByTestId('ai-task-clear')).toHaveLength(0);
    const panel = screen.getByTestId('ai-models-panel').textContent;
    expect(panel).not.toContain('Claude');
    expect(panel).not.toContain('Par défaut');
    expect(panel).not.toContain('IA fournie');
    expect(screen.getByTestId('ai-models-principle').textContent).toContain(
      'La plateforme n’en fournit aucun',
    );
  });

  it('propose les modèles qualifiés sans en choisir un automatiquement', () => {
    renderComponent(<AiModelsTab initial={state(true, false)} initialError={false} />);
    expect(screen.getAllByTestId('provider-card')).toHaveLength(1);
    expect(screen.queryByTestId('ai-providers-empty')).toBeNull();
    expect(screen.queryByTestId('ai-tasks-no-provider')).toBeNull();
    const programme = within(
      screen.getByTestId('ai-task-programme'),
    ).getByTestId<HTMLSelectElement>('ai-task-model');
    expect(programme.disabled).toBe(false);
    expect(programme.value).toBe('');
    expect(Array.from(programme.options).map((option) => option.textContent)).toEqual([
      'Choisir un modèle',
      'gpt-5.5-e2e · ma clé',
    ]);
    expect(Array.from(programme.querySelectorAll('optgroup')).map((group) => group.label)).toEqual([
      'OpenAI',
    ]);
  });

  it('n’exige plus de nom de modèle lors de l’ajout d’un fournisseur', async () => {
    const { user } = renderComponent(
      <AiModelsTab initial={state(false, false)} initialError={false} />,
    );
    await user.click(screen.getByTestId('provider-add'));
    expect(screen.getByTestId('provider-form')).toBeTruthy();
    expect(screen.queryByTestId('provider-form-model')).toBeNull();
  });

  it('affecte un modèle puis retire le choix (action clear)', async () => {
    const assigned = state(true, true);
    const update = vi
      .spyOn(api, 'meAiModelsUpdate')
      .mockResolvedValueOnce(assigned)
      .mockResolvedValueOnce(state(true, false));
    const { user } = renderComponent(
      <AiModelsTab initial={state(true, false)} initialError={false} />,
    );
    const tutor = screen.getByTestId('ai-task-tutor');
    await user.selectOptions(within(tutor).getByTestId('ai-task-model'), '0');
    expect(update).toHaveBeenNthCalledWith(1, {
      body: { action: 'assign', task: 'tutor', modelId: 'gpt-5.5-e2e', credentialId: CREDENTIAL },
    });
    expect(await within(tutor).findByText('Votre choix')).toBeTruthy();
    expect(within(tutor).getByText('Hors UE')).toBeTruthy();

    await user.click(within(tutor).getByTestId('ai-task-clear'));
    expect(update).toHaveBeenNthCalledWith(2, { body: { action: 'clear', task: 'tutor' } });
    expect(await within(tutor).findByTestId('ai-task-unavailable')).toBeTruthy();
    expect(within(tutor).queryByText('Votre choix')).toBeNull();
  });
});
