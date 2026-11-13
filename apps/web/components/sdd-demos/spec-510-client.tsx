'use client';

import { useState } from 'react';

import type {
  Spec510Chunk,
  Spec510Data,
  Spec510Snapshot,
} from '../../app/%5Fdev/sdd/spec-510-data';
import { BaseCard } from '../sdd/base-tokens';

const SOURCES = [
  { id: 'web', label: 'Page web' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'image', label: 'Image' },
] as const;

type SourceId = (typeof SOURCES)[number]['id'];

function Status({ testId, snapshot }: Readonly<{ testId: string; snapshot: Spec510Snapshot }>) {
  const ready = snapshot.status === 'ready';
  return (
    <p
      data-testid={testId}
      className={`m-0 inline-block rounded-full px-3 py-1 text-13 font-600 ${
        ready ? 'bg-green-soft text-green-ink' : 'bg-orange-soft text-orange-ink'
      }`}
    >
      {ready ? 'prêt' : snapshot.status === 'failed' ? 'échec' : snapshot.status}
      {snapshot.chunkCount > 0 ? ` · ${String(snapshot.chunkCount)} passage(s)` : ''}
      {snapshot.errorCode === null ? '' : ` · ${snapshot.errorCode}`}
    </p>
  );
}

function locationOf(chunk: Spec510Chunk): string {
  if (chunk.anchor !== null) return `ancre ${chunk.anchor}`;
  if (chunk.startSec !== null)
    return `${String(chunk.startSec)}–${String(chunk.endSec ?? chunk.startSec)} s`;
  return '—';
}

function Chunks({ resourceId, chunks }: Readonly<{ resourceId: string; chunks: Spec510Chunk[] }>) {
  if (chunks.length === 0) {
    return (
      <p data-testid={`${resourceId}-empty`} className="text-13 text-ink-muted">
        Aucun passage produit.
      </p>
    );
  }
  return (
    <div
      role="region"
      aria-label="Passages extraits"
      tabIndex={0}
      className="mt-3 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <table className="w-full min-w-[36rem] text-left text-13">
        <thead>
          <tr className="border-b border-solid border-border">
            <th scope="col" className="px-2 py-2">
              Position
            </th>
            <th scope="col" className="px-2 py-2">
              Localisation
            </th>
            <th scope="col" className="px-2 py-2">
              Extrait
            </th>
          </tr>
        </thead>
        <tbody>
          {chunks.map((chunk) => (
            <tr
              key={`${resourceId}-${String(chunk.position)}`}
              data-testid={`${resourceId}-chunk-${String(chunk.position)}`}
              className="border-b border-solid border-border"
            >
              <td className="px-2 py-2 font-mono">{chunk.position}</td>
              <td className="px-2 py-2 font-mono">{locationOf(chunk)}</td>
              <td className="px-2 py-2">{chunk.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SourcePanel({
  source,
  snapshot,
}: Readonly<{ source: SourceId; snapshot: Spec510Snapshot }>) {
  return (
    <div
      id={`ingestion-${source}-panel`}
      role="tabpanel"
      aria-labelledby={`ingestion-source-${source}`}
      data-testid={`ingestion-${source}-panel`}
      className="mt-4"
    >
      <Status testId={`ingestion-${source}-status`} snapshot={snapshot} />
      <p className="mt-2 text-13">{snapshot.title}</p>
      {source === 'image' ? (
        <p data-testid="ingestion-image-origin" className="mt-1 text-12 text-ink-muted">
          Origine : {snapshot.contentOrigin ?? '—'} · modèle {snapshot.visionModel ?? '—'} · tâche
          light
        </p>
      ) : null}
      <Chunks resourceId={`ingestion-${source}`} chunks={snapshot.chunks} />
    </div>
  );
}

function Failure({ testId, snapshot }: Readonly<{ testId: string; snapshot: Spec510Snapshot }>) {
  return (
    <>
      <Status testId={`${testId}-status`} snapshot={snapshot} />
      <p data-testid={`${testId}-reason`} role="alert" className="mt-2 text-14">
        {snapshot.errorMessage ?? 'Le traitement a échoué.'} Code : {snapshot.errorCode ?? '—'}.
      </p>
    </>
  );
}

export function Spec510View({ data }: Readonly<{ data: Spec510Data }>) {
  const [source, setSource] = useState<SourceId>('web');
  const snapshot = data[source];
  return (
    <>
      <p className="mt-6 text-sm">
        Trois sources réelles sont extraites, découpées et vectorisées en mode simulé. Aucun appel
        réseau, aucune clé et aucun contenu privé ne sont utilisés.
      </p>

      <BaseCard testId="ingestion-tabs-card" title="Sources importées">
        <div role="tablist" aria-label="Types de source" className="flex flex-wrap gap-2">
          {SOURCES.map((item) => (
            <button
              key={item.id}
              id={`ingestion-source-${item.id}`}
              type="button"
              role="tab"
              aria-selected={source === item.id}
              aria-controls={`ingestion-${item.id}-panel`}
              data-testid={`ingestion-source-${item.id}`}
              onClick={() => {
                setSource(item.id);
              }}
              className={`rounded-12 px-4 py-2 text-13 font-600 ${source === item.id ? 'bg-ink text-white' : 'bg-canvas text-ink'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <SourcePanel source={source} snapshot={snapshot} />
      </BaseCard>

      <BaseCard testId="ingestion-ssrf-card" title="Refus SSRF avant toute requête">
        <Failure testId="ingestion-ssrf" snapshot={data.ssrf} />
        <p className="mt-2 text-12 text-ink-muted">
          Adresse locale refusée par assertPublicUrl, sans connexion.
        </p>
      </BaseCard>

      <BaseCard testId="ingestion-no-captions-card" title="Vidéo sans sous-titres publics">
        <Failure testId="ingestion-no-captions" snapshot={data.noCaptions} />
        <p data-testid="ingestion-no-captions-note" className="mt-2 text-12 text-ink-muted">
          Réessayer n’est proposé que si la source peut changer : cette vidéo n’expose aucun
          sous-titre public.
        </p>
      </BaseCard>

      <BaseCard testId="ingestion-contract-card" title="Contrat d’entrée et résultat validé">
        <pre
          role="region"
          aria-label="Contrat et résultat de la démonstration"
          tabIndex={0}
          className="overflow-x-auto rounded-12 bg-canvas p-4 text-12 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {JSON.stringify({ input: data.input, output: data.contractOutput }, null, 2)}
        </pre>
        <p className="mt-2 text-12 text-ink-muted">
          Schémas Zod de `@learny/contracts` : URL, texte, ancrages et segments horodatés.
        </p>
      </BaseCard>
    </>
  );
}
