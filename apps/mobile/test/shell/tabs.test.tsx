// Jest + RNTL [SPEC-3102] — barre des cinq onglets (EF-1, CA-1, ET-5, BR-PLA-02).
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppTabBar, type AppTabBarProps } from '../../src/navigation/AppTabBar';
import { TABS } from '../../src/navigation/tabs';
import { expectAccessible, expectMinTouchTarget } from '../utils/expectAccessible';

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

interface Harness {
  readonly dispatch: jest.Mock;
  readonly emit: jest.Mock;
  readonly navigateToTab: jest.Mock;
  readonly props: AppTabBarProps;
}

function harness(activeIndex = 0): Harness {
  const dispatch = jest.fn();
  const emit = jest.fn(() => ({ defaultPrevented: false }));
  const navigateToTab = jest.fn();
  const routes = TABS.map((tab) => ({
    key: `route-${tab.name}`,
    name: tab.name,
    state: { key: `pile-${tab.name}` },
  }));
  const descriptors = Object.fromEntries(
    routes.map((route) => [route.key, { navigation: { dispatch } }]),
  );
  const props = {
    state: { index: activeIndex, routes },
    descriptors,
    emitter: { emit },
    navigateToTab,
  } as unknown as AppTabBarProps;
  return { dispatch, emit, navigateToTab, props };
}

async function renderBar(activeIndex = 0): Promise<Harness> {
  const built = harness(activeIndex);
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AppTabBar {...built.props} />
    </SafeAreaProvider>,
  );
  return built;
}

describe('[SPEC-3102] onglets natifs de la coquille', () => {
  it('affiche les cinq onglets avec les libellés exacts de la maquette (CA-1)', async () => {
    await renderBar();
    expect(screen.getByTestId('app-tab-bar')).toBeTruthy();
    for (const tab of TABS) {
      expect(screen.getByTestId(tab.testID)).toBeTruthy();
    }
    expect(screen.getByText('Aujourd’hui')).toBeTruthy();
    expect(screen.getByText('Programme')).toBeTruthy();
    expect(screen.getByText('Réviser')).toBeTruthy();
    expect(screen.getByText('Agenda')).toBeTruthy();
    expect(screen.getByText('Profil')).toBeTruthy();
  });

  it('annonce chaque onglet avec son rang et son état sélectionné (ET-5)', async () => {
    await renderBar();
    expectAccessible(screen, 'tab-aujourdhui', {
      role: 'tab',
      label: 'Aujourd’hui, onglet 1 sur 5',
    });
    expect(screen.getByTestId('tab-aujourdhui').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByTestId('tab-profil').props.accessibilityState).toEqual({ selected: false });
  });

  it('garde une cible tactile d’au moins 48 dp par onglet (BR-PLA-02)', async () => {
    await renderBar();
    for (const tab of TABS) {
      expectMinTouchTarget(screen.getByTestId(tab.testID), { height: 48 });
    }
  });

  it('sélectionne un autre onglet par son état, pas par son nom (EF-1)', async () => {
    const built = await renderBar();
    await fireEvent.press(screen.getByTestId('tab-profil'));
    expect(built.navigateToTab).toHaveBeenCalledWith('route-profil');
    expect(built.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tabPress', target: 'route-profil' }),
    );
    expect(built.dispatch).not.toHaveBeenCalled();
  });

  it('revient à la racine de la pile quand on appuie sur l’onglet actif (EF-1, CA-1)', async () => {
    const built = await renderBar();
    await fireEvent.press(screen.getByTestId('tab-aujourdhui'));
    expect(built.dispatch).toHaveBeenCalledWith({
      type: 'POP_TO_TOP',
      target: 'pile-aujourdhui',
    });
    expect(built.navigateToTab).not.toHaveBeenCalled();
  });

  it('respecte un `tabPress` déjà empêché par un écran (ET-5)', async () => {
    const built = harness();
    built.emit.mockReturnValue({ defaultPrevented: true });
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <AppTabBar {...built.props} />
      </SafeAreaProvider>,
    );
    await fireEvent.press(screen.getByTestId('tab-agenda'));
    expect(built.navigateToTab).not.toHaveBeenCalled();
  });
});
