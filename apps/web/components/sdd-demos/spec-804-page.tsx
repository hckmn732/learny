'use client';

// Entrée du registre des démonstrations (SPEC-006, proxy) ; la page dédiée `/_dev/sdd/SPEC-804`
// reste la référence et sert le rapport disponible.
import { Card } from '@learny/ui';

import { fr } from '../../messages/fr/sdd';

import { Spec804Live } from './spec-804';

const t = fr.sdd.spec804;

export default function Spec804PageDemo() {
  return (
    <div className="mt-6 flex flex-col gap-6">
      <Card>
        <section data-testid="perf-budgets">
          <h2 className="text-xl font-semibold">{t.budgets.title}</h2>
          <p className="mt-2 text-14 text-ink-muted">{t.budgets.intro}</p>
        </section>
      </Card>
      <Card>
        <h2 className="text-xl font-semibold">{t.live.title}</h2>
        <div className="mt-4">
          <Spec804Live />
        </div>
      </Card>
    </div>
  );
}
