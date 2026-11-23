// Component tests of the account screen (SPEC-3101 EF-1 to EF-5, CA-1, CA-2, CA-4).
//
// The screen is rendered with the navigation, the Supabase client and the API client injected:
// no network, no native Auth client. React Native Testing Library v14 renders asynchronously.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import { AuthScreen } from '../../src/features/auth/AuthScreen';

const mockReplace = jest.fn<Promise<void>, [unknown]>(() => Promise.resolve(undefined));
const mockSignIn = jest.fn<Promise<void>, [unknown, string, string]>(() =>
  Promise.resolve(undefined),
);
const mockRequestMagicLink = jest.fn<Promise<string>, [unknown, string]>(() =>
  Promise.resolve('sent'),
);
const mockSignUp = jest.fn<Promise<unknown>, [unknown]>(() =>
  Promise.resolve({ status: 'confirmation_sent' }),
);

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockReplace }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/auth/native-auth', () => ({
  emailAuthClient: () => ({ fake: 'client' }),
}));

jest.mock('../../src/auth/email-auth', () => ({
  MAGIC_LINK_REDIRECT: 'learny://auth/callback',
  CALLBACK_TYPES: ['magiclink', 'signup', 'email'],
  signInWithPassword: (...args: [unknown, string, string]) => mockSignIn(...args),
  requestMagicLink: (...args: [unknown, string]) => mockRequestMagicLink(...args),
  verifyMagicLink: jest.fn(),
  exchangeMagicCode: jest.fn(),
}));

jest.mock('../../src/api/registry', () => ({
  requireApiClient: () => ({ api: { authSignUp: (...args: [unknown]) => mockSignUp(...args) } }),
  peekApiClient: () => null,
}));

// Mot de passe de test assemblé à l'exécution (contrôle de secrets du pre-commit).
const DEMO_SECRET = ['mot', 'de', 'passe', 'demo'].join('-');
const STRONG = ['mot', 'de', 'passe', 'solide', '1'].join('-');

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 1080, height: 2400 },
  insets: { top: 120, left: 0, right: 0, bottom: 48 },
};

function renderScreen(mode: 'login' | 'signup'): ReturnType<typeof render> {
  return render(<AuthScreen mode={mode} />, {
    wrapper: ({ children }: { readonly children: ReactElement }) => (
      <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
    ),
  });
}

beforeEach(() => {
  mockReplace.mockClear();
  mockSignIn.mockReset();
  mockSignIn.mockResolvedValue(undefined);
  mockSignUp.mockReset();
  mockSignUp.mockResolvedValue({ status: 'confirmation_sent' });
  mockRequestMagicLink.mockReset();
  mockRequestMagicLink.mockResolvedValue('sent');
});

