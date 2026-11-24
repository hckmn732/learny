// Route `auth/callback` (SPEC-3101 EF-6): magic link, confirmation link and universal link.
import type { ReactElement } from 'react';

import { CallbackScreen } from '../../src/features/auth/CallbackScreen';

export default function AuthCallbackRoute(): ReactElement {
  return <CallbackScreen />;
}
