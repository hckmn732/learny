'use client';

import { useEffect, useRef } from 'react';

import type { HeaderDto } from '@learny/contracts';
import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Icon,
  Skeleton,
  getInitials,
  iconRegistry,
} from '@learny/ui';

import { fr } from '../../messages/fr';

const t = fr.shell.header;

export type AccountMenuStatus = 'loading' | 'error' | 'ready';

export interface AccountMenuViewProps {
  data: HeaderDto | null;
  status: AccountMenuStatus;
  pathname: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
  onNavigate: (href: string) => void;
  onSignOut: () => void;
  signOutPending?: boolean;
  signOutError?: string | null;
  /** Content region that receives the focus when the route changes with the menu open (CL-3). */
  contentId?: string;
}

function identityName(data: HeaderDto | null): string {
  return data?.firstName ?? data?.emailLabel ?? t.accountFallback;
}

function identityMeta(data: HeaderDto | null, status: AccountMenuStatus): string {
  if (status === 'loading') return t.loadingAccount;
  if (status === 'error' || data === null) return t.accountError;
  return t.activeFormations(data.activeFormationCount);
}

/**
 * `Mon compte` menu of the fixed header (SPEC-305 EF-2, ET-2; BR-NAV-01, BR-ACC-09).
 * Identity and active-formation count come from the authenticated header DTO; Paramètres and
 * Mettre en pause navigate, Se déconnecter stays open on failure so the error is readable (CL-2).
 */
export const AccountMenuView = ({
  data,
  status,
  pathname,
  open,
  onOpenChange,
  onRetry,
  onNavigate,
  onSignOut,
  signOutPending = false,
  signOutError = null,
  contentId = 'contenu',
}: AccountMenuViewProps) => {
  const routeChanged = useRef(false);
  const pointerOutside = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previousPathname = useRef(pathname);
  const avatarName = data?.firstName ?? data?.emailLabel ?? null;
  const initials = getInitials(avatarName, data?.lastName);
  const triggerLabel = `${initials} ${t.accountButton}`;
  const avatarProps = {
    ...(avatarName === null ? {} : { firstName: avatarName }),
    ...(data?.lastName === null || data?.lastName === undefined ? {} : { lastName: data.lastName }),
  };

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    if (!open) return;
    routeChanged.current = true;
    onOpenChange(false);
  }, [onOpenChange, open, pathname]);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next || !pointerOutside.current) return;
        // CA-2 — an outside click closes the menu and gives the focus back to its trigger.
        pointerOutside.current = false;
        window.setTimeout(() => {
          triggerRef.current?.focus();
        }, 0);
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={triggerLabel}
          data-testid="header-account-trigger"
          className="inline-flex min-h-42 shrink-0 cursor-pointer items-center gap-10 rounded-full border border-solid border-border bg-surface pr-12 pl-4 font-sans text-14 font-600 text-ink transition-colors hover:bg-surface-subtle"
        >
          <Avatar {...avatarProps} aria-hidden={false} data-testid="header-account-avatar" />{' '}
          <span data-testid="header-account-name">{t.accountButton}</span>
          <Icon name="chevron-down" size={14} strokeWidth={2.2} className="text-ink-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        data-testid="account-menu"
        aria-label={t.accountMenuLabel}
        onPointerDownOutside={() => {
          pointerOutside.current = true;
        }}
        onCloseAutoFocus={(event) => {
          if (!routeChanged.current) return;
          routeChanged.current = false;
          event.preventDefault();
          document.getElementById(contentId)?.focus();
        }}
      >
        <DropdownMenuLabel
          data-testid="account-identity"
          aria-busy={status === 'loading' ? true : undefined}
        >
          <Avatar {...avatarProps} />
          <span className="flex min-w-0 flex-col gap-2">
            {status === 'loading' ? (
              <Skeleton className="h-12 w-24" radius={6} data-testid="account-loading" />
            ) : (
              <span
                data-testid="account-identity-name"
                className="truncate text-14 font-700 text-ink"
              >
                {identityName(data)}
              </span>
            )}
            <span
              data-testid="account-active-formations"
              className={
                status === 'error' ? 'text-12 font-600 text-danger' : 'text-12 text-ink-muted'
              }
              role={status === 'error' ? 'alert' : undefined}
            >
              {identityMeta(data, status)}
            </span>
          </span>
        </DropdownMenuLabel>

        {status === 'error' ? (
          <DropdownMenuItem
            icon={iconRegistry.alert}
            data-testid="account-retry"
            onSelect={(event) => {
              event.preventDefault();
              onRetry();
            }}
          >
            {t.retry}
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuItem
          icon={iconRegistry.settings}
          data-testid="account-settings"
          onSelect={() => {
            onNavigate('/parametres');
          }}
        >
          {t.settings}
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={iconRegistry.pause}
          data-testid="account-pause"
          onSelect={() => {
            // SPEC-618 delivers the pause flow; until then the settings anchor is the mockup target.
            onNavigate('/parametres#automatismes');
          }}
        >
          {t.pause}
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={iconRegistry['sign-out']}
          data-testid="account-sign-out"
          disabled={signOutPending}
          aria-busy={signOutPending || undefined}
          onSelect={(event) => {
            event.preventDefault();
            onSignOut();
          }}
        >
          {signOutPending ? t.signingOut : t.signOut}
        </DropdownMenuItem>
        {signOutError === null ? null : (
          <p
            role="alert"
            data-testid="account-sign-out-error"
            className="m-0 px-10 pb-2 text-12 leading-1.45 font-600 text-danger"
          >
            {signOutError}
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
