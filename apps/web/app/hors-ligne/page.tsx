import { ToastProvider } from '@learny/ui';

import { OfflinePackList } from '../../components/offline/OfflinePackList';
import { OfflineProvider } from '../../components/offline/OfflineProvider';
import { SiteFooter } from '../../components/site-footer/SiteFooter';

// Rendered per request: a static page carries no CSP nonce, so its scripts would be refused and
// the IndexedDB list never hydrates (SPEC-805). The service worker precaches the response with its
// own CSP header, so the cached HTML and its nonce stay consistent offline.
export const dynamic = 'force-dynamic';

// SCR-20 / EF-10 — public, precached offline page. It reads IndexedDB on the client and
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
