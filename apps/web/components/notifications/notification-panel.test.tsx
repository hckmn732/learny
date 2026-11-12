// @vitest-environment jsdom
import { useState } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { NotificationFilter, NotificationItem, NotificationListDto } from '@learny/contracts';
import { cleanup, renderComponent, screen, waitFor, within } from '@learny/testing/render';

import { fr } from '../../messages/fr';

import {
  NotificationPanelView,
  formatNotificationTime,
  type NotificationPanelStatus,
} from './notification-panel';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  globalThis.ResizeObserver = ResizeObserverMock;
  Object.defineProperty(Element.prototype, 'hasPointerCapture', {
    configurable: true,
    value: () => false,
  });
  Object.defineProperty(Element.prototype, 'releasePointerCapture', {
    configurable: true,
    value: () => undefined,
  });
  Object.defineProperty(Element.prototype, 'setPointerCapture', {
    configurable: true,
    value: () => undefined,
  });
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: () => undefined,
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

afterEach(cleanup);

const TODAY: NotificationItem = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'validation_soon',
  icon: 'clock',
  title: 'Quiz de validation à 14:00',
  body: 'Module 3 · Comptabilité générale, tentative 2. Seuil de validation : 80 %.',
  href: '/accueil?cible=quiz',
  formationTitle: 'SAP S/4HANA Finance',
  createdAt: '2026-11-11T12:20:00.000Z',
  readAt: null,
  group: 'today',
};

const YESTERDAY: NotificationItem = {
  id: '22222222-2222-4222-8222-222222222222',
  type: 'new_gap',
  icon: 'alert-triangle',
  title: 'Nouvelle lacune repérée',
  body: 'Clé de comptabilisation : confondue avec le type de pièce, deux fois.',
  href: '/formations/f?tab=lacunes',
  formationTitle: 'SAP S/4HANA Finance',
  createdAt: '2026-11-10T15:42:00.000Z',
  readAt: '2026-11-10T18:00:00.000Z',
  group: 'yesterday',
};

const EARLIER: NotificationItem = {
  id: '33333333-3333-4333-8333-333333333333',
  type: 'weekly_review',
  icon: 'bar-chart',
  title: 'Bilan de la semaine',
  body: '13 h d’étude, 86 % retenu à 1 mois, 3 notions à risque d’oubli.',
  href: '/formations/f/bilan',
  formationTitle: null,
  createdAt: '2026-11-09T13:00:00.000Z',
  readAt: '2026-11-09T20:00:00.000Z',
  group: 'earlier',
};

const DATA: NotificationListDto = {
  items: [TODAY, YESTERDAY, EARLIER],
  total: 3,
  unreadCount: 1,
  timezone: 'Europe/Paris',
};

interface HarnessProps {
  initialStatus?: NotificationPanelStatus;
  initialData?: NotificationListDto | null;
  initialFilter?: NotificationFilter;
  onRetry?: () => void;
  onActivate?: (item: NotificationItem) => void;
  onReadAll?: () => void;
  readError?: string | null;
  onRetryRead?: () => void;
}

function Harness({
  initialStatus = 'ready',
  initialData = DATA,
  initialFilter = 'all',
  onRetry = () => undefined,
  onActivate = () => undefined,
  onReadAll = () => undefined,
  readError = null,
  onRetryRead,
}: HarnessProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>(initialFilter);
  const [data, setData] = useState<NotificationListDto | null>(initialData);
  return (
    <NotificationPanelView
      unreadCount={data?.unreadCount ?? 0}
      status={initialStatus}
      data={data}
      open={open}
      onOpenChange={setOpen}
      filter={filter}
      onFilterChange={setFilter}
      onRetry={onRetry}
      onReadAll={() => {
        onReadAll();
        setData((current) =>
          current === null
            ? current
            : {
                ...current,
                unreadCount: 0,
                items: current.items.map((item) => ({ ...item, readAt: item.createdAt })),
              },
        );
      }}
      onActivate={onActivate}
      readError={readError}
      {...(onRetryRead === undefined ? {} : { onRetryRead })}
      announcement={fr.shell.notifications.announcement(data?.unreadCount ?? 0)}
    />
  );
}

