import {
  loadSpec109Demo,
  type Spec109Data,
  type Spec109Delivery,
} from '../../app/%5Fdev/sdd/spec-109-data';
import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

const t = fr.sdd.spec109;

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  dateStyle: 'short',
  timeStyle: 'short',
});

function instant(value: string | null): string {
  if (value === null) return t.deliveries.missing;
  return dateFormatter.format(new Date(value));
}

/** Every delivery status is identified by a glyph and by its French label, never by colour alone. */
const STATUS_ICONS: Record<Spec109Delivery['status'], string> = {
  scheduled: '◷',
  sent: '✓',
  deferred_quiet: '⏱',
  capped: '⊟',
  failed: '!',
  skipped_pref: '⊘',
};

const NOTIFICATION_ICONS: Record<string, string> = {
  calendar: '▦',
  'alert-triangle': '⚠',
  'chart-line': '↗',
};

function Inbox({ data }: Readonly<{ data: Spec109Data }>) {
  return (
    <DemoSection testId="spec-109-inbox" title={t.inbox.title}>
      <p className="mb-3 text-sm">{t.inbox.intro}</p>
      <p className="mb-4 text-sm font-semibold" data-testid="spec-109-count">
        {t.inbox.count(data.unreadCount)}
      </p>
      <ul
        data-testid="spec-109-list"
        aria-label={t.inbox.region}
        className="grid grid-cols-1 gap-3"
      >
        {data.notifications.map((notification) => {
          const unread = notification.readAt === null;
          return (
            <li
              key={notification.id}
              data-testid="notification-row"
              data-read={unread ? 'false' : 'true'}
              data-type={notification.type}
              className="rounded-[8px] border border-solid border-border p-4"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="font-mono text-xl"
                  data-testid="notification-icon"
                >
                  {NOTIFICATION_ICONS[notification.icon] ?? '•'}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold" data-testid="notification-title">
                    {notification.title}
                  </p>
                  <p className="mt-1 text-sm" data-testid="notification-body">
                    {notification.body}
                  </p>
                  <p className="mt-2 text-sm" data-testid="notification-meta">
                    <span data-testid="notification-type">{t.inbox.types[notification.type]}</span>
                    {' · '}
                    <time dateTime={notification.createdAt} data-testid="notification-created-at">
                      {instant(notification.createdAt)}
                    </time>
                    {' · '}
                    <span data-testid="notification-state">
                      {unread ? t.inbox.unread : t.inbox.read}
                    </span>
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </DemoSection>
  );
}

function Deliveries({ data }: Readonly<{ data: Spec109Data }>) {
  return (
    <DemoSection testId="spec-109-deliveries" title={t.deliveries.title}>
      <p className="mb-3 text-sm">{t.deliveries.intro}</p>
      <div
        role="region"
        aria-label={t.deliveries.region}
        tabIndex={0}
        className="overflow-x-auto rounded-[8px] border border-solid border-border"
      >
        <table className="w-full min-w-[42rem] text-left">
          <thead>
            <tr>
              <th scope="col" className="px-3 py-2">
                {t.deliveries.notification}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.deliveries.channel}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.deliveries.status}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.deliveries.scheduledFor}
              </th>
              <th scope="col" className="px-3 py-2">
                {t.deliveries.sentAt}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.deliveries.map((delivery) => (
              <tr
                key={delivery.id}
                data-testid="delivery-row"
                data-status={delivery.status}
                data-channel={delivery.channel}
                className="border-t border-border"
              >
                <td className="px-3 py-2" data-testid="delivery-notification">
                  {delivery.notificationTitle}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="delivery-channel">
                  {t.deliveries.channels[delivery.channel]}
                </td>
                <td className="px-3 py-2 text-sm" data-testid="delivery-status">
                  <span aria-hidden="true" className="mr-1 font-mono" data-testid="delivery-icon">
                    {STATUS_ICONS[delivery.status]}
                  </span>
                  {t.deliveries.statuses[delivery.status]}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="delivery-scheduled-for">
                  {instant(delivery.scheduledFor)}
                </td>
                <td className="px-3 py-2 font-mono text-sm" data-testid="delivery-sent-at">
                  {instant(delivery.sentAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DemoSection>
  );
}

export default async function Spec109Demo() {
  const data = await loadSpec109Demo();
  return (
    <>
      <p className="mt-4 text-sm">{t.intro}</p>
      <Inbox data={data} />
      <Deliveries data={data} />
    </>
  );
}
