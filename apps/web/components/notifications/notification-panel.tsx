'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type MouseEvent } from 'react';

import type { NotificationFilter, NotificationItem, NotificationListDto } from '@learny/contracts';
import { formatUserDate, toUserZone } from '@learny/core';
import {
  ErrorState,
  Icon,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SegmentedControl,
  Skeleton,
  SkeletonGroup,
  cn,
  iconRegistry,
  type IconName,
} from '@learny/ui';

import { api } from '../../lib/api-client';
import { fr } from '../../messages/fr';

const t = fr.shell.notifications;

const GROUP_ORDER = ['today', 'yesterday', 'earlier'] as const;
const PANEL_QUERY_KEY = ['notifications', 'all'] as const;

export type NotificationPanelStatus = 'loading' | 'error' | 'ready';

export interface NotificationPanelViewProps {
  /** Unread count of the header DTO; mutations replace it with the server answer. */
  unreadCount: number;
  status: NotificationPanelStatus;
  data: NotificationListDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter: NotificationFilter;
  onFilterChange: (filter: NotificationFilter) => void;
  onRetry: () => void;
  onReadAll: () => void;
  onActivate: (item: NotificationItem) => void;
  readAllPending?: boolean;
  readError?: string | null;
  onRetryRead?: () => void;
  announcement?: string;
}

