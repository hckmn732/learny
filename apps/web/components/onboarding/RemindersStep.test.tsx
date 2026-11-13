// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cleanup, renderComponent, screen, waitFor } from '@learny/testing/render';

import type { PushGateway } from '../../lib/push-onboarding';

import { RemindersStep } from './RemindersStep';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const apiMock = vi.hoisted(() => ({ meOnboardingUpdate: vi.fn() }));
vi.mock('../../lib/api-client', () => ({ api: apiMock }));

beforeEach(() => {
  router.push.mockReset();
  apiMock.meOnboardingUpdate.mockReset().mockResolvedValue({ onboardingStep: 'depart' });
});

afterEach(cleanup);

function gateway(subscribed: boolean): PushGateway {
  return {
    supported: true,
    permission: () => 'default',
    requestPermission: () => Promise.resolve('denied'),
    subscribe: vi.fn(() => Promise.resolve(subscribed)),
  };
}

describe('[SPEC-602] étape Rappels', () => {
  it('permission refusée : channel_push faux et passage à Départ sans blocage (CL-8)', async () => {
    const push = gateway(false);
    const { user } = renderComponent(
      <RemindersStep
        initial={{ push: true, email: true, automations: true }}
        needsCheckout={false}
        publicKey="key"
        pushGateway={push}
      />,
    );
    expect(screen.getByTestId('reminder-push').getAttribute('aria-checked')).toBe('true');
    await user.click(screen.getByTestId('onboarding-continue'));
    await waitFor(() => {
      expect(apiMock.meOnboardingUpdate).toHaveBeenCalledWith({
        body: {
          step: 'depart',
          reminders: { push: false, email: true, automations: true },
        },
      });
    });
    expect(push.subscribe).toHaveBeenCalledOnce();
    expect(router.push).toHaveBeenCalledWith('/premiers-pas/depart');
  });

  it('un interrupteur désactivé est enregistré faux (EF-10)', async () => {
    const { user } = renderComponent(
      <RemindersStep
        initial={{ push: true, email: true, automations: true }}
        needsCheckout={false}
        publicKey="key"
        pushGateway={gateway(false)}
      />,
    );
    await user.click(screen.getByTestId('reminder-email'));
    await user.click(screen.getByTestId('onboarding-continue'));
    await waitFor(() => {
      expect(apiMock.meOnboardingUpdate).toHaveBeenCalledWith({
        body: {
          step: 'depart',
          reminders: { push: false, email: false, automations: true },
        },
      });
    });
  });
});
