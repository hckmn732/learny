// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cleanup, renderComponent, screen } from '@learny/testing/render';

import { ProfileStep, detectedTimeZone } from './ProfileStep';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const apiMock = vi.hoisted(() => ({ meUpdate: vi.fn(), meOnboardingUpdate: vi.fn() }));
vi.mock('../../lib/api-client', () => ({ api: apiMock }));

beforeEach(() => {
  router.push.mockReset();
  router.refresh.mockReset();
  apiMock.meUpdate.mockReset().mockResolvedValue({});
  apiMock.meOnboardingUpdate.mockReset().mockResolvedValue({ onboardingStep: 'rythme' });
});

afterEach(cleanup);

function profile() {
  return renderComponent(
    <ProfileStep courseLanguage="fr" firstName={null} timezone="Europe/Paris" tutorTone="vous" />,
  );
}

describe('[SPEC-602] étape Profil', () => {
  it('affiche Alex et le vouvoiement par défaut, puis suit le prénom et le ton (EF-3)', async () => {
    const { user } = profile();
    const preview = screen.getByTestId('tone-preview');
    expect(preview.textContent).toContain('Bonjour Alex, voici vos 3 activités du jour.');

    await user.click(screen.getByTestId('tone-tu'));
    expect(preview.textContent).toContain('Bonjour Alex, voici tes 3 activités du jour.');

    await user.type(screen.getByTestId('profile-first-name'), 'Sam');
    expect(preview.textContent).toContain('Bonjour Sam, voici tes 3 activités du jour.');
  });

  it('refuse un prénom vide et n’enregistre rien', async () => {
    const { user } = profile();
    await user.click(screen.getByTestId('onboarding-continue'));
    expect(screen.getByTestId('profile-error').textContent).toBe('Indiquez votre prénom.');
    expect(apiMock.meUpdate).not.toHaveBeenCalled();
  });

  it('enregistre le profil puis avance d’un cran (CA-2)', async () => {
    const { user } = profile();
    await user.type(screen.getByTestId('profile-first-name'), 'Alex');
    await user.selectOptions(screen.getByTestId('course-language'), 'en');
    await user.click(screen.getByTestId('onboarding-continue'));

    expect(apiMock.meUpdate).toHaveBeenCalledWith({
      body: {
        firstName: 'Alex',
        tutorTone: 'vous',
        courseLanguage: 'en',
        timezone: detectedTimeZone('Europe/Paris'),
      },
    });
    expect(apiMock.meOnboardingUpdate).toHaveBeenCalledWith({ body: { step: 'rythme' } });
    expect(router.push).toHaveBeenCalledWith('/premiers-pas/rythme');
  });
});