function openPanel() {
  const rendered = renderComponent(<Harness />);
  const trigger = screen.getByTestId('header-notifications');
  return { ...rendered, trigger };
}

function compareOrder(elements: HTMLElement[]) {
  for (let index = 1; index < elements.length; index += 1) {
    const previous = elements[index - 1] as HTMLElement;
    const current = elements[index] as HTMLElement;
    expect(
      previous.compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING,
      `${elements[index - 1]?.dataset.testid ?? ''} avant ${elements[index]?.dataset.testid ?? ''}`,
    ).toBeTruthy();
  }
}

describe('[SPEC-306] Panneau des notifications', () => {
  it('ouvre le panneau, groupe Aujourd’hui/Hier/Plus tôt et affiche l’heure du profil (CA-1)', async () => {
    const { user, trigger } = openPanel();
    expect(trigger.getAttribute('aria-label')).toBe('Notifications, 1 non lue');
    expect(screen.getByTestId('header-notifications-badge').textContent).toBe('1');

    await user.click(trigger);
    const panel = await screen.findByTestId('notification-panel');
    expect(within(panel).getByRole('heading', { level: 2 }).textContent).toBe(
      fr.shell.notifications.panelTitle,
    );
    expect(within(panel).getByRole('group', { name: 'Filtrer les notifications' })).toBeTruthy();

    compareOrder([
      within(panel).getByTestId('notification-group-today'),
      within(panel).getByTestId('notification-group-yesterday'),
      within(panel).getByTestId('notification-group-earlier'),
    ]);
    expect(within(panel).getByText('Aujourd’hui')).toBeTruthy();
    expect(within(panel).getByText('Hier')).toBeTruthy();
    expect(within(panel).getByText('Plus tôt')).toBeTruthy();
    expect(within(panel).getByText('13:20')).toBeTruthy();
    expect(within(panel).getByText('16:42')).toBeTruthy();
    expect(within(panel).getByText('lun. 9 nov.')).toBeTruthy();
    expect(within(panel).getByTestId('notification-manage').getAttribute('href')).toBe(
      '/parametres#notifications',
    );
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('filtre Non lues sans changer le compteur non lu (CA-2)', async () => {
    const { user, trigger } = openPanel();
    await user.click(trigger);
    const panel = await screen.findByTestId('notification-panel');
    const filters = within(panel).getByRole('group', { name: 'Filtrer les notifications' });

    expect(within(filters).getByText('1').textContent).toBe('1');
    expect(within(panel).getByTestId('notification-item-' + TODAY.id)).toBeTruthy();
    await user.click(within(filters).getByRole('button', { name: /Non lues/ }));

    expect(within(panel).queryByTestId('notification-item-' + YESTERDAY.id)).toBeNull();
    expect(within(panel).queryByTestId('notification-item-' + EARLIER.id)).toBeNull();
    expect(within(panel).getByTestId('notification-item-' + TODAY.id)).toBeTruthy();
    expect(within(filters).getByText('1').textContent).toBe('1');
    expect(trigger.getAttribute('aria-label')).toBe('Notifications, 1 non lue');
  });

  it('active une ligne puis Tout marquer comme lu avec un compteur qui reste à zéro (CA-2, CA-3)', async () => {
    const onActivate = vi.fn();
    const onReadAll = vi.fn();
    const rendered = renderComponent(<Harness onActivate={onActivate} onReadAll={onReadAll} />);
    const trigger = screen.getByTestId('header-notifications');
    await rendered.user.click(trigger);
    const panel = await screen.findByTestId('notification-panel');

    await rendered.user.click(within(panel).getByTestId('notification-item-' + TODAY.id));
    expect(onActivate).toHaveBeenCalledWith(TODAY);

    await rendered.user.click(within(panel).getByTestId('notification-read-all'));
    expect(onReadAll).toHaveBeenCalledTimes(1);
    expect(within(panel).getByTestId('notification-read-all').textContent).toBe(
      fr.shell.notifications.readAllDone,
    );
    expect(within(panel).getByTestId('notification-read-all').matches(':disabled')).toBe(true);

    await rendered.user.click(within(panel).getByRole('button', { name: /Non lues/ }));
    expect(within(panel).getByTestId('notification-empty').textContent).toBe(
      fr.shell.notifications.emptyUnread,
    );
  });

  it('affiche des états vides distincts pour Toutes et Non lues (CL-4)', async () => {
    const { user } = renderComponent(
      <Harness initialData={{ ...DATA, items: [], total: 0, unreadCount: 0 }} />,
    );
    await user.click(screen.getByTestId('header-notifications'));
    const panel = await screen.findByTestId('notification-panel');
    expect(within(panel).getByTestId('notification-empty').textContent).toBe(
      fr.shell.notifications.emptyAll,
    );
    await user.click(within(panel).getByRole('button', { name: /Non lues/ }));
    await waitFor(() => {
      expect(within(panel).getByTestId('notification-empty').textContent).toBe(
        fr.shell.notifications.emptyUnread,
      );
    });
  });

  it('rend le chargement, l’erreur et son bouton Réessayer (ET-5, CL-3)', async () => {
    const onRetry = vi.fn();
    const { rerender } = renderComponent(
      <NotificationPanelView
        unreadCount={0}
        status="loading"
        data={null}
        open
        onOpenChange={() => undefined}
        filter="all"
        onFilterChange={() => undefined}
        onRetry={onRetry}
        onReadAll={() => undefined}
        onActivate={() => undefined}
      />,
    );
    expect(screen.getByTestId('notification-loading')).toBeTruthy();
    expect(screen.getByText(fr.shell.notifications.loading)).toBeTruthy();

    rerender(
      <NotificationPanelView
        unreadCount={0}
        status="error"
        data={null}
        open
        onOpenChange={() => undefined}
        filter="all"
        onFilterChange={() => undefined}
        onRetry={onRetry}
        onReadAll={() => undefined}
        onActivate={() => undefined}
      />,
    );
    expect(await screen.findByTestId('notification-error')).toBeTruthy();
    screen.getByRole('button', { name: fr.shell.notifications.retry }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('conserve le point non lu et propose Réessayer quand la lecture échoue (CL-3)', async () => {
    const onRetryRead = vi.fn();
    const { user } = renderComponent(
      <Harness readError={fr.shell.notifications.readError} onRetryRead={onRetryRead} />,
    );
    await user.click(screen.getByTestId('header-notifications'));
    const panel = await screen.findByTestId('notification-panel');
    expect(within(panel).getByTestId('notification-read-error').textContent).toContain(
      fr.shell.notifications.readError,
    );
    expect(within(panel).getByTestId('notification-unread-' + TODAY.id)).toBeTruthy();
    await user.click(within(panel).getByTestId('notification-read-retry'));
    expect(onRetryRead).toHaveBeenCalledTimes(1);
  });

  it('ferme par Échap et rend le focus à la cloche (EF-5)', async () => {
    const { user, trigger } = openPanel();
    trigger.focus();
    await user.click(trigger);
    await screen.findByTestId('notification-panel');
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByTestId('notification-panel')).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });
});

describe('[SPEC-306] Panneau des notifications — formatage', () => {
  it('formate l’heure locale et la date courte dans le fuseau du profil (ET-3, ET-5)', () => {
    expect(formatNotificationTime(TODAY.createdAt, 'Europe/Paris', 'today')).toBe('13:20');
    expect(formatNotificationTime(TODAY.createdAt, 'Asia/Tokyo', 'today')).toBe('21:20');
    expect(formatNotificationTime(EARLIER.createdAt, 'Europe/Paris', 'earlier')).toBe(
      'lun. 9 nov.',
    );
  });
});
