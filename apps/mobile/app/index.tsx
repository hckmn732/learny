// Entry route (SPEC-3001 EF-1, SPEC-3101 EF-7, BR-ACC-09).
//
// A test build opens the demonstration page directly (the flows of SPEC-3001 to SPEC-3003 rely on
// it); a production build sends a signed-out learner to the sign-in screen and a signed-in one to
// the shell of SPEC-3102.
import { Redirect } from 'expo-router';
import type { ReactElement } from 'react';

import { useSession } from '../src/auth/session';
import { configResult } from '../src/config';
import { HomePlaceholder } from '../src/features/sdd/HomePlaceholder';

export default function IndexRoute(): ReactElement {
  const session = useSession();

  if (configResult.ok && configResult.config.enableSddPages) {
    return <Redirect href="/_dev/sdd/SPEC-3001" />;
  }
  if (session.status === 'signedIn') return <Redirect href="/(app)/aujourdhui" />;
  if (session.status === 'signedOut') return <Redirect href="/(auth)/connexion" />;
  return <HomePlaceholder />;
}
