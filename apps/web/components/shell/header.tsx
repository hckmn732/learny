'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode, type RefObject } from 'react';

import type { HeaderDto } from '@learny/contracts';
import { AlertDialog, IconButton, ResponsivePanel, iconRegistry, useBreakpoint } from '@learny/ui';

import { api } from '../../lib/api-client';
import { purgeOfflineDatabase, purgeRuntimeCaches } from '../../lib/offline/db';
import { fr } from '../../messages/fr';
import { NotificationBell } from '../notifications/notification-panel';
import { OfflineIndicator } from '../offline/OfflineIndicator';
import { flushBeforeSignOut } from '../offline/OfflineProvider';
import { GlobalSearch } from '../search/global-search';

import { AccountMenuView, type AccountMenuStatus } from './account-menu';

const t = fr.shell.header;
const HEADER_QUERY_KEY = ['header'] as const;

export interface HeaderViewProps {
  data: HeaderDto | null;
  status: AccountMenuStatus;
  pathname: string;
  sidebarCollapsed: boolean;
  onShowSidebar: () => void;
  onRetry: () => void;
  onNavigate: (href: string) => void;
  onSignOut: () => void;
  signOutPending?: boolean;
  signOutError?: string | null;
  showTriggerRef?: RefObject<HTMLButtonElement | null> | undefined;
  /** SPEC-306 notification bell; the fallback keeps the pure header test and non-connected use. */
  notificationPanel?: ReactNode;
}

/**
 * Fixed, translucent header of every connected screen (SPEC-305 EF-1, EF-2, EF-5; BR-NAV-01).
 * Order of the mockup: Afficher le menu when needed, search field, notification bell, account.
 */
export const HeaderView = ({
  data,
  status,
  pathname,
  sidebarCollapsed,
  onShowSidebar,
  onRetry,
  onNavigate,
  onSignOut,
  signOutPending = false,
  signOutError = null,
  showTriggerRef,
  notificationPanel,
}: HeaderViewProps) => {
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const compact = useBreakpoint('sm');
  const unread = data?.unreadNotificationCount ?? 0;
  const notificationsLabel = t.notificationsLabel(unread);

  return (
    <header
      data-testid="shell-header"
      className="sticky top-0 z-header mb-24 flex flex-wrap items-center gap-12 border-b border-solid border-border bg-header-glass px-16 py-12 backdrop-blur-[10px] nav:px-40"
    >
      <IconButton
        ref={showTriggerRef}
        tone="light"
        size="md"
        label={fr.shell.sidebar.show}
        icon={iconRegistry['sidebar-open']}
        aria-expanded={false}
        data-testid="sidebar-show"
        onClick={onShowSidebar}
        className={sidebarCollapsed ? undefined : 'nav:hidden'}
      />

      {compact ? (
        <>
          <IconButton
            tone="light"
            size="md"
            label={t.searchLabel}
            icon={iconRegistry.search}
            data-testid="header-search-toggle"
            onClick={() => {
              setSearchOpen(true);
            }}
          />
          <ResponsivePanel
            open={searchOpen}
            onOpenChange={setSearchOpen}
            title={t.searchLabel}
            testId="header-search-panel"
          >
            <div className="p-16">
              <GlobalSearch
                label={t.searchLabel}
                placeholder={t.searchPlaceholder}
                onNavigate={(href) => {
                  setSearchOpen(false);
                  onNavigate(href);
                }}
              />
            </div>
          </ResponsivePanel>
        </>
      ) : (
        <GlobalSearch
          label={t.searchLabel}
          placeholder={t.searchPlaceholder}
          onNavigate={onNavigate}
        />
      )}

      <div className="ml-auto flex items-center gap-8">
        <OfflineIndicator />
        {notificationPanel ?? (
          <IconButton
            tone="light"
            size="md"
            label={notificationsLabel}
            icon={iconRegistry.bell}
            data-testid="header-notifications"
            badge={
              unread > 0 ? (
                <span
                  data-testid="header-notifications-badge"
                  className="flex h-16 min-w-16 items-center justify-center rounded-full bg-orange px-4 text-10 leading-16 font-700 text-white shadow-ring-white"
                >
                  {unread > 99 ? '99+' : String(unread)}
                </span>
              ) : undefined
            }
          />
        )}
        <AccountMenuView
          data={data}
          status={status}
          pathname={pathname}
          open={accountOpen}
          onOpenChange={setAccountOpen}
          onRetry={onRetry}
          onNavigate={onNavigate}
          onSignOut={onSignOut}
          signOutPending={signOutPending}
          signOutError={signOutError}
        />
      </div>
    </header>
  );
};

