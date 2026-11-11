import { readReferences } from '../../lib/references';
import { fr } from '../../messages/fr';
import { DemoSection } from '../sdd/demo-shell';

import { Spec005Gallery } from './spec-005-gallery';

const t = fr.sdd.spec005;

export default function Spec005Demo() {
  const references = readReferences();

  if (!references.ok) {
    return (
      <DemoSection testId="spec-005-summary" title={t.summary.title}>
        <p>{t.gallery.missing}</p>
      </DemoSection>
    );
  }

  const counters = [
    { id: 'mockups', label: t.summary.mockups, value: references.mockups },
    { id: 'states', label: t.summary.states, value: references.states },
    { id: 'captures', label: t.summary.captures, value: references.captures },
    { id: 'tokens', label: t.summary.tokens, value: references.tokens },
  ] as const;

  return (
    <>
      <DemoSection testId="spec-005-summary" title={t.summary.title}>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {counters.map((counter) => (
            <div
              key={counter.id}
              className="rounded-[16px] border border-solid border-[#E7E6E1] p-4"
            >
              <dt className="text-sm">{counter.label}</dt>
              <dd
                data-testid={`spec-005-count-${counter.id}`}
                className="mt-1 font-mono text-3xl font-semibold"
              >
                {counter.value}
              </dd>
            </div>
          ))}
        </dl>
      </DemoSection>

      <DemoSection testId="spec-005-gallery" title={t.gallery.title}>
        <Spec005Gallery states={references.stateList} />
      </DemoSection>
    </>
  );
}
