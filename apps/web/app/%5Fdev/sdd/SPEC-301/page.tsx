import { notFound, redirect } from 'next/navigation';

import { sddPagesEnabled } from '../../../../lib/sdd-pages';

export const dynamic = 'force-dynamic';

// SPEC-301 EF-11: the validated SDD URL redirects (307) to the design-system gallery.
export default function Spec301RedirectPage() {
  if (!sddPagesEnabled()) notFound();
  redirect('/_dev/ui/jetons');
}