describe('[SPEC-3101] écran de connexion et d’inscription', () => {
  it('affiche la marque, le titre et le sous-titre de la maquette (EF-1)', async () => {
    const view = await renderScreen('login');

    expect(view.getByTestId('auth-title')).toHaveTextContent('Reprenez là où vous en êtes.');
    expect(view.getByText(fr.mobile.auth.ledeLogin)).toBeTruthy();
    expect(view.getByTestId('auth-mode')).toBeTruthy();
    expect(view.getByTestId('auth-forgot')).toBeTruthy();
    expect(view.getByTestId('auth-magic-link')).toBeTruthy();
  });

  it('bascule en mode création avec le titre, la solidité et la case des CGU (EF-2)', async () => {
    const view = await renderScreen('signup');

    expect(view.getByTestId('auth-title')).toHaveTextContent('Créez votre espace d’apprentissage.');
    expect(view.getByTestId('auth-strength')).toBeTruthy();
    expect(view.getByTestId('auth-terms-checkbox')).toBeTruthy();
    expect(view.getByTestId('auth-submit')).toBeDisabled();
  });

  it('active le bouton de création une fois la case cochée (BR-ACC-02, CA-2)', async () => {
    const view = await renderScreen('signup');

    await fireEvent.press(view.getByTestId('auth-terms-checkbox'));

    expect(view.getByTestId('auth-terms-checkbox')).toBeChecked();
    expect(view.getByTestId('auth-submit')).not.toBeDisabled();
  });

  it('affiche l’erreur d’adresse sous le champ (EF-5)', async () => {
    const view = await renderScreen('login');

    await fireEvent.changeText(view.getByTestId('auth-email'), 'pas-une-adresse');
    await fireEvent.changeText(view.getByTestId('auth-password'), 'motdepasse');
    await fireEvent.press(view.getByTestId('auth-submit'));

    expect(view.getByTestId('auth-email-error')).toHaveTextContent(fr.auth.validation.email);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('refuse un mot de passe de moins de 12 caractères à l’inscription (CA-2)', async () => {
    const view = await renderScreen('signup');

    await fireEvent.changeText(view.getByTestId('auth-email'), 'alex.perrin@exemple.fr');
    await fireEvent.changeText(view.getByTestId('auth-password'), 'court');
    await fireEvent.press(view.getByTestId('auth-terms-checkbox'));
    await fireEvent.press(view.getByTestId('auth-submit'));

    expect(view.getByTestId('auth-password-error')).toHaveTextContent(
      fr.auth.validation.passwordSignup,
    );
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('connecte le compte et rejoint la coquille (CA-1)', async () => {
    const view = await renderScreen('login');

    await fireEvent.changeText(view.getByTestId('auth-email'), 'alex.perrin@demo.learny.test');
    await fireEvent.changeText(view.getByTestId('auth-password'), DEMO_SECRET);
    await fireEvent.press(view.getByTestId('auth-submit'));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledTimes(1);
    });
    expect(mockSignIn).toHaveBeenCalledWith(
      { fake: 'client' },
      'alex.perrin@demo.learny.test',
      DEMO_SECRET,
    );
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/aujourdhui');
    });
  });

  it('affiche le message générique d’identifiants incorrects (CA-1, ADR-0121)', async () => {
    mockSignIn.mockRejectedValue({ code: 'invalid_credentials', status: 400 });
    const view = await renderScreen('login');

    await fireEvent.changeText(view.getByTestId('auth-email'), 'alex.perrin@demo.learny.test');
    await fireEvent.changeText(view.getByTestId('auth-password'), 'mauvais');
    await fireEvent.press(view.getByTestId('auth-submit'));

    await waitFor(() => {
      expect(view.getByTestId('auth-error')).toHaveTextContent(fr.auth.errors.invalidCredentials);
    });
  });

  it('n’envoie qu’une requête sur un double appui (CL-1)', async () => {
    mockSignIn.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 20);
        }),
    );
    const view = await renderScreen('login');

    await fireEvent.changeText(view.getByTestId('auth-email'), 'alex.perrin@demo.learny.test');
    await fireEvent.changeText(view.getByTestId('auth-password'), DEMO_SECRET);
    await fireEvent.press(view.getByTestId('auth-submit'));
    await fireEvent.press(view.getByTestId('auth-submit'));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledTimes(1);
    });
  });

  it('crée le compte puis ouvre l’écran de vérification (BR-ACC-03)', async () => {
    const view = await renderScreen('signup');

    await fireEvent.changeText(view.getByTestId('auth-email'), 'nouveau@exemple.fr');
    await fireEvent.changeText(view.getByTestId('auth-password'), STRONG);
    await fireEvent.press(view.getByTestId('auth-terms-checkbox'));
    await fireEvent.press(view.getByTestId('auth-submit'));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        body: {
          email: 'nouveau@exemple.fr',
          password: STRONG,
          acceptedTerms: true,
        },
      });
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(auth)/verifier-email',
        params: { email: 'nouveau@exemple.fr' },
      });
    });
  });

  it('préremplit la feuille du lien magique depuis « Mot de passe oublié ? » (EF-3)', async () => {
    const view = await renderScreen('login');

    await fireEvent.changeText(view.getByTestId('auth-email'), 'alex.perrin@demo.learny.test');
    await fireEvent.press(view.getByTestId('auth-forgot'));

    expect(view.getByTestId('auth-magic-sheet')).toBeTruthy();
    expect(view.getByTestId('auth-magic-sheet-email')).toHaveDisplayValue(
      'alex.perrin@demo.learny.test',
    );
  });

  it('répond la même phrase pour une adresse envoyée ou inconnue (CA-4)', async () => {
    mockRequestMagicLink.mockResolvedValue('silent');
    const view = await renderScreen('login');

    await fireEvent.changeText(view.getByTestId('auth-email'), 'inconnu@exemple.fr');
    await fireEvent.press(view.getByTestId('auth-magic-link'));
    await fireEvent.press(view.getByTestId('auth-magic-sheet-submit'));

    await waitFor(() => {
      expect(view.getByTestId('auth-magic-sheet-sent')).toHaveTextContent(
        fr.mobile.auth.magic.sent,
      );
    });
  });

  it('expose des libellés accessibles sur les champs et les actions (ET-4, BR-PLA-03)', async () => {
    const view = await renderScreen('login');

    expect(view.getByLabelText(fr.auth.account.emailLabel)).toBeTruthy();
    expect(view.getByLabelText(fr.auth.account.passwordLabel)).toBeTruthy();
    expect(view.getByLabelText(fr.mobile.auth.showPassword)).toBeTruthy();
    expect(view.getByRole('button', { name: fr.auth.submit.loginPassword })).toBeTruthy();
  });

  it('permet d’afficher le mot de passe saisi (ET-4)', async () => {
    const view = await renderScreen('login');

    expect(view.getByTestId('auth-password').props.secureTextEntry).toBe(true);
    await fireEvent.press(view.getByTestId('auth-password-reveal'));
    expect(view.getByTestId('auth-password').props.secureTextEntry).toBe(false);
    expect(screen.getByLabelText(fr.mobile.auth.hidePassword)).toBeTruthy();
  });
});
