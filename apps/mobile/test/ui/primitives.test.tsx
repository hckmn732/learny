// Jest + RNTL — SPEC-3002 CA-1, CA-3, ET-5, ET-6: text, icons, card, avatar and badge.
import { render, screen } from '@testing-library/react-native';
import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

/** Flattened style of a rendered node, typed so that the assertions stay checked. */
function styleOf(node: { props: { style?: unknown } }): TextStyle & ViewStyle {
  return StyleSheet.flatten(node.props.style as never) as TextStyle & ViewStyle;
}

import { theme } from '../../src/theme';
import { Avatar, Badge, Card, Icon, ICON_NAMES, Text } from '../../src/ui';
import { expectAccessible } from '../utils/expectAccessible';

describe('[SPEC-3002] composants de base', () => {
  describe('Text', () => {
    it('applique la variante typographique du thème', async () => {
      await render(
        <Text testID="text-largeTitle" variant="largeTitle">
          Titre
        </Text>,
      );
      const style = styleOf(screen.getByTestId('text-largeTitle'));
      expect(style.fontSize).toBe(theme.type.largeTitle.fontSize);
      expect(style.fontFamily).toBe(theme.type.largeTitle.fontFamily);
    });

    it('annonce un titre comme en-tête (ET-6)', async () => {
      await render(<Text variant="sectionTitle">Section</Text>);
      expect(screen.getByText('Section').props.accessibilityRole).toBe('header');
    });

    it('plafonne les titres à 160 % et laisse le texte courant libre (ET-5, CL-1)', async () => {
      await render(
        <>
          <Text variant="largeTitle">Titre</Text>
          <Text variant="body">Corps</Text>
        </>,
      );
      expect(screen.getByText('Titre').props.maxFontSizeMultiplier).toBe(1.6);
      expect(screen.getByText('Corps').props.maxFontSizeMultiplier).toBeUndefined();
      expect(screen.getByText('Corps').props.allowFontScaling).toBe(true);
    });
  });

  describe('Icon', () => {
    it('rend chaque icône du jeu porté de la maquette', async () => {
      expect(ICON_NAMES.length).toBeGreaterThanOrEqual(45);
      for (const name of ICON_NAMES) {
        const { unmount } = await render(<Icon name={name} testID={`icon-${name}`} />);
        expect(screen.getByTestId(`icon-${name}`, { includeHiddenElements: true })).toBeTruthy();
        await unmount();
      }
    });

    it('masque une icône décorative et nomme une icône porteuse de sens (BR-PLA-03)', async () => {
      await render(
        <>
          <Icon name="home" testID="icon-decorative" />
          <Icon name="alert" accessibilityLabel="Attention" testID="icon-labelled" />
        </>,
      );
      const decorative = screen.getByTestId('icon-decorative', { includeHiddenElements: true });
      expect(decorative.props.accessibilityElementsHidden).toBe(true);
      expectAccessible(screen, 'icon-labelled', { role: 'image', label: 'Attention' });
    });
  });

  describe('Card', () => {
    it('dessine la carte blanche de rayon 22 (EF-1)', async () => {
      await render(
        <Card testID="card-surface">
          <Text>Contenu</Text>
        </Card>,
      );
      const style = styleOf(screen.getByTestId('card-surface'));
      expect(style.borderRadius).toBe(22);
      expect(style.backgroundColor).toBe(theme.colors.surface);
    });

    it('dessine la carte encre du tuteur', async () => {
      await render(
        <Card testID="card-ink" tone="ink" padded={false}>
          <Text>Réponse</Text>
        </Card>,
      );
      const style = styleOf(screen.getByTestId('card-ink'));
      expect(style.backgroundColor).toBe(theme.colors.ink);
      expect(style.padding).toBeUndefined();
    });
  });

  describe('Avatar', () => {
    it('affiche les initiales sur le disque indigo', async () => {
      await render(<Avatar initials="AP" testID="avatar" />);
      const style = styleOf(screen.getByTestId('avatar'));
      expect(style.backgroundColor).toBe(theme.colors.indigo);
      expectAccessible(screen, 'avatar', { role: 'image', label: 'AP' });
    });
  });

  describe('Badge', () => {
    it('affiche un compteur et son libellé accessible', async () => {
      await render(
        <Badge count={3} accessibilityLabel="3 notifications non lues" testID="badge" />,
      );
      expect(screen.getByText('3')).toBeTruthy();
      expectAccessible(screen, 'badge', { label: '3 notifications non lues' });
    });

    it('plafonne au maximum demandé', async () => {
      await render(<Badge count={120} accessibilityLabel="120 notifications" testID="badge-max" />);
      expect(screen.getByText('99+')).toBeTruthy();
    });
  });
});
