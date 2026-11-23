// Jest + RNTL [SPEC-3102] — centre de notifications (EF-3, BR-NOT-01, CA-2, CA-5).
import { cleanup, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { NotificationItem, NotificationListDto } from '@learny/contracts';

import { NotificationsView } from '../../src/features/notifications/NotificationsView';

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

function item(
  id: string,
  type: NotificationItem['type'],
  group: NotificationItem['group'],
  read: boolean,
  hour: string,
): NotificationItem {
  return {
    id,
    type,
    icon: 'validation',
    title: `Titre ${id}`,
    body: `Corps ${id}`,
    href: '/formations/sap/quiz-global',
    formationTitle: 'SAP S/4HANA Finance',
    createdAt: `2026-11-11T${hour}:00.000Z`,
    readAt: read ? '2026-11-11T13:00:00.000Z' : null,
    group,
  };
}

const PAGE: NotificationListDto = {
  items: [
    item('un', 'validation_soon', 'today', false, '13:20'),
    item('deux', 'new_gap', 'yesterday', false, '16:42'),
    item('trois', 'module_validated', 'earlier', true, '09:10'),
  ],
  total: 3,
  unreadCount: 2,
  timezone: 'Europe/Paris',
};

type View = Awaited<ReturnType<typeof render>>;
type Spies = {
  onActivate: jest.Mock;
  onReadAll: jest.Mock;
  onFilterChange: jest.Mock;
  onRetry: jest.Mock;
  onManage: jest.Mock;
  onClose: jest.Mock;
};

function spies(): Spies {
  return {
    onActivate: jest.fn(),
    onReadAll: jest.fn(),
    onFilterChange: jest.fn(),
    onRetry: jest.fn(),
    onManage: jest.fn(),
    onClose: jest.fn(),
  };
}

async function renderView(
  overrides: Partial<Parameters<typeof NotificationsView>[0]> = {},
): Promise<View & Spies> {
  const handlers = spies();
  const view = await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <NotificationsView
        status="ready"
        data={PAGE}
        filter="all"
        onFilterChange={handlers.onFilterChange}
        onReadAll={handlers.onReadAll}
        onActivate={handlers.onActivate}
        onRetry={handlers.onRetry}
        onRefresh={jest.fn()}
        onManage={handlers.onManage}
        onClose={handlers.onClose}
        refreshing={false}
        readOnly={false}
        pending={false}
        {...overrides}
      />
    </SafeAreaProvider>,
  );
  return Object.assign(view, handlers);
}

afterEach(async () => {
  await cleanup();
});

describe('[SPEC-3102] centre de notifications', () => {
  it('affiche le titre, le nombre de non lues et les trois groupes (BR-NOT-01)', async () => {
    const view = await renderView();
    expect(view.getByTestId('notifications-sheet-title')).toHaveTextContent('Notifications');
    expect(view.getByTestId('notifications-sheet-subtitle')).toHaveTextContent('2 non lues');
    expect(view.getByTestId('notifications-group-today')).toBeTruthy();
    expect(view.getByTestId('notifications-group-yesterday')).toBeTruthy();
    expect(view.getByTestId('notifications-group-earlier')).toBeTruthy();
  });

  it('montre chaque notification, son état non lu et sa formation (CA-2)', async () => {
    const view = await renderView();
    for (const id of ['un', 'deux', 'trois']) {
      expect(view.getByTestId(`notification-item-${id}`)).toBeTruthy();
    }
    expect(view.getByTestId('notification-unread-un')).toBeTruthy();
    expect(view.getByTestId('notification-unread-deux')).toBeTruthy();
    expect(view.queryByTestId('notification-unread-trois')).toBeNull();
    expect(view.getAllByText('SAP S/4HANA Finance').length).toBe(3);
  });

  it('ouvre la notification touchée (CA-2)', async () => {
    const view = await renderView();
    await fireEvent.press(view.getByTestId('notification-item-deux'));
    expect(view.onActivate).toHaveBeenCalledWith(PAGE.items[1]);
  });

  it('marque tout lu et propose le filtre des non lues (EF-3)', async () => {
    const view = await renderView();
    await fireEvent.press(view.getByTestId('notifications-read-all'));
    expect(view.onReadAll).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByTestId('notifications-filter-unread'));
    expect(view.onFilterChange).toHaveBeenCalledWith('unread');
  });

  it('désactive « Tout marquer comme lu » quand tout est lu (EF-3)', async () => {
    const view = await renderView({ data: { ...PAGE, unreadCount: 0 } });
    expect(view.getByTestId('notifications-sheet-subtitle')).toHaveTextContent('Tout est lu');
    expect(view.getByTestId('notifications-read-all').props.accessibilityState).toEqual({
      disabled: true,
    });
  });

  it('affiche l’état vide de la maquette (EF-3)', async () => {
    const view = await renderView({ data: { ...PAGE, items: [], total: 0, unreadCount: 0 } });
    expect(view.getByTestId('notifications-empty')).toBeTruthy();
    expect(view.getByText('Aucune notification')).toBeTruthy();
  });

  it('affiche un squelette au premier chargement (EF-6)', async () => {
    const view = await renderView({ status: 'loading', data: null });
    expect(view.getByTestId('notifications-loading')).toBeTruthy();
  });

  it('affiche une erreur avec « Réessayer » (EF-6)', async () => {
    const view = await renderView({ status: 'error', data: null });
    await fireEvent.press(view.getByTestId('notifications-error-retry'));
    expect(view.onRetry).toHaveBeenCalledTimes(1);
  });

  it('garde la liste en cache hors ligne et désactive les lectures (CL-2, CA-5)', async () => {
    const view = await renderView({ readOnly: true });
    expect(view.getByTestId('notifications-offline')).toHaveTextContent(
      'Disponible une fois en ligne',
    );
    expect(view.getByTestId('notifications-read-all').props.accessibilityState).toEqual({
      disabled: true,
    });
    expect(view.getByTestId('notification-item-un')).toBeTruthy();
  });

  it('renvoie vers les réglages des notifications et ferme la feuille (BR-NOT-01)', async () => {
    const view = await renderView();
    await fireEvent.press(view.getByTestId('notifications-manage'));
    expect(view.onManage).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByTestId('notifications-sheet-close'));
    expect(view.onClose).toHaveBeenCalledTimes(1);
  });
});
