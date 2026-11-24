// Jest + RNTL [SPEC-3203] — feuille du filtre par formation (EF-1, EF-8, CA-3).
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FormationFilterSheet } from '../../src/features/agenda/FormationFilterSheet';

import { FORMATIONS, GPA } from './fixtures';

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

const onSelect = jest.fn();
const onClose = jest.fn();

async function renderSheet(value = 'all'): Promise<void> {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <FormationFilterSheet
        visible
        formations={FORMATIONS}
        value={value}
        onSelect={onSelect}
        onClose={onClose}
      />
    </SafeAreaProvider>,
  );
}

describe('[SPEC-3203] feuille du filtre par formation', () => {
  beforeEach(() => {
    onSelect.mockClear();
    onClose.mockClear();
  });

  it('propose « Toutes les formations » et chaque formation (BR-AGE-01)', async () => {
    await renderSheet();
    expect(screen.getByText('Formation affichée')).toBeTruthy();
    expect(screen.getByTestId('agenda-filter-all')).toBeTruthy();
    expect(screen.getByText('Toutes les formations')).toBeTruthy();
    for (const formation of FORMATIONS) {
      expect(screen.getByTestId(`agenda-filter-${formation.id}`)).toBeTruthy();
      expect(screen.getByText(formation.title)).toBeTruthy();
    }
  });

  it('marque le filtre courant (CA-3)', async () => {
    await renderSheet(GPA.id);
    expect(screen.getByTestId(`agenda-filter-${GPA.id}`).props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByTestId('agenda-filter-all').props.accessibilityState).toEqual({
      selected: false,
    });
  });

  it('choisit une formation puis referme la feuille (CA-3)', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByTestId(`agenda-filter-${GPA.id}`));
    expect(onSelect).toHaveBeenCalledWith(GPA.id);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
