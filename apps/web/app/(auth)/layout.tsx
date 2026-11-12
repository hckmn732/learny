import type { ReactNode } from 'react';

import { AuthLayoutRoute } from '../../components/auth/auth-layout';

// The group owns the shared split layout (SPEC-308 EF-3). Sign-up, sign-in and verification
// pages render inside it; the connected shell is never mounted here.
export default function AuthGroupLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AuthLayoutRoute>{children}</AuthLayoutRoute>;
}
