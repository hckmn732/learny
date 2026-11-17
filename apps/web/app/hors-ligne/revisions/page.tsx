import { OfflineRevision } from '../../../components/offline/OfflinePackList';

// Per request, for the CSP nonce of its scripts (see `/hors-ligne`).
export const dynamic = 'force-dynamic';

// ET-3 — served by the service worker in place of `/formations/<fid>/quiz-global` when offline.
export default function HorsLigneRevisionsPage() {
  return <OfflineRevision />;
}
