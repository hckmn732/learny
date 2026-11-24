// Route `(auth)/connexion` (SPEC-3101 EF-1, EF-7).
import type { ReactElement } from 'react';

import { AuthScreen } from '../../src/features/auth/AuthScreen';

export default function ConnexionRoute(): ReactElement {
  return <AuthScreen mode="login" />;
}