/** Mockup hour of a row: `13:20` today and yesterday, `lun. 9 nov.` earlier (ET-5). */
export function formatNotificationTime(
  createdAt: string,
  timezone: string,
  group: NotificationItem['group'],
): string {
  if (group === 'earlier') {
    return formatUserDate(createdAt, timezone, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }
  return toUserZone(createdAt, timezone).time;
}

function notificationIcon(name: string): IconName {
  return name in iconRegistry ? (name as IconName) : 'bell';
}

function isUnread(item: NotificationItem): boolean {
  return item.readAt === null;
}

const ORANGE_TYPES = new Set(['new_gap', 'session_to_reschedule']);

/**
 * Presentational panel of the header bell (SPEC-306 EF-1 to EF-5; BR-NOT-01). It keeps the
 * mockup structure: title and read-all, All/Unread filter with counters, three groups, then the
 * e-mail note and Gérer les notifications. Every control has an accessible name and the whole
 * panel closes through Radix (Échap or outside click), which returns the focus to the bell.
 */
export const NotificationPanelView = ({
  unreadCount,
  status,
  data,
  open,
  onOpenChange,
  filter,
  onFilterChange,
  onRetry,
  onReadAll,
  onActivate,
  readAllPending = false,
  readError = null,
  onRetryRead,
  announcement = '',
}: NotificationPanelViewProps) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const items = data?.items ?? [];
  const visible = filter === 'unread' ? items.filter(isUnread) : items;
  const count = Math.max(0, unreadCount);
  const label = fr.shell.header.notificationsLabel(count);
  const total = data?.total ?? 0;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <IconButton
          ref={triggerRef}
          tone="light"
          size="md"
          label={label}
          icon={iconRegistry.bell}
          data-testid="header-notifications"
          aria-haspopup="dialog"
          aria-expanded={open}
          badge={
            count > 0 ? (
              <span
                data-testid="header-notifications-badge"
                className="flex h-16 min-w-16 items-center justify-center rounded-full bg-orange px-4 text-10 leading-16 font-700 text-white shadow-ring-white"
              >
                {count > 99 ? '99+' : String(count)}
              </span>
            ) : undefined
          }
        />
      </PopoverTrigger>
      <PopoverContent
        data-testid="notification-panel"
        aria-labelledby="t-notifications"
        className="flex flex-col p-0"
        onCloseAutoFocus={(event) => {
          // EF-5 — every close (Échap or outside click) gives the focus back to the bell. The
          // timer lets the outside pointer event finish before the focus is restored.
          event.preventDefault();
          window.setTimeout(() => {
            triggerRef.current?.focus();
          }, 50);
        }}
      >
        <div className="flex items-center justify-between gap-12 px-16 pt-16 pb-12">
          <h2
            id="t-notifications"
            className="m-0 font-display text-18 font-600 tracking-heading text-ink"
          >
            {t.panelTitle}
          </h2>
          <button
            type="button"
            data-testid="notification-read-all"
            disabled={count === 0 || readAllPending}
            aria-busy={readAllPending || undefined}
            onClick={onReadAll}
            className="min-h-32 cursor-pointer rounded-8 border-0 bg-transparent px-8 font-sans text-13 font-600 text-indigo-ink hover:bg-indigo-soft disabled:cursor-not-allowed disabled:opacity-55"
          >
            {count === 0 ? t.readAllDone : t.readAll}
          </button>
        </div>

        <div className="mx-16 mb-8">
          <SegmentedControl
            fullWidth
            aria-label={t.filtersLabel}
            data-testid="notification-filters"
            onValueChange={(value) => {
              onFilterChange(value);
            }}
            options={[
              { value: 'all', label: t.filterAll, count: total },
              { value: 'unread', label: t.filterUnread, count },
            ]}
            value={filter}
          />
        </div>

        <div
          className="max-h-[min(420px,calc(100vh-200px))] overflow-y-auto px-6 pb-6"
          data-testid="notification-list"
        >
          <p
            role="status"
            aria-live="polite"
            data-testid="notification-announcement"
            className="sr-only"
          >
            {announcement}
          </p>
          {readError === null ? null : (
            <div
              role="alert"
              data-testid="notification-read-error"
              className="mx-6 mb-4 flex flex-wrap items-center justify-between gap-8 rounded-12 bg-orange-soft px-12 py-8 text-12 leading-1.45 font-600 text-orange-ink"
            >
              <span>{readError}</span>
              {onRetryRead === undefined ? null : (
                <button
                  type="button"
                  data-testid="notification-read-retry"
                  onClick={onRetryRead}
                  className="min-h-28 cursor-pointer rounded-8 border-0 bg-transparent px-8 font-sans text-12 font-700 text-orange-ink underline underline-offset-2"
                >
                  {t.retry}
                </button>
              )}
            </div>
          )}

          {status === 'loading' ? (
            <SkeletonGroup
              data-testid="notification-loading"
              label={t.loading}
              className="px-6 py-4"
            >
              {[0, 1, 2].map((index) => (
                <div className="flex gap-12 px-12 py-12" key={index}>
                  <Skeleton className="size-36 shrink-0" radius={10} />
                  <div className="flex min-w-0 flex-1 flex-col gap-6">
                    <Skeleton className="h-14 w-3/5" radius={6} />
                    <Skeleton className="h-12 w-full" radius={6} />
                    <Skeleton className="h-10 w-2/5" radius={6} />
                  </div>
                </div>
              ))}
            </SkeletonGroup>
          ) : null}

          {status === 'error' ? (
            <ErrorState
              data-testid="notification-error"
              title={t.errorTitle}
              description={t.errorDescription}
              onRetry={onRetry}
              className="px-16 py-20"
            />
          ) : null}

          {status === 'ready' && visible.length === 0 ? (
            <p
              data-testid="notification-empty"
              className="m-0 px-16 py-28 text-center text-14 leading-1.5 text-ink-muted"
            >
              {filter === 'unread' ? t.emptyUnread : t.emptyAll}
            </p>
          ) : null}

          {status === 'ready'
            ? GROUP_ORDER.map((group) => {
                const rows = visible.filter((item) => item.group === group);
                if (rows.length === 0) return null;
                const headingId = `t-notifications-${group}`;
                return (
                  <section
                    data-testid={`notification-group-${group}`}
                    aria-labelledby={headingId}
                    className="flex flex-col gap-2"
                    key={group}
                  >
                    <h3
                      id={headingId}
                      className="m-0 px-12 pt-8 pb-4 text-11 font-600 tracking-[0.08em] text-ink-muted uppercase"
                    >
                      {t.groups[group]}
                    </h3>
                    <ul className="m-0 flex list-none flex-col gap-2 p-0">
                      {rows.map((item) => {
                        const unread = isUnread(item);
                        const tone = ORANGE_TYPES.has(item.type)
                          ? 'bg-orange-soft text-orange-ink'
                          : 'bg-indigo-soft text-indigo-ink';
                        return (
                          <li key={item.id}>
                            <a
                              href={item.href}
                              data-notif
                              data-unread={unread ? true : undefined}
                              data-testid={`notification-item-${item.id}`}
                              onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                                event.preventDefault();
                                onActivate(item);
                              }}
                              className="relative flex gap-12 rounded-14 px-12 py-12 pr-28 text-ink no-underline transition-colors hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo"
                            >
                              <span
                                aria-hidden="true"
                                className={cn(
                                  'inline-flex size-36 shrink-0 items-center justify-center rounded-10',
                                  tone,
                                )}
                              >
                                <Icon name={notificationIcon(item.icon)} size={17} />
                              </span>
                              <span className="flex min-w-0 flex-1 flex-col gap-3">
                                <span className="flex items-baseline justify-between gap-8">
                                  <span className="text-14 font-700">{item.title}</span>
                                  <span className="shrink-0 text-12 text-ink-muted tabular-nums">
                                    {formatNotificationTime(
                                      item.createdAt,
                                      data?.timezone ?? 'Europe/Paris',
                                      item.group,
                                    )}
                                  </span>
                                </span>
                                <span className="text-13 leading-[1.45] text-ink-secondary">
                                  {item.body}
                                </span>
                                {item.formationTitle === null ? null : (
                                  <span className="inline-flex items-center gap-6 text-12 text-ink-muted">
                                    <span
                                      aria-hidden="true"
                                      className="size-6 rounded-full bg-indigo"
                                    />
                                    {item.formationTitle}
                                  </span>
                                )}
                              </span>
                              {unread ? (
                                <span
                                  data-testid={`notification-unread-${item.id}`}
                                  className="absolute top-18 right-12 size-8 rounded-full bg-indigo"
                                >
                                  <span className="sr-only">{t.unread}</span>
                                </span>
                              ) : null}
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })
            : null}
        </div>

        <div className="flex items-center justify-between gap-12 border-t border-solid border-border px-16 py-12 text-13">
          <span className="text-ink-muted">{t.emailNote}</span>
          <a
            href="/parametres#notifications"
            data-testid="notification-manage"
            className="font-600 text-indigo-ink underline-offset-2 hover:underline"
          >
            {t.manage}
          </a>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export interface NotificationBellProps {
  unreadCount: number;
  onUnreadCountChange: (count: number) => void;
  onNavigate: (href: string) => void;
}

type ReadFailure = { kind: 'read'; item: NotificationItem } | { kind: 'read-all' };

/**
 * Connected bell: the list is read once per opening, then filters act on that authenticated
 * snapshot. A row is marked read before the navigation; a failed read keeps the unread dot and
 * offers Réessayer (CL-1, CL-3). Read-all is disabled at zero, so a second demand writes nothing.
 */
export const NotificationBell = ({
  unreadCount,
  onUnreadCountChange,
  onNavigate,
}: NotificationBellProps) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(new Set());
  const [allRead, setAllRead] = useState(false);
  const [failure, setFailure] = useState<ReadFailure | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const query = useQuery({
    queryKey: PANEL_QUERY_KEY,
    queryFn: () => api.notificationsList({ query: { filter: 'all', limit: 50 } }),
    enabled: open,
    retry: false,
  });

  const refetch = query.refetch;
  useEffect(() => {
    // Each opening forces a fresh authenticated snapshot even inside the 30 s stale window.
    if (open) void refetch();
  }, [open, refetch]);

  const publish = (next: number) => {
    onUnreadCountChange(next);
  };

  const markRead = useMutation({
    mutationFn: (item: NotificationItem) => api.notificationRead({ params: { id: item.id } }),
    onSuccess: (result, item) => {
      setReadIds((current) => new Set(current).add(item.id));
      setFailure(null);
      publish(result.unreadCount);
      setAnnouncement(t.readAnnouncement(result.unreadCount));
      setOpen(false);
      onNavigate(item.href);
    },
    onError: (_error, item) => {
      setFailure({ kind: 'read', item });
    },
  });

  const markAll = useMutation({
    mutationFn: () => api.notificationsReadAll({}),
    onSuccess: (result) => {
      setAllRead(true);
      setFailure(null);
      publish(result.unreadCount);
      setAnnouncement(t.allReadAnnouncement);
    },
    onError: () => {
      setFailure({ kind: 'read-all' });
    },
  });

  // A failed refetch keeps the previous page in cache; the error state must still win so the
  // Réessayer action is visible (ET-5).
  const status: NotificationPanelStatus = query.isError
    ? 'error'
    : query.data !== undefined
      ? 'ready'
      : 'loading';

  const data: NotificationListDto | null =
    query.data === undefined
      ? null
      : {
          ...query.data,
          unreadCount,
          items: query.data.items.map((item) => ({
            ...item,
            readAt: allRead || readIds.has(item.id) ? (item.readAt ?? item.createdAt) : item.readAt,
          })),
        };

  const retryRead = () => {
    if (failure === null) return;
    if (failure.kind === 'read') markRead.mutate(failure.item);
    else markAll.mutate();
  };

  return (
    <NotificationPanelView
      unreadCount={unreadCount}
      status={status}
      data={data}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setFailure(null);
          setAnnouncement(t.announcement(unreadCount));
        }
      }}
      filter={filter}
      onFilterChange={setFilter}
      onRetry={() => {
        void query.refetch();
      }}
      onReadAll={() => {
        if (unreadCount === 0) return;
        markAll.mutate();
      }}
      onActivate={(item) => {
        if (item.readAt !== null || readIds.has(item.id) || allRead) {
          setOpen(false);
          onNavigate(item.href);
          return;
        }
        markRead.mutate(item);
      }}
      readAllPending={markAll.isPending}
      readError={failure === null ? null : failure.kind === 'read' ? t.readError : t.readAllError}
      {...(failure === null ? {} : { onRetryRead: retryRead })}
      announcement={announcement}
    />
  );
};
