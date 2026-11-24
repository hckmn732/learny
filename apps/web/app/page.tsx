import { fr } from '@learny/i18n/fr/home';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-3xl font-semibold">{fr.home.title}</h1>
      <p className="mt-4">{fr.home.subtitle}</p>
    </main>
  );
}
