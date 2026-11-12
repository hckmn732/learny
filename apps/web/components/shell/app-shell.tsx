import type { ReactNode } from 'react';

import type { SidebarDto } from '@learny/contracts';

import { fr } from '../../messages/fr';

import { Sidebar, SIDEBAR_COLLAPSED_STORAGE_KEY } from './sidebar';

export interface AppShellProps {
  sidebar: SidebarDto | null;
  sidebarError?: boolean;
  children: ReactNode;
}

/**
 * Layout of every connected screen (SPEC-304). The header and its search/notifications/account
 * controls are provided by SPEC-305; this specification mounts the sidebar and its reveal trigger.
 */
export const AppShell = ({ sidebar, sidebarError = false, children }: AppShellProps) => {
  // ET-3 — the preference is already in localStorage before hydration: the first paint can use the
  // server value without waiting for the client query. The attribute also hides the sidebar in the
  // tiny window before React hydrates when the profile says it is collapsed.
  const sidebarBootstrap =
    sidebar === null
      ? ''
      : `try{localStorage.setItem(${JSON.stringify(SIDEBAR_COLLAPSED_STORAGE_KEY)},${JSON.stringify(
          sidebar.collapsed ? '1' : '0',
        )});}catch(e){}
document.documentElement.setAttribute('data-sidebar-collapsed', ${JSON.stringify(
          sidebar.collapsed ? 'true' : 'false',
        )});`;

  return (
    <div className="flex min-h-screen bg-canvas">
      {sidebarBootstrap === '' ? null : (
        <script dangerouslySetInnerHTML={{ __html: sidebarBootstrap }} />
      )}
      <a
        href="#contenu"
        className="sr-only z-skip rounded-10 bg-surface px-14 py-10 text-14 font-600 text-ink focus:not-sr-only focus:fixed focus:top-8 focus:left-8"
      >
        {fr.shell.skipToContent}
      </a>
      <Sidebar initialData={sidebar} initialError={sidebarError} />
      <div id="contenu" tabIndex={-1} className="min-w-0 flex-1">
        {children}
      </div>
    </div>
  );
};
