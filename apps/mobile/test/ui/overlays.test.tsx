// Jest + RNTL — SPEC-3002 CA-1, ET-6: sheet, toast, banners, empty and error states, skeleton.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { fr } from '@learny/i18n';

import { Banner, EmptyState, ErrorState, Skeleton, Toast, toastDuration } from '../../src/ui';
import { expectAccessible } from '../utils/expectAccessible';

describe('[SPEC-3002] feuilles et retours', () => {
  describe('Toast', () => {
    it('est annoncé comme une alerte et disparaît après sa durée (ET-6)', async () => {
      const onHide = jest.fn();
      await render(
        <Toast visible message="Séance reportée" duration={20} onHide={onHide} testID="toast" />,
      );
      expectAccessible(screen, 'toast', { role: 'alert', label: 'Séance reportée' });
      expect(screen.getByTestId('toast').props.accessibilityLiveRegion).toBe('assertive');
      await waitFor(() => {
        expect(onHide).toHaveBeenCalledTimes(1);
      });
    });

    it('donne plus de temps à un toast qui porte une action', async () => {
      const onHide = jest.fn();
      await render(
        <Toast
          visible
          message="Report annulé"
          actionLabel="Annuler"
          duration={30}
          onAction={() => undefined}
          onHide={onHide}
          testID="toast-action"
        />,
      );
      expect(toastDuration('Annuler')).toBeGreaterThan(toastDuration());
      await waitFor(() => {
        expect(onHide).toHaveBeenCalledTimes(1);
      });
    });

    it('ne rend rien quand il est masqué', async () => {
      await render(<Toast visible={false} message="Rien" testID="toast-hidden" />);
      expect(screen.queryByTestId('toast-hidden')).toBeNull();
    });
  });

  describe('Banner', () => {
    it('porte le bandeau hors ligne avec son rôle d’alerte', async () => {
      await render(
        <Banner tone="offline" description={fr.mobile.ui.offlineBody} testID="banner" />,
      );
      expectAccessible(screen, 'banner', { role: 'alert' });
      expect(screen.getByText(fr.mobile.ui.offlineTitle)).toBeTruthy();
      expect(screen.getByText(fr.mobile.ui.offlineBody)).toBeTruthy();
    });

    it('expose l’action du bandeau', async () => {
      const onPress = jest.fn();
      await render(
        <Banner
          tone="info"
          title="Tuteur"
          action={{ label: 'Voir', onPress }}
          testID="banner-info"
        />,
      );
      await fireEvent.press(screen.getByLabelText('Voir'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('EmptyState', () => {
    it('explique le vide et propose une action', async () => {
      const onPress = jest.fn();
      await render(
        <EmptyState
          title="Aucune activité"
          description="Agenda libre"
          action={{ label: 'Ajouter', onPress }}
          testID="empty"
        />,
      );
      expect(screen.getByText('Aucune activité')).toBeTruthy();
      expect(screen.getByText('Agenda libre')).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('Ajouter'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('ErrorState', () => {
    it('propose « Réessayer » et rappelle la requête', async () => {
      const onRetry = jest.fn();
      await render(<ErrorState onRetry={onRetry} testID="error" />);
      expectAccessible(screen, 'error', { role: 'alert' });
      expect(screen.getByText(fr.mobile.ui.errorTitle)).toBeTruthy();
      await fireEvent.press(screen.getByTestId('error-retry'));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });

  describe('Skeleton', () => {
    it('annonce le chargement et empile ses lignes', async () => {
      await render(<Skeleton lines={3} testID="skeleton" />);
      expect(screen.getByTestId('skeleton').props.accessibilityRole).toBe('progressbar');
      expect(screen.getByTestId('skeleton-line-0')).toBeTruthy();
      expect(screen.getByTestId('skeleton-line-2')).toBeTruthy();
    });
  });
});
