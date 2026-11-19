'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';

import type { HeaderDto, SidebarDto } from '@learny/contracts';
import { fr } from '@learny/i18n/fr/shell';
import { LiveAnnouncer, ToastProvider } from '@learny/ui';

import { OfflineProvider } from '../offline/OfflineProvider';

import { Header } from './header';
import { Sidebar } from './sidebar';

export interface AppShellProps {
  sidebar: SidebarDto | null;
  sidebarError?: boolean;
  header: HeaderDto | null;
  headerError?: boolean;
  children: ReactNode;
}

/**
 * Layout of every connected screen (SPEC-304, SPEC-305). The fixed header owns the reveal
 * trigger of the sidebar: the sidebar is mounted in `external` mode and applies the show
 * requests of the header (EF-1, BR-NAV-03).
 */
export const AppShell = ({
  sidebar,
  sidebarError = false,
  header,
  headerError = false,
  children,
}: AppShellProps) => {
  const [collapsed, setCollapsed] = useState(sidebar?.collapsed ?? false);
  const showSidebarRef = useRef<() => void>(() => undefined);
  const registerShowSidebar = useCallback((show: () => void) => {
    showSidebarRef.current = show;
  }, []);
  const showTriggerRef = useRef<HTMLButtonElement>(null);

  // SPEC-303 EF-10 — the single toast region of the connected screens: without it the `toast()`
  // calls of the shell and the home cards (a failed « Annuler », a lost network) showed nothing.
  return (
    <ToastProvider>
      <LiveAnnouncer>
        <OfflineProvider />
        <div className="flex min-h-screen bg-canvas">
          <a
            href="#contenu"
            className="sr-only z-skip rounded-10 bg-surface px-14 py-10 text-14 font-600 text-ink focus:not-sr-only focus:fixed focus:top-8 focus:left-8"
          >
            {fr.shell.skipToContent}
          </a>
          <Sidebar
            initialData={sidebar}
            initialError={sidebarError}
            showTrigger="external"
            showTriggerRef={showTriggerRef}
            onCollapsedChange={setCollapsed}
            onShowHandler={registerShowSidebar}
          />
          <div id="contenu" tabIndex={-1} className="mx-auto min-w-0 w-full max-w-[90rem] flex-1">
            <Header
              initialData={header}
              initialError={headerError}
              sidebarCollapsed={collapsed}
              onShowSidebar={() => {
                showSidebarRef.current();
              }}
              showTriggerRef={showTriggerRef}
            />
            {children}
          </div>
        </div>
      </LiveAnnouncer>
    </ToastProvider>
  );
};
