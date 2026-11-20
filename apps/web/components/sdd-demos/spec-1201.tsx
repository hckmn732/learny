'use client';

import { useEffect, useState } from 'react';

import { Card, CardHeader } from '@learny/ui';

interface RelayProbe {
  servedBy: string;
  latencyMs: number | null;
  fragments: number;
}

const INITIAL: RelayProbe = { servedBy: 'mesure…', latencyMs: null, fragments: 0 };

async function countStreamFragments(): Promise<number> {
  const response = await fetch('/api/v1/dev/sdd/relay-stream', { cache: 'no-store' });
  if (!response.ok || response.body === null) throw new Error('Flux SSE indisponible');
  const reader = response.body.getReader();
  let count = 0;
  for (let part = await reader.read(); !part.done; part = await reader.read()) {
    count += 1;
  }
  return count;
}

export default function Spec1201Demo() {
  const [probe, setProbe] = useState<RelayProbe>(INITIAL);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const latencies: number[] = [];
      let servedBy = 'inconnu';
      for (let index = 0; index < 10; index += 1) {
        const started = performance.now();
        const response = await fetch('/api/v1/health', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('API indisponible');
        servedBy = response.headers.get('x-served-by') ?? 'inconnu';
        latencies.push(performance.now() - started);
      }
      const sorted = [...latencies].sort((left, right) => left - right);
      const midpoint = Math.floor(sorted.length / 2);
      const latencyMs = ((sorted[midpoint - 1] ?? 0) + (sorted[midpoint] ?? 0)) / 2;
      const fragments = await countStreamFragments();
      setProbe({ servedBy, latencyMs, fragments });
    })().catch((reason: unknown) => {
      if (!controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : 'Mesure impossible');
      }
    });
    return () => {
      controller.abort();
    };
  }, []);

  return (
    <section aria-live="polite" className="grid gap-4 lg:grid-cols-3">
      <Card data-testid="spec-1201-served-by" labelledBy="spec-1201-served-by-title">
        <CardHeader title="Point de terminaison" titleId="spec-1201-served-by-title" />
        <p className="mt-4 font-mono font-semibold">Servi par : {probe.servedBy}</p>
      </Card>
      <Card data-testid="spec-1201-latency" labelledBy="spec-1201-latency-title">
        <CardHeader title="Relai web" titleId="spec-1201-latency-title" />
        <p className="mt-4 font-mono font-semibold">
          {probe.latencyMs === null ? 'Mesure…' : `${probe.latencyMs.toFixed(1)} ms`}
        </p>
      </Card>
      <Card data-testid="spec-1201-sse" labelledBy="spec-1201-sse-title">
        <CardHeader title="Flux du tuteur" titleId="spec-1201-sse-title" />
        <p className="mt-4 font-mono font-semibold">
          Fragments reçus avant la fin : {probe.fragments}
        </p>
      </Card>
      {error !== null && (
        <p className="text-error lg:col-span-3" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
