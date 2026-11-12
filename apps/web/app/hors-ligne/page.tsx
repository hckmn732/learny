import { OfflineView } from '../../components/system/system-page-view';

export const metadata = { title: 'Hors ligne — Learny' };

// Public route kept by the proxy so an offline learner still gets an explanation and a retry.
export default function OfflinePage() {
  return <OfflineView />;
}
