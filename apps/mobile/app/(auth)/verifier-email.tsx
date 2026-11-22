// Route `(auth)/verifier-email` (SPEC-3101 BR-ACC-03).
import type { ReactElement } from 'react';

import { VerifyEmailScreen } from '../../src/features/auth/VerifyEmailScreen';

export default function VerifierEmailRoute(): ReactElement {
  return <VerifyEmailScreen />;
}
