import { ToastProvider } from '@learny/ui';

import { OfflinePackList } from '../../components/offline/OfflinePackList';
import { OfflineProvider } from '../../components/offline/OfflineProvider';
import { SiteFooter } from '../../components/site-footer/SiteFooter';

export const dynamic = 'force-static';

// SCR-20 / EF-10 — public, statically precached offline page. It reads IndexedDB on the client and
// keeps the synchronisation triggers alive so a network return sends the queue and shows the toast.
export default function HorsLignePage() {
  return (
    <ToastProvider>
      <div className="flex min-h-dvh flex-col">
        <OfflineProvider />
        <div className="flex-1">
          <OfflinePackList />
        </div>
        <SiteFooter />
      </div>
    </ToastProvider>
  );
}
