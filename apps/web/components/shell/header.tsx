'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type RefObject } from 'react';

import type { HeaderDto } from '@learny/contracts';
import { Icon, IconButton, iconRegistry } from '@learny/ui';

import { api } from '../../lib/api-client';
import { fr } from '../../messages/fr';

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
}: HeaderViewProps) => {
  const [accountOpen, setAccountOpen] = useState(false);
  const unread = data?.unreadNotificationCount ?? 0;
  const notificationsLabel = t.notificationsLabel(unread);

  return (
    <header
      data-testid="shell-header"
      className="sticky top-0 z-header mb-24 flex flex-wrap items-center gap-12 border-b border-solid border-border bg-header-glass px-16 py-12 backdrop-blur-[10px] shell:px-40"
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
        className={sidebarCollapsed ? undefined : 'shell:hidden'}
      />

      <form
        role="search"
        action="/recherche"
        method="get"
        data-testid="header-search"
        className="relative min-w-0 flex-[1_1_320px] max-w-[414px]"
      >
        <label htmlFor="recherche-globale" className="sr-only">
          {t.searchLabel}
        </label>
        <Icon
          name="search"
          size={18}
          strokeWidth={1.8}
          className="pointer-events-none absolute top-12 left-14 text-ink-muted"
        />
        <input
          id="recherche-globale"
          name="q"
          type="search"
          aria-label={t.searchLabel}
          placeholder={t.searchPlaceholder}
          data-testid="header-search-input"
          className="min-h-42 w-full rounded-12 border border-solid border-border bg-surface pr-14 pl-42 font-sans text-14 text-ink placeholder:text-ink-muted"
        />
      </form>

      <div className="ml-auto flex items-center gap-8">
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

  const query = useQuery({
    queryKey: HEADER_QUERY_KEY,
    queryFn: () => api.headerGet({}),
    ...(initialData === null ? {} : { initialData }),
    retry: false,
  });

  const signOut = useMutation({
    mutationFn: () => api.authSignOut({}),
    onSuccess: () => {
      // ET-3 — no cached learner data survives the session; the connected entry is replaced.
      queryClient.clear();
      router.replace('/connexion');
      router.refresh();
    },
    onError: () => {
      // CL-2 — the menu stays open on its error; the session is never announced as closed.
      setSignOutError(t.signOutError);
    },
  });

  const status: AccountMenuStatus =
    query.data !== undefined ? 'ready' : query.isError || initialError ? 'error' : 'loading';

  return (
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
        setSignOutError(null);
        signOut.mutate();
      }}
      signOutPending={signOut.isPending}
      signOutError={signOutError}
      showTriggerRef={showTriggerRef}
    />
  );
};
