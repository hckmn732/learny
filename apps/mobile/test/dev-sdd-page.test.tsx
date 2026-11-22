// Component tests of the demonstration page (SPEC-3001 EF-2, CL-1, CL-2, BR-PLA-03).
// The page is presentational: the tests render it with fixed props, so no network and no
// navigation stack are involved. React Native Testing Library v14 renders asynchronously.
import { render } from '@testing-library/react-native';

import { ConfigErrorPage } from '../src/features/sdd/ConfigErrorPage';
import { SddSpecPage, type SddSpecPageProps } from '../src/features/sdd/SddSpecPage';

import { expectAccessible, expectMinTouchTarget } from './utils/expectAccessible';

const baseProps: SddSpecPageProps = {
  appVersion: '1.0.0',
  runtimeVersion: 'fingerprint-abc123',
  apiUrl: 'http://10.0.2.2:3001',
  clockLabel: '13:20',
  platform: 'Android 35',
  health: { status: 'ok', version: '1.0.0', database: 'ok' },
};

describe('[SPEC-3001] page de démonstration', () => {
  it('affiche le titre, la version, l’URL de l’API, l’horloge et la plateforme (EF-2)', async () => {
    const view = await render(<SddSpecPage {...baseProps} />);

    expect(view.getByTestId('sdd-title')).toHaveTextContent('SPEC-3001 · socle mobile');
    expect(view.getByTestId('sdd-version')).toHaveTextContent('1.0.0');
    expect(view.getByTestId('sdd-runtime')).toHaveTextContent('fingerprint-abc123');
    expect(view.getByTestId('sdd-api-url')).toHaveTextContent('http://10.0.2.2:3001');
    expect(view.getByTestId('sdd-clock')).toHaveTextContent('13:20');
    expect(view.getByTestId('sdd-platform')).toHaveTextContent('Android 35');
  });

  it('annonce « API joignable » quand /health répond (CA-1)', async () => {
    const view = await render(<SddSpecPage {...baseProps} />);

    expect(view.getByTestId('sdd-health')).toHaveTextContent('API joignable');
    expect(view.queryByText(/NETWORK_ERROR/)).toBeNull();
  });

  it('annonce « API injoignable » et le code d’erreur sans planter (CL-1)', async () => {
    const view = await render(
      <SddSpecPage {...baseProps} health={{ status: 'unreachable', code: 'NETWORK_ERROR' }} />,
    );

    expect(view.getByTestId('sdd-health')).toHaveTextContent('API injoignable');
    expect(view.getByText(/NETWORK_ERROR/)).toBeTruthy();
  });

  it('affiche « Vérification… » pendant la requête', async () => {
    const view = await render(<SddSpecPage {...baseProps} health={{ status: 'checking' }} />);

    expect(view.getByTestId('sdd-health')).toHaveTextContent('Vérification…');
  });

  it('expose les testID, rôles et libellés vérifiés par les lecteurs d’écran (BR-PLA-03)', async () => {
    const view = await render(<SddSpecPage {...baseProps} />);

    expectAccessible(view, 'sdd-title', { role: 'header', label: 'SPEC-3001 · socle mobile' });
    expectAccessible(view, 'sdd-health', {
      role: 'text',
      label: 'Santé de l’API : API joignable',
    });
    expectAccessible(view, 'sdd-clock', {
      role: 'text',
      label: 'Horloge (Europe/Paris) : 13:20',
    });
  });

  it('respecte la cible tactile minimale de la plateforme (BR-PLA-03)', async () => {
    const view = await render(<SddSpecPage {...baseProps} />);

    const row = view.getByTestId('sdd-health').parent;
    expect(row).not.toBeNull();
    // A row spans the card width: only its height is a declared metric.
    expectMinTouchTarget(row, { height: 48 });
  });
});

describe('[SPEC-3001] écran « Configuration invalide »', () => {
  it('liste les clés manquantes sans révéler de valeur (CL-2)', async () => {
    const view = await render(
      <ConfigErrorPage
        missing={['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY']}
        invalid={[]}
      />,
    );

    expect(view.getByTestId('config-error-title')).toHaveTextContent('Configuration invalide');
    expect(view.getByText('EXPO_PUBLIC_API_URL')).toBeTruthy();
    expect(view.getByText('EXPO_PUBLIC_SUPABASE_ANON_KEY')).toBeTruthy();
    expectAccessible(view, 'config-error-title', { role: 'header' });
  });

  it('liste les clés invalides avec leur motif, jamais leur valeur', async () => {
    const view = await render(
      <ConfigErrorPage
        missing={[]}
        invalid={[{ key: 'EXPO_PUBLIC_ENABLE_SDD_PAGES', message: 'valeur attendue 0 ou 1' }]}
      />,
    );

    expect(view.getByTestId('config-invalid-EXPO_PUBLIC_ENABLE_SDD_PAGES')).toHaveTextContent(
      /EXPO_PUBLIC_ENABLE_SDD_PAGES — valeur attendue 0 ou 1/,
    );
  });
});