export interface HeaderProps {
  /** Server-rendered DTO: the first paint already knows the learner (ET-4). */
  initialData: HeaderDto | null;
  initialError?: boolean;
  sidebarCollapsed: boolean;
  onShowSidebar: () => void;
  showTriggerRef?: RefObject<HTMLButtonElement | null> | undefined;
}

/**
 * Connected header: refreshes `/api/v1/me/header` in the browser, keeps the server DTO as first
 * paint and signs out through the SPEC-202 service before replacing the history entry (ET-3).
 */
export const Header = ({
  initialData,
  initialError = false,
  sidebarCollapsed,
  onShowSidebar,
  showTriggerRef,
}: HeaderProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [signOutPendingLocal, setSignOutPendingLocal] = useState(false);
  const [blockedSignOut, setBlockedSignOut] = useState<number | null>(null);

  const query = useQuery({
    queryKey: HEADER_QUERY_KEY,
    queryFn: () => api.headerGet({}),
    ...(initialData === null ? {} : { initialData }),
    retry: false,
  });

  const signOut = useMutation({
    mutationFn: () => api.authSignOut({}),
    onSuccess: async () => {
      // EF-11 — no offline data survives the session; ET-3 clears the cached learner data.
      await purgeOfflineDatabase().catch(() => undefined);
      await purgeRuntimeCaches().catch(() => undefined);
      queryClient.clear();
      router.replace('/connexion');
      router.refresh();
    },
    onError: () => {
      // CL-2 — the menu stays open on its error; the session is never announced as closed.
      setSignOutError(t.signOutError);
    },
    onSettled: () => {
      setSignOutPendingLocal(false);
    },
  });

  /** CL-6 — a short synchronisation runs first; pending answers block the sign-out behind a dialog. */
  async function beginSignOut(): Promise<void> {
    setSignOutError(null);
    setSignOutPendingLocal(true);
    const remaining = await flushBeforeSignOut();
    if (remaining > 0) {
      setSignOutPendingLocal(false);
      setBlockedSignOut(remaining);
      return;
    }
    await purgeOfflineDatabase().catch(() => undefined);
    await purgeRuntimeCaches().catch(() => undefined);
    signOut.mutate();
  }

  const status: AccountMenuStatus =
    query.data !== undefined ? 'ready' : query.isError || initialError ? 'error' : 'loading';

  return (
    <>
      <HeaderView
        data={query.data ?? null}
        status={status}
        pathname={pathname}
        sidebarCollapsed={sidebarCollapsed}
        onShowSidebar={onShowSidebar}
        onRetry={() => {
          void query.refetch();
        }}
        onNavigate={(href) => {
          router.push(href);
        }}
        onSignOut={() => {
          void beginSignOut();
        }}
        signOutPending={signOut.isPending || signOutPendingLocal}
        signOutError={signOutError}
        showTriggerRef={showTriggerRef}
        notificationPanel={
          <NotificationBell
            unreadCount={query.data?.unreadNotificationCount ?? 0}
            onNavigate={(href) => {
              router.push(href);
            }}
            onUnreadCountChange={(count) => {
              queryClient.setQueryData<HeaderDto>(HEADER_QUERY_KEY, (current) =>
                current === undefined ? current : { ...current, unreadNotificationCount: count },
              );
            }}
          />
        }
      />
      <AlertDialog
        open={blockedSignOut !== null}
        onOpenChange={(open) => {
          if (!open) setBlockedSignOut(null);
        }}
        trigger={<span aria-hidden="true" />}
        title={fr.offline.signOut.title}
        description={fr.offline.signOut.pending(blockedSignOut ?? 0)}
        confirmLabel={fr.offline.signOut.confirm}
        cancelLabel={fr.offline.signOut.cancel}
        destructive
        data-testid="offline-signout-dialog"
        onConfirm={() => {
          setBlockedSignOut(null);
          setSignOutPendingLocal(true);
          void purgeOfflineDatabase()
            .catch(() => undefined)
            .then(() => purgeRuntimeCaches().catch(() => undefined))
            .then(() => {
              signOut.mutate();
            });
        }}
      />
    </>
  );
};
