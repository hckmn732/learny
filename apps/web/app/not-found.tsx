import { NotFoundView } from '../components/system/system-page-view';
import { readPageSession } from '../lib/supabase/page';

// Session-aware 404 (SPEC-308 ET-2): an anonymous visitor is invited to sign in, a signed-in
// learner keeps a direct way home. The home link is always present for JavaScript-free use (CL-1).
export default async function NotFound() {
  const session = await readPageSession();
  return <NotFoundView signedIn={session !== null} />;
}
