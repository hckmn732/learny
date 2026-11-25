// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cleanup, renderComponent, screen, waitFor } from '@learny/testing/render';

import { AiStep } from './AiStep';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const apiMock = vi.hoisted(() => ({
  meAiCredentialsCreate: vi.fn(),
  meAiCredentialsList: vi.fn(),
  meAiCredentialsQualify: vi.fn(),
  meAiTaskModelsUpdate: vi.fn(),
  meOnboardingUpdate: vi.fn(),
}));
vi.mock('@learny/api-client', () => ({ api: apiMock }));

beforeEach(() => {
  router.push.mockReset();
  apiMock.meAiCredentialsCreate
    .mockReset()
    .mockResolvedValue({ id: 'cred-1', connectionStatus: 'connected' });
  apiMock.meAiCredentialsList.mockReset().mockResolvedValue({ items: [] });
  apiMock.meAiCredentialsQualify.mockReset().mockResolvedValue({
    status: 'qualified',
    steps: [],
  });
  apiMock.meAiTaskModelsUpdate.mockReset().mockResolvedValue({});
  apiMock.meOnboardingUpdate.mockReset().mockResolvedValue({ onboardingStep: 'rappels' });
});

afterEach(cleanup);

const MODELS = {
  anthropic: ['personal-model'],
  openai: [],
  mistral: [],
  deepseek: [],
  openai_compatible: [],
};

describe('[SPEC-602] étape IA', () => {
  it('ne propose aucune IA fournie : une clé personnelle est la seule voie (BR-IA-06)', () => {
    renderComponent(<AiStep recommendedModels={MODELS} />);
    expect(screen.queryByTestId('ai-choice-managed')).toBeNull();
    expect(screen.getByTestId('ai-key')).toBeTruthy();
    expect(screen.getByTestId('ai-intro').textContent).toContain('ne fournit aucun modèle');
    const providers = Array.from(screen.getByTestId<HTMLSelectElement>('ai-provider').options).map(
      (option) => option.value,
    );
    expect(providers).toContain('deepseek');
  });

  it('passe l’étape sans clé : la clé d’IA est facultative (QA 2026-11-25)', async () => {
    const { user } = renderComponent(<AiStep recommendedModels={MODELS} />);
    expect(screen.getByTestId('ai-status').textContent).toBe('Pas encore testée');
    await user.click(screen.getByTestId('onboarding-continue'));
    await waitFor(() => {
      expect(apiMock.meOnboardingUpdate).toHaveBeenCalledWith({ body: { step: 'rappels' } });
    });
    expect(router.push).toHaveBeenCalledWith('/premiers-pas/rappels');
  });

  it('bloque Continuer quand une clé saisie n’est pas encore testée (EF-8, CA-4)', async () => {
    const { user } = renderComponent(<AiStep recommendedModels={MODELS} />);
    await user.type(screen.getByTestId('ai-key'), 'sk-ant-test-000000000000');
    await user.click(screen.getByTestId('onboarding-continue'));
    expect(screen.getByTestId('ai-error').textContent).toBe('Testez votre clé avant de continuer.');
    expect(apiMock.meOnboardingUpdate).not.toHaveBeenCalled();
  });

  it('teste une connexion, puis remet le statut à zéro au changement de fournisseur (EF-6)', async () => {
    const { user } = renderComponent(<AiStep recommendedModels={MODELS} />);
    await user.type(screen.getByTestId('ai-key'), 'sk-ant-test-000000000000');
    await user.click(screen.getByTestId('ai-test'));
    await waitFor(() => {
      expect(screen.getByTestId('ai-status').textContent).toBe(
        'Connexion vérifiée · le modèle peut être affecté aux tâches',
      );
    });
    expect(apiMock.meAiCredentialsQualify).not.toHaveBeenCalled();
    expect(screen.getByTestId('ai-key')).toHaveProperty('value', '');
    await user.selectOptions(screen.getByTestId('ai-provider'), 'openai');
    expect(screen.getByTestId('ai-status').textContent).toBe('Pas encore testée');
  });
});
