// Owner-role reads of the SPEC-109 demonstration, kept under `_dev` so the ESLint boundary of
// SPEC-101 ET-6 stays the only place allowed to use `serviceDb` in the web app (ADR-0049).
//
// The whole demonstration runs inside `withRollback`: three notifications (a daily digest already
// read, a new gap left unread and a weekly review left unread) and their delivery journal disappear
// at the end of the request. The fixture contains no e-mail address and no push endpoint; the only
// error shown is the safe code `no_subscription` (ET-5). Instants use the fixed clock of ADR-0047.
import {
  countUnreadNotifications,
  createDelivery,
  createNotification,
  listNotificationDeliveries,
  listNotifications,
  markNotificationRead,
  type DeliveryChannel,
  type DeliveryStatus,
  type NotificationType,
} from '@learny/db';
import { createTestUser, withRollback } from '@learny/db/testing';

export interface Spec109Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  icon: string;
  createdAt: string;
  readAt: string | null;
}

export interface Spec109Delivery {
  id: string;
  notificationTitle: string;
  notificationType: NotificationType;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  scheduledFor: string | null;
  sentAt: string | null;
  error: string | null;
}

export interface Spec109Data {
  unreadCount: number;
  unreadNotifications: number;
  notifications: Spec109Notification[];
  deliveries: Spec109Delivery[];
}

/**
 * EF-6 — a digest sent at 08:00 Paris, a new gap whose push is deferred by the quiet hours, and a
 * weekly review whose push is skipped because no subscription exists. The in-app rows exist even
 * when the external channels are silent (BR-NOT-03).
 */
export async function loadSpec109Demo(): Promise<Spec109Data> {
  return withRollback(async (tx) => {
    const user = await createTestUser(tx, { firstName: 'Alex', timezone: 'Europe/Paris' });

    const digest = await createNotification(tx, {
      userId: user.id,
      type: 'daily_digest',
      title: 'Votre programme du jour',
      body: 'Trois activités vous attendent aujourd’hui, dont un quiz de validation.',
      href: '/agenda',
      icon: 'calendar',
      dedupeKey: 'digest:2026-11-11',
      createdAt: new Date('2026-11-11T07:00:00Z'),
    });
    const gap = await createNotification(tx, {
      userId: user.id,
      type: 'new_gap',
      title: 'Nouvelle lacune : TVA intracommunautaire',
      body: 'Deux réponses confondent le taux normal et le taux réduit. Une révision est proposée.',
      href: '/formations/finance/lacunes',
      icon: 'alert-triangle',
      dedupeKey: 'gap:2026-11-11',
      createdAt: new Date('2026-11-11T09:30:00Z'),
    });
    const review = await createNotification(tx, {
      userId: user.id,
      type: 'weekly_review',
      title: 'Votre bilan de la semaine',
      body: 'Quatre séances terminées, une notion validée et deux révisions dues demain.',
      href: '/bilan',
      icon: 'chart-line',
      dedupeKey: 'weekly:2026-11-11',
      createdAt: new Date('2026-11-11T10:15:00Z'),
    });

    // The digest has been read in the app; the two others are still unread.
    await markNotificationRead(tx, {
      userId: user.id,
      notificationId: digest.notification.id,
      readAt: new Date('2026-11-11T08:30:00Z'),
    });

    // The digest e-mail went out at 08:00 Paris; the gap push waits for the end of quiet hours; the
    // weekly review push is skipped because no browser subscription exists.
    await createDelivery(tx, {
      notificationId: digest.notification.id,
      channel: 'email',
      status: 'sent',
      sentAt: new Date('2026-11-11T07:00:00Z'),
    });
    await createDelivery(tx, {
      notificationId: digest.notification.id,
      channel: 'push',
      status: 'skipped_pref',
      error: 'no_subscription',
    });
    await createDelivery(tx, {
      notificationId: gap.notification.id,
      channel: 'push',
      status: 'deferred_quiet',
      scheduledFor: new Date('2026-11-12T07:00:00Z'),
    });
    await createDelivery(tx, {
      notificationId: review.notification.id,
      channel: 'push',
      status: 'skipped_pref',
      error: 'no_subscription',
    });

    const notifications = await listNotifications(tx, { userId: user.id, limit: 10 });
    const unread = await listNotifications(tx, { userId: user.id, filter: 'unread', limit: 10 });
    const unreadCount = await countUnreadNotifications(tx, { userId: user.id });

    const deliveries: Spec109Delivery[] = [];
    for (const notification of notifications) {
      const rows = await listNotificationDeliveries(tx, {
        userId: user.id,
        notificationId: notification.id,
      });
      for (const delivery of rows) {
        deliveries.push({
          id: delivery.id,
          notificationTitle: notification.title,
          notificationType: notification.type,
          channel: delivery.channel,
          status: delivery.status,
          scheduledFor: delivery.scheduledFor?.toISOString() ?? null,
          sentAt: delivery.sentAt?.toISOString() ?? null,
          error: delivery.error,
        });
      }
    }

    return {
      unreadCount,
      unreadNotifications: unread.length,
      notifications: notifications.map((notification) => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        href: notification.href,
        icon: notification.icon,
        createdAt: notification.createdAt.toISOString(),
        readAt: notification.readAt?.toISOString() ?? null,
      })),
      deliveries,
    };
  });
}
