// Route `(auth)/inscription` (SPEC-3101 EF-2): the sign-up mode of the account screen.
import type { ReactElement } from 'react';

import { AuthScreen } from '../../src/features/auth/AuthScreen';

export default function InscriptionRoute(): ReactElement {
  return <AuthScreen mode="signup" />;
}
