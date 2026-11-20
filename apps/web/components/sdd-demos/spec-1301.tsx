import type { NativeClientScenarioResult } from '@learny/testing/native-client';

import { serverApi } from '../../lib/api/server-client';

export default async function Spec1301Demo() {
  const result = (await (
    await serverApi()
  ).api.devSddSpec1301Demo({})) as NativeClientScenarioResult;

  return (
    <div className="mt-6 grid gap-4">
      <section className="rounded-card border border-border bg-surface p-4">
        <ol className="grid gap-3" data-testid="spec-1301-steps">
          {result.steps.map((step, index) => (
            <li
              className="grid grid-cols-[2rem_1fr_auto] items-center gap-3"
              data-testid="spec-1301-step"
              key={step.name}
            >
              <span aria-hidden="true" className="font-mono text-muted">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span>
                <strong className="block font-600">{step.name}</strong>
                <span className="text-13 text-muted">HTTP {String(step.status)}</span>
                {step.error !== undefined && <span className="block text-error">{step.error}</span>}
              </span>
              <span
                className={`font-mono text-13 ${step.ok ? 'text-green' : 'text-error'}`}
                data-testid="spec-1301-duration"
              >
                {step.durationMs.toFixed(1)} ms
              </span>
            </li>
          ))}
        </ol>
      </section>
      <p
        className={`rounded-card border p-4 font-600 ${
          result.ok ? 'border-green bg-green-soft' : 'border-error bg-error-soft'
        }`}
        data-testid="spec-1301-result"
      >
        {result.ok ? 'Toutes les étapes réussies' : 'Le scénario a échoué'}
      </p>
      <form>
        <button className="button-primary" type="submit">
          Rejouer
        </button>
      </form>
    </div>
  );
}
