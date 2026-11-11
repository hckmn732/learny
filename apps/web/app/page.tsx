import Link from 'next/link';

import { sddPagesEnabled } from '../lib/sdd-pages';
import { fr } from '../messages/fr';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-3xl font-semibold">{fr.home.title}</h1>
      <p className="mt-4">{fr.home.subtitle}</p>
      {sddPagesEnabled() ? (
        <p className="mt-4">
          <Link className="underline" href="/_dev/sdd">
            {fr.home.demoLink}
          </Link>
        </p>
      ) : null}
    </main>
  );
}
