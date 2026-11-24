// Jest + RNTL [SPEC-3502] — écran À propos (EF-6, CA-2).
//
// L'écran affiche la version, le build et la version de runtime du manifeste, le nombre de licences
// du fichier généré et les trois liens légaux du web. Aucune valeur n'est recopiée dans l'écran.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AboutScreen, versionLabels } from '../../src/features/profil/AboutScreen';

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

const MANIFEST = {
  version: '1.0.0',
  runtimeVersion: '12ab34cd',
  android: { versionCode: 482 },
  ios: { buildNumber: '482' },
};

async function renderAbout(options: {
  onBack?: () => void;
  onOpenWeb?: (path: string) => void;
} = {}): Promise<void> {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AboutScreen manifest={MANIFEST} {...options} />
    </SafeAreaProvider>,
  );
}

describe('[SPEC-3502] écran À propos', () => {
  it('affiche la version, le build et la version de runtime (EF-6)', async () => {
    await renderAbout();
    expect(screen.getByTestId('about-version')).toHaveTextContent('Version 1.0.0');
    expect(screen.getByTestId('about-build')).toHaveTextContent('Build 482');
    expect(screen.getByTestId('about-runtime')).toHaveTextContent('Runtime 12ab34cd');
    expect(screen.getByTestId('about-platform')).toBeTruthy();
  });

  it('compte les licences du fichier généré et les déplie (EF-6)', async () => {
    await renderAbout();
    const count = screen.getByTestId('about-licenses-count');
    expect(count).toHaveTextContent(/\d+ licences open source/u);
    expect(screen.queryByTestId('about-licenses-list')).toBeNull();
    await fireEvent.press(screen.getByTestId('about-licenses-toggle'));
    const list = screen.getByTestId('about-licenses-list');
    expect(list).toBeTruthy();
    // Les polices embarquées et les dépendances directes sont bien dans le fichier versionné.
    expect(screen.getByText('Inter')).toBeTruthy();
    expect(screen.getByText('SpaceGrotesk')).toBeTruthy();
    expect(screen.getByText('expo')).toBeTruthy();
  });

  it('ouvre les pages légales du web et revient en arrière (BR-PLA-05)', async () => {
    const opened: string[] = [];
    const onBack = jest.fn();
    await renderAbout({ onOpenWeb: (path) => opened.push(path), onBack });
    await fireEvent.press(screen.getByTestId('about-row-privacy'));
    await fireEvent.press(screen.getByTestId('about-row-terms'));
    await fireEvent.press(screen.getByTestId('about-row-support'));
    expect(opened).toEqual(['/legal/confidentialite', '/legal/cgu', '/parametres']);
    await fireEvent.press(screen.getByTestId('about-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('lit le manifeste sans dépendre de la plateforme du test', () => {
    expect(versionLabels(null)).toEqual({ version: '1.0.0', build: '1', runtime: '—' });
    expect(versionLabels(MANIFEST)).toEqual({
      version: '1.0.0',
      build: '482',
      runtime: '12ab34cd',
    });
  });
});
