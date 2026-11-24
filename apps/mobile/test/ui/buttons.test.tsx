// Jest + RNTL — SPEC-3002 CA-1, CA-3, CL-2: button and icon button.
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

import { theme } from '../../src/theme';
import { Button, IconButton } from '../../src/ui';
import { expectAccessible, expectMinTouchTarget } from '../utils/expectAccessible';
/** Flattened style of a rendered node, typed so that the assertions stay checked. */
function styleOf(node: { props: { style?: unknown } }): TextStyle & ViewStyle {
  return StyleSheet.flatten(node.props.style as never) as TextStyle & ViewStyle;
}

describe('[SPEC-3002] boutons', () => {
  describe('Button', () => {
    it('appelle onPress et confirme par un retour haptique (EF-4)', async () => {
      const onPress = jest.fn();
      await render(<Button label="Commencer" onPress={onPress} testID="button" />);
      await fireEvent.press(screen.getByTestId('button'));
      expect(onPress).toHaveBeenCalledTimes(1);
      expect(Haptics.impactAsync).toHaveBeenCalled();
    });

    it('refuse un second appui pendant le chargement (CL-2)', async () => {
      const onPress = jest.fn();
      await render(
        <Button label="Chargement…" loading onPress={onPress} testID="button-loading" />,
      );
      await fireEvent.press(screen.getByTestId('button-loading'));
      await fireEvent.press(screen.getByTestId('button-loading'));
      expect(onPress).not.toHaveBeenCalled();
      expect(screen.getByTestId('button-spinner')).toBeTruthy();
      expect(screen.getByTestId('button-loading').props.accessibilityState).toEqual({
        disabled: true,
        busy: true,
      });
    });

    it('n’appelle rien quand il est désactivé', async () => {
      const onPress = jest.fn();
      await render(
        <Button label="Indisponible" disabled onPress={onPress} testID="button-disabled" />,
      );
      await fireEvent.press(screen.getByTestId('button-disabled'));
      expect(onPress).not.toHaveBeenCalled();
    });

    it('rend les quatre variantes avec le libellé du thème', async () => {
      await render(
        <>
          <Button label="Citron" onPress={() => undefined} testID="button-primary" />
          <Button label="Encre" variant="ink" onPress={() => undefined} testID="button-ink" />
          <Button
            label="Contour"
            variant="outline"
            onPress={() => undefined}
            testID="button-outline"
          />
          <Button label="Texte" variant="text" onPress={() => undefined} testID="button-text" />
        </>,
      );
      expect(styleOf(screen.getByTestId('button-primary')).backgroundColor).toBe(theme.colors.lime);
      expect(styleOf(screen.getByTestId('button-ink')).backgroundColor).toBe(theme.colors.ink);
      expect(styleOf(screen.getByTestId('button-outline')).backgroundColor).toBe(
        theme.colors.surface,
      );
      expect(styleOf(screen.getByTestId('button-text')).backgroundColor).toBe('transparent');
    });

    it('offre la cible minimale de la plateforme (CA-3, BR-PLA-02)', async () => {
      await render(
        <Button label="Cible" size="sm" onPress={() => undefined} testID="button-small" />,
      );
      expectAccessible(screen, 'button-small', { role: 'button', label: 'Cible' });
      expectMinTouchTarget(screen.getByTestId('button-small'), { height: 48 });
    });

    it('grandit avec le texte : aucune hauteur fixe (CL-1)', async () => {
      await render(
        <Button label="Commencer la séance" onPress={() => undefined} testID="button-grow" />,
      );
      const style = styleOf(screen.getByTestId('button-grow'));
      expect(style.height).toBeUndefined();
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
    });
  });

  describe('IconButton', () => {
    it('exige et expose un libellé d’accessibilité (CL-4)', async () => {
      await render(
        <IconButton
          name="bell"
          accessibilityLabel="Notifications"
          onPress={() => undefined}
          dot
          testID="icon-button"
        />,
      );
      expectAccessible(screen, 'icon-button', { role: 'button', label: 'Notifications' });
      expectMinTouchTarget(screen.getByTestId('icon-button'), { width: 48, height: 48 });
    });

    it('appelle onPress', async () => {
      const onPress = jest.fn();
      await render(
        <IconButton
          name="search"
          accessibilityLabel="Rechercher"
          onPress={onPress}
          testID="icon-button-plain"
        />,
      );
      await fireEvent.press(screen.getByTestId('icon-button-plain'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });
});
