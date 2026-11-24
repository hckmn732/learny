// Route `auth/mobile` (SPEC-3101 EF-6, ET-3).
//
// Landing of the universal link `https://<web>/auth/mobile?code=…` when the platform opens the
// application instead of the browser (App Links / Associated Domains). It behaves exactly like
// `auth/callback`, so the web page of EF-8 and the application share one single exchange path.
import type { ReactElement } from 'react';

import { CallbackScreen } from '../../src/features/auth/CallbackScreen';

export default function AuthMobileRoute(): ReactElement {
  return <CallbackScreen />;
}
