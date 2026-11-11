import Link from 'next/link';

import { fr } from '../messages/fr';

const t = fr.system.notFound;

export default function NotFound() {
  return (
    <main data-testid="system-not-found" className="mx-auto max-w-2xl p-8">
      <h1 className="font-display text-3xl font-semibold">{t.title}</h1>
      <p className="mt-4">{t.body}</p>
      <p className="mt-6">
        <Link href="/" className="underline">
          {t.home}
        </Link>
      </p>
    </main>
  );
}
