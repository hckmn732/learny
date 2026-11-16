import { OfflineRevision } from '../../../components/offline/OfflinePackList';

export const dynamic = 'force-static';

// ET-3 — served by the service worker in place of `/formations/<fid>/quiz-global` when offline.
export default function HorsLigneRevisionsPage() {
  return <OfflineRevision />;
}
