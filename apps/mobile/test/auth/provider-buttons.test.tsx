// Jest + RNTL [SPEC-3402] — zone des fournisseurs : ordre, disponibilité, double appui et
// accessibilité (EF-1, CA-1, CL-4, BR-PLA-03).
import { act, cleanup, fireEvent, render } from '@testing-library/react-native';

import { fr } from '@learny/i18n';

import {
  ProviderButtons,
  type ProviderButtonsProps,
} from '../../src/features/auth/ProviderButtons';
import { expectAccessible } from '../utils/expectAccessible';

jest.mock('expo-apple-authentication', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  type MockProps = Record<string, unknown>;
  const Button = (props: MockProps) => React.createElement(Pressable, props);
  return {
    __esModule: true,
    default: Button,
    AppleAuthenticationButton: Button,
    AppleAuthenticationButtonStyle: { BLACK: 0, WHITE: 1, WHITE_OUTLINE: 2 },
    AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 },
    AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
    isAvailableAsync: jest.fn(() => Promise.resolve(true)),
    signInAsync: jest.fn(),
  };
});

const t = fr.mobile.auth.providers;

// RNTL 14 renders and cleans up asynchronously: every tree is unmounted explicitly so the act()
// scopes of two tests of this file never overlap.
const mounted: Awaited<ReturnType<typeof render>>[] = [];

async function setup(props: ProviderButtonsProps) {
  const screen = await render(<ProviderButtons {...props} />);
  mounted.push(screen);
  return screen;
}

afterEach(async () => {
  for (const screen of mounted.splice(0)) await screen.unmount();
  await cleanup();
});

/** Identifiers of the provider buttons, in the order of the rendered tree (CA-1). */
function renderedOrder(screen: Awaited<ReturnType<typeof render>>): string[] {
  return screen.getAllByTestId(/^auth-(apple|google)$/).map((node) => String(node.props.testID));
}

describe('[SPEC-3402] boutons Apple et Google', () => {
  it('affiche Google puis Apple sur Android (CA-1)', async () => {
    const screen = await setup({ appleAvailable: true, onSelect: jest.fn(), platform: 'android' });
    expect(renderedOrder(screen)).toEqual(['auth-google', 'auth-apple']);
    expectAccessible(screen, 'auth-google', { label: t.google, role: 'button' });
    expectAccessible(screen, 'auth-apple', { label: t.apple, role: 'button' });
  });

  it('affiche Apple puis Google sur iOS (CA-1)', async () => {
    const screen = await setup({ appleAvailable: true, onSelect: jest.fn(), platform: 'ios' });
    expect(renderedOrder(screen)).toEqual(['auth-apple', 'auth-google']);
  });

  it('masque aussi Google quand Apple est indisponible (CA-1, ADR-3006 § 3)', async () => {
    const screen = await setup({ appleAvailable: false, onSelect: jest.fn(), platform: 'android' });
    expect(screen.queryByTestId('auth-providers')).toBeNull();
    expect(screen.queryByTestId('auth-google')).toBeNull();
  });

  it('transmet le fournisseur choisi (EF-1)', async () => {
    const onSelect = jest.fn();
    const screen = await setup({ appleAvailable: true, onSelect, platform: 'android' });
    await act(async () => {
      await fireEvent.press(screen.getByTestId('auth-google'));
      await fireEvent.press(screen.getByTestId('auth-apple'));
    });
    expect(onSelect).toHaveBeenCalledWith('google');
    expect(onSelect).toHaveBeenCalledWith('apple');
  });

  it('désactive les deux boutons pendant une fenêtre de fournisseur (CL-4)', async () => {
    const onSelect = jest.fn();
    const screen = await setup({
      appleAvailable: true,
      busy: 'google',
      onSelect,
      platform: 'android',
    });
    await act(async () => {
      await fireEvent.press(screen.getByTestId('auth-google'));
      await fireEvent.press(screen.getByTestId('auth-apple'));
    });
    expect(onSelect).not.toHaveBeenCalled();
    const googleState = screen.getByTestId('auth-google').props.accessibilityState as {
      disabled: boolean;
      busy: boolean;
    };
    const appleState = screen.getByTestId('auth-apple').props.accessibilityState as {
      disabled: boolean;
      busy: boolean;
    };
    expect(googleState.disabled).toBe(true);
    expect(appleState.disabled).toBe(true);
    expect(googleState.busy).toBe(true);
  });
});
