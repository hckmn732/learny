// Jest + RNTL — SPEC-3002 CA-1, CA-3, CL-3: chip, stat card and progress bar.
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

/** Flattened style of a rendered node, typed so that the assertions stay checked. */
/** Announced value of a progress bar. */
function valueOf(node: { props: unknown }): number | undefined {
  const props = node.props as { accessibilityValue?: { now?: number } };
  return props.accessibilityValue?.now;
}

/** Flattened style of a rendered node, typed so that the assertions stay checked. */
function styleOf(node: { props: { style?: unknown } }): TextStyle & ViewStyle {
  return StyleSheet.flatten(node.props.style as never) as TextStyle & ViewStyle;
}

import { theme } from '../../src/theme';
import { Chip, ProgressBar, StatCard } from '../../src/ui';
import { expectAccessible, expectMinTouchTarget } from '../utils/expectAccessible';

describe('[SPEC-3002] affichage de données', () => {
  describe('Chip', () => {
    it('rend chaque tonalité avec ses couleurs de jetons', async () => {
      await render(
        <>
          <Chip label="Neutre" testID="chip-neutral" />
          <Chip label="En cours" tone="lime" testID="chip-lime" />
          <Chip label="Tuteur" tone="indigo" testID="chip-indigo" />
          <Chip label="Validé" tone="green" testID="chip-green" />
          <Chip label="Lacunes" tone="orange" testID="chip-orange" />
          <Chip label="Filtrer" tone="outline" testID="chip-outline" />
        </>,
      );
      expect(styleOf(screen.getByTestId('chip-lime')).backgroundColor).toBe(theme.colors.lime);
      expect(styleOf(screen.getByTestId('chip-indigo')).backgroundColor).toBe(
        theme.colors.indigoSoft,
      );
      expect(styleOf(screen.getByTestId('chip-green')).backgroundColor).toBe(
        theme.colors.greenSoft,
      );
      expect(styleOf(screen.getByTestId('chip-orange')).backgroundColor).toBe(
        theme.colors.orangeSoft,
      );
    });

    it('ramène un libellé long sur deux lignes (CL-3)', async () => {
      await render(
        <Chip label="Comptabilité générale et clôture des comptes" tone="ink" testID="chip-long" />,
      );
      const label = screen.getByText('Comptabilité générale et clôture des comptes');
      expect(label.props.numberOfLines).toBe(2);
      expect(styleOf(label).flexShrink).toBe(1);
    });

    it('n’est une cible que lorsqu’il est actionnable', async () => {
      const onPress = jest.fn();
      await render(<Chip label="Filtrer" tone="outline" onPress={onPress} testID="chip-action" />);
      expectAccessible(screen, 'chip-action', { role: 'button', label: 'Filtrer' });
      expectMinTouchTarget(screen.getByTestId('chip-action'), { height: 48 });
      await fireEvent.press(screen.getByTestId('chip-action'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('StatCard', () => {
    it('affiche le chiffre, l’unité et le libellé', async () => {
      await render(<StatCard label="Rétention" value="86" unit="%" testID="stat" />);
      expect(screen.getByText('Rétention')).toBeTruthy();
      expect(screen.getByText('86')).toBeTruthy();
      expect(screen.getByText('%')).toBeTruthy();
    });

    it('devient un bouton avec un libellé composé quand il est actionnable', async () => {
      const onPress = jest.fn();
      await render(
        <StatCard label="Série" value="12" unit="j" onPress={onPress} testID="stat-action" />,
      );
      // SPEC-3502 BR-PLA-03 — la valeur et son unité sont séparées par une espace : TalkBack
      // annonçait « Série : 12j ». L'étiquette est désormais « Série : 12 j ».
      expectAccessible(screen, 'stat-action', { role: 'button', label: 'Série : 12 j' });
      await fireEvent.press(screen.getByTestId('stat-action'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('porte la variante citron du jour', async () => {
      await render(<StatCard label="Série" value="12" tone="lime" testID="stat-lime" />);
      expect(styleOf(screen.getByTestId('stat-lime')).backgroundColor).toBe(theme.colors.lime);
    });
  });

  describe('ProgressBar', () => {
    it('annonce sa valeur comme progressbar (ET-6)', async () => {
      await render(<ProgressBar value={0.38} label="Progression du chapitre" testID="progress" />);
      const node = screen.getByTestId('progress');
      expect(node.props.accessibilityRole).toBe('progressbar');
      expect(node.props.accessibilityLabel).toBe('Progression du chapitre');
      expect(node.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 38 });
      expect(styleOf(screen.getByTestId('progress-fill')).width).toBe('38%');
    });

    it('borne la valeur entre 0 et 100', async () => {
      await render(<ProgressBar value={1.4} label="Progression" testID="progress-clamped" />);
      expect(valueOf(screen.getByTestId('progress-clamped'))).toBe(100);
    });

    it('dessine la progression en segments du quiz', async () => {
      await render(
        <ProgressBar
          variant="segments"
          value={0.4}
          segments={5}
          current={2}
          label="Questions répondues"
          testID="segments"
        />,
      );
      expect(valueOf(screen.getByTestId('segments'))).toBe(40);
      expect(screen.getByTestId('progress-segment-0')).toBeTruthy();
      expect(screen.getByTestId('progress-segment-4')).toBeTruthy();
    });
  });
});
