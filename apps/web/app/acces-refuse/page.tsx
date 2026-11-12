import { AccessDeniedView } from '../../components/system/system-page-view';
import { readPageSession } from '../../lib/supabase/page';

export const metadata = { title: 'Accès refusé — Learny' };

// The page stays reachable for a signed-in learner; an anonymous visitor is sent to sign in by
// the proxy with a safe `suite` parameter (SPEC-308 EF-5, CA-4).
export default async function AccessDeniedPage() {
  const session = await readPageSession();
  return <AccessDeniedView signedIn={session !== null} />;
}
