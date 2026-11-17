'use client';

// Mesure en direct de la page de démonstration (SPEC-804 EF-6, EF-5).
import { useEffect, useState } from 'react';
import { onCLS, onINP, onLCP } from 'web-vitals';

import { fr } from '../../messages/fr';

const t = fr.sdd.spec804.live;

function format(value: number | null, unit: string): string {
  if (value === null) return t.waiting;
  return `${value.toFixed(unit === 'CLS' ? 3 : 0)} ${unit}`;
}

export function Spec804Live() {
  const [lcp, setLcp] = useState<number | null>(null);
  const [cls, setCls] = useState<number | null>(null);
  const [inp, setInp] = useState<number | null>(null);
  const [simulated, setSimulated] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    onLCP(
      (metric) => {
        setLcp(metric.value);
      },
      { reportAllChanges: true },
    );
    onCLS(
      (metric) => {
        setCls(metric.value);
      },
      { reportAllChanges: true },
    );
    onINP(
      (metric) => {
        setInp(metric.value);
      },
      { reportAllChanges: true },
    );
    // Repli observable si web-vitals n'émet pas encore de valeur sous le navigateur de test.
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'event') {
          setInp((current) => Math.max(current ?? 0, entry.duration));
        }
        if (entry.entryType === 'largest-contentful-paint') {
          setLcp((current) => Math.max(current ?? 0, entry.startTime));
        }
      }
    });
    try {
      observer.observe({ type: 'event', buffered: true, durationThreshold: 16 });
      observer.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {
      // Types non pris en charge : web-vitals reste la source principale.
    }
    const ready = setTimeout(() => {
      setHydrated(true);
    }, 0);
    return () => {
      clearTimeout(ready);
      observer.disconnect();
    };
  }, []);

  const simulate = (): void => {
    const start = performance.now();
    let total = 0;
    while (performance.now() - start < 120) total += 1;
    setSimulated(total > 0);
  };

  return (
    <div
      data-testid="perf-live"
      data-hydrated={hydrated ? 'true' : 'false'}
      className="flex flex-col gap-4"
    >
      <p>{t.intro}</p>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-12 border border-solid border-border p-4">
          <dt className="text-13 text-ink-muted">{t.lcp}</dt>
          <dd data-testid="perf-live-lcp" className="mt-1 font-mono text-20 font-600">
            {format(lcp, 'ms')}
          </dd>
        </div>
        <div className="rounded-12 border border-solid border-border p-4">
          <dt className="text-13 text-ink-muted">{t.cls}</dt>
          <dd data-testid="perf-live-cls" className="mt-1 font-mono text-20 font-600">
            {format(cls, 'CLS')}
          </dd>
        </div>
        <div className="rounded-12 border border-solid border-border p-4">
          <dt className="text-13 text-ink-muted">{t.inp}</dt>
          <dd data-testid="perf-live-inp" className="mt-1 font-mono text-20 font-600">
            {format(inp, 'ms')}
          </dd>
        </div>
      </dl>
      <div>
        <button
          type="button"
          data-testid="perf-simulate"
          onClick={simulate}
          className="rounded-12 bg-ink px-16 py-10 text-14 font-600 text-surface"
        >
          {t.simulate}
        </button>
        <span aria-live="polite" className="sr-only">
          {simulated ? 'Interaction simulée' : ''}
        </span>
      </div>
    </div>
  );
}
