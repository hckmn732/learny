// Jest + RNTL — SPEC-3002 CA-1, CA-3, ET-6: segmented control, switch, list rows and the Android FAB.
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { Fab, ListGroupHeader, ListRow, Segmented, Switch } from '../../src/ui';
import { expectAccessible, expectMinTouchTarget } from '../utils/expectAccessible';

describe('[SPEC-3002] contrôles', () => {
  const OPTIONS = [
    { value: 'day', label: 'Jour' },
    { value: 'week', label: 'Semaine' },
    { value: 'month', label: 'Mois' },
  ];

  describe('Segmented', () => {
    it('est annoncé comme une liste d’onglets avec l’onglet sélectionné (ET-6)', async () => {
      await render(
        <Segmented
          options={OPTIONS}
          value="week"
          onChange={() => undefined}
          label="Vue du programme"
          testID="segmented"
        />,
      );
      const group = screen.getByTestId('segmented');
      expect(group.props.accessibilityRole).toBe('tablist');
      expect(group.props.accessibilityLabel).toBe('Vue du programme');
      const selected = screen.getByTestId('segmented-week');
      expect(selected.props.accessibilityRole).toBe('tab');
      expect(selected.props.accessibilityState).toEqual({ selected: true, disabled: false });
      const day = screen.getByTestId('segmented-day').props as {
        accessibilityState?: { selected?: boolean };
      };
      expect(day.accessibilityState?.selected).toBe(false);
    });

    it('change de sélection avec un retour haptique (EF-4)', async () => {
      const onChange = jest.fn();
      await render(
        <Segmented
          options={OPTIONS}
          value="week"
          onChange={onChange}
          label="Vue"
          testID="segmented-change"
        />,
      );
      await fireEvent.press(screen.getByTestId('segmented-change-month'));
      expect(onChange).toHaveBeenCalledWith('month');
      expect(Haptics.selectionAsync).toHaveBeenCalled();
    });

    it('ignore un appui quand il est désactivé', async () => {
      const onChange = jest.fn();
      await render(
        <Segmented
          options={OPTIONS}
          value="ios"
          onChange={onChange}
          label="Plateforme"
          disabled
          testID="segmented-disabled"
        />,
      );
      await fireEvent.press(screen.getByTestId('segmented-disabled-day'));
      expect(onChange).not.toHaveBeenCalled();
    });

    it('offre la cible minimale sur chaque segment (CA-3)', async () => {
      await render(
        <Segmented
          options={OPTIONS}
          value="week"
          onChange={() => undefined}
          label="Vue"
          testID="segmented-target"
        />,
      );
      expectMinTouchTarget(screen.getByTestId('segmented-target-day'), { height: 48 });
    });
  });

  describe('Switch', () => {
    it('expose l’état coché et son libellé (ET-6)', async () => {
      await render(
        <Switch label="Notifications" value onValueChange={() => undefined} testID="switch" />,
      );
      expect(screen.getByText('Notifications')).toBeTruthy();
      const control = screen.getByTestId('switch-control');
      expect(control.props.accessibilityRole).toBe('switch');
      expect(control.props.accessibilityState).toEqual({ checked: true, disabled: false });
    });

    it('transmet le changement de valeur', async () => {
      const onValueChange = jest.fn();
      await render(
        <Switch
          label="Notifications"
          value={false}
          onValueChange={onValueChange}
          testID="switch-change"
        />,
      );
      await fireEvent(screen.getByTestId('switch-change-control'), 'valueChange', true);
      expect(onValueChange).toHaveBeenCalledWith(true);
    });

    it('s’étire au-delà de la cible minimale', async () => {
      await render(
        <Switch
          label="Notifications"
          description="Rappels"
          value
          onValueChange={() => undefined}
          testID="switch-row"
        />,
      );
      expectMinTouchTarget(screen.getByTestId('switch-row'), { height: 48 });
    });
  });

  describe('ListRow', () => {
    it('est un bouton qui annonce son titre et son sous-titre', async () => {
      const onPress = jest.fn();
      await render(
        <ListRow
          title="Comptabilité générale"
          subtitle="Module 3"
          icon="book"
          onPress={onPress}
          testID="row"
        />,
      );
      expectAccessible(screen, 'row', { role: 'button', label: 'Comptabilité générale, Module 3' });
      expectMinTouchTarget(screen.getByTestId('row'), { height: 48 });
      await fireEvent.press(screen.getByTestId('row'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('n’est pas un bouton quand il n’ouvre rien', async () => {
      await render(<ListRow title="Version" subtitle="1.0.0" testID="row-static" />);
      expect(screen.getByTestId('row-static').props.accessibilityRole).toBeUndefined();
    });
  });

  describe('ListGroupHeader', () => {
    it('affiche un intitulé de groupe', async () => {
      await render(<ListGroupHeader title="Réglages" testID="group-header" />);
      expect(screen.getByText('Réglages')).toBeTruthy();
      expectAccessible(screen, 'group-header', {});
    });
  });

  describe('Fab', () => {
    it('est un bouton de 56 dp sur Android (CA-3)', async () => {
      const onPress = jest.fn();
      await render(
        <Fab icon="plus" accessibilityLabel="Nouvelle formation" onPress={onPress} testID="fab" />,
      );
      expectAccessible(screen, 'fab', { role: 'button', label: 'Nouvelle formation' });
      expectMinTouchTarget(screen.getByTestId('fab'), { width: 48, height: 48 });
      await fireEvent.press(screen.getByTestId('fab'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });
});
