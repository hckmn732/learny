// Jest + RNTL [SPEC-3202] — sélecteur de formation (BR-FOR-11, CL-3, CL-4).
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FormationSwitcherSheet } from '../../src/features/programme/FormationSwitcherSheet';

import { FORMATION_ID, sidebar } from './fixtures';

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

function disabledState(testID: string): boolean {
  const state = screen.getByTestId(testID).props.accessibilityState as
    { readonly disabled?: boolean } | undefined;
  return state?.disabled === true;
}

async function renderSheet(
  overrides: Partial<Parameters<typeof FormationSwitcherSheet>[0]> = {},
): Promise<void> {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <FormationSwitcherSheet
        visible
        onClose={jest.fn()}
        formations={sidebar().formations}
        currentFormationId={FORMATION_ID}
        offline={false}
        pending={false}
        error={null}
        onSelect={jest.fn()}
        onResumeOnWeb={jest.fn()}
        {...overrides}
      />
    </SafeAreaProvider>,
  );
}

describe('[SPEC-3202] sélecteur de formation', () => {
  it('liste les formations actives et en pause avec leur avancement (BR-FOR-11)', async () => {
    await renderSheet();
    expect(screen.getByTestId('formation-switcher')).toBeTruthy();
    expect(screen.getByText('SAP S/4HANA Finance')).toBeTruthy();
    expect(screen.getByText('Scrum Product Owner')).toBeTruthy();
    expect(screen.getByText('En pause')).toBeTruthy();
    expect(screen.getByText('38 % · Formation courante')).toBeTruthy();
  });

  it('sélectionne une autre formation active (CA-3)', async () => {
    const onSelect = jest.fn();
    await renderSheet({ onSelect, currentFormationId: 'autre' });
    await fireEvent.press(screen.getByTestId(`formation-option-${FORMATION_ID}`));
    expect(onSelect).toHaveBeenCalledWith(FORMATION_ID);
  });

  it('renvoie une formation en pause vers le web au lieu de la sélectionner (CL-3, EF-7)', async () => {
    const onSelect = jest.fn();
    const onResumeOnWeb = jest.fn();
    await renderSheet({ onSelect, onResumeOnWeb });
    expect(disabledState('formation-option-00000000-0000-4000-8000-0000000000f2')).toBe(true);
    await fireEvent.press(
      screen.getByTestId('formation-option-00000000-0000-4000-8000-0000000000f2'),
    );
    expect(onSelect).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Reprendre sur le web'));
    expect(onResumeOnWeb).toHaveBeenCalledWith('00000000-0000-4000-8000-0000000000f2');
  });

  it('désactive le changement hors ligne et l’annonce (CL-4)', async () => {
    await renderSheet({ offline: true });
    expect(screen.getByTestId('formation-switcher-offline')).toBeTruthy();
    expect(disabledState(`formation-option-${FORMATION_ID}`)).toBe(true);
  });
});
