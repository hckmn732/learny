// Jest + RNTL — SPEC-3002 CA-1: the sheet of the fiches. Kept in its own suite because the
// native modal and its safe-area provider do not share a renderer with the other overlays.
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { Sheet, Text } from '../../src/ui';

/** Insets of a 412 × 915 dp Android device. */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function renderSheet(children: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>);
}

describe('[SPEC-3002] feuilles et retours', () => {
  describe('Sheet', () => {
    it('affiche son titre et son contenu quand elle est visible', async () => {
      await renderSheet(
        <Sheet visible onClose={() => undefined} title="Fiche de la série" testID="sheet">
          <Text>Contenu de la fiche</Text>
        </Sheet>,
      );
      expect(screen.getByTestId('sheet')).toBeTruthy();
      expect(screen.getByText('Fiche de la série')).toBeTruthy();
      expect(screen.getByText('Contenu de la fiche')).toBeTruthy();
    });

    it('se ferme par la croix et par le fond (canevas § 3)', async () => {
      const onClose = jest.fn();
      await renderSheet(
        <Sheet visible onClose={onClose} title="Fiche" testID="sheet-close">
          <Text>Contenu</Text>
        </Sheet>,
      );
      await fireEvent.press(screen.getByTestId('sheet-close-close'));
      expect(onClose).toHaveBeenCalledTimes(1);
      // The backdrop is masked for assistive technologies by `accessibilityViewIsModal` (the
      // sheet is a modal): the close button carries the accessible action, the backdrop stays a
      // pointer affordance.
      const backdrop = screen.getByTestId('sheet-close-backdrop', { includeHiddenElements: true });
      expect(backdrop).toBeTruthy();
      await fireEvent.press(backdrop);
      expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('ne rend rien quand elle est fermée', async () => {
      await renderSheet(
        <Sheet visible={false} onClose={() => undefined} title="Fiche" testID="sheet-hidden">
          <Text>Contenu</Text>
        </Sheet>,
      );
      expect(screen.queryByTestId('sheet-hidden')).toBeNull();
    });
  });
});
