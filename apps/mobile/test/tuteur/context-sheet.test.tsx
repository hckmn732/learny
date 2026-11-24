// Jest + RNTL [SPEC-3303] — fiche du contexte transmis au tuteur (BR-TUT-02, CA-5, ADR-3010 § 3).
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { ContextSheet } from '../../src/features/tuteur/ContextSheet';

import { CONTEXT_ITEMS } from './fixtures';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderSheet(element: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>);
}

describe('[SPEC-3303] contexte transmis au tuteur', () => {
  it('liste les six éléments avec leur état d’inclusion (BR-TUT-02)', async () => {
    const view = await renderSheet(
      <ContextSheet
        visible
        items={CONTEXT_ITEMS}
        include={{ formation: true, chapter: true, profile: false }}
        onToggle={() => undefined}
        onClose={() => undefined}
      />,
    );
    await waitFor(() => {
      expect(view.getByTestId('tutor-context-sheet')).toBeTruthy();
    });
    expect(view.getByText('Formation')).toBeTruthy();
    expect(view.getByText('SAP S/4HANA Finance')).toBeTruthy();
    expect(view.getByTestId('tutor-context-formation')).toHaveTextContent(/Inclus/);
    expect(view.getByTestId('tutor-context-profile')).toHaveTextContent(/Retiré/);
  });

  it('retire un élément du contexte pour la prochaine question (CA-5)', async () => {
    const onToggle = jest.fn();
    await renderSheet(
      <ContextSheet
        visible
        items={CONTEXT_ITEMS}
        include={{ formation: true, chapter: true, profile: false }}
        onToggle={onToggle}
        onClose={() => undefined}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('tutor-context-switch-formation')).toBeTruthy();
    });
    await fireEvent(screen.getByTestId('tutor-context-switch-formation'), 'valueChange', false);
    expect(onToggle).toHaveBeenCalledWith('formation');
  });

  it('affiche un état vide honnête quand le serveur ne fournit aucun élément', async () => {
    await renderSheet(
      <ContextSheet
        visible
        items={[]}
        include={{}}
        onToggle={() => undefined}
        onClose={() => undefined}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('tutor-context-empty')).toBeTruthy();
    });
  });
});
