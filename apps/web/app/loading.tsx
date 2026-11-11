import { fr } from '../messages/fr';

export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <p role="status" aria-live="polite" data-testid="system-loading">
        {fr.system.loading}
      </p>
    </main>
  );
}
