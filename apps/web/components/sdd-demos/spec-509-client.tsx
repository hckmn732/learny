'use client';

import { useState } from 'react';

import type {
  Spec509Chunk,
  Spec509Data,
  Spec509Snapshot,
} from '../../app/%5Fdev/sdd/spec-509-data';
import { BaseCard } from '../sdd/base-tokens';

const STATUS_LABEL: Record<Spec509Snapshot['status'], string> = {
  queued: 'en file',
  processing: 'en cours',
  ready: 'prêt',
  failed: 'échec',
};

function Status({ testId, snapshot }: Readonly<{ testId: string; snapshot: Spec509Snapshot }>) {
  const ok = snapshot.status === 'ready';
  return (
    <p
      data-testid={testId}
      className={`m-0 inline-block rounded-full px-3 py-1 text-13 font-600 ${
        ok ? 'bg-green-soft text-green-ink' : 'bg-orange-soft text-orange-ink'
      }`}
    >
      {STATUS_LABEL[snapshot.status]}
      {snapshot.chunkCount > 0 ? ` · ${String(snapshot.chunkCount)} passage(s)` : ''}
      {snapshot.errorCode === null ? '' : ` · ${snapshot.errorCode}`}
    </p>
  );
}

function Vector({ chunk, testId }: Readonly<{ chunk: Spec509Chunk; testId: string }>) {
  return (
    <p data-testid={testId} className="m-0 font-mono text-12">
      {chunk.vector.dims} dims · norme {chunk.vector.norm.toFixed(6)} ·{' '}
      {chunk.vector.sample.map((value) => value.toFixed(4)).join(' · ')} · {chunk.vector.digest}
    </p>
  );
}

function ChunkTable({
  resourceId,
  chunks,
}: Readonly<{ resourceId: string; chunks: Spec509Chunk[] }>) {
  if (chunks.length === 0) {
    return (
      <p data-testid={`${resourceId}-empty`} className="text-13 text-ink-muted">
        Aucun passage : le traitement n’a pas produit de contenu.
      </p>
    );
  }
  return (
    <div
      role="region"
      aria-label="Passages et vecteurs"
      tabIndex={0}
      className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <table className="w-full min-w-[44rem] text-left text-13">
        <thead>
          <tr className="border-b border-solid border-border">
            <th scope="col" className="px-2 py-2">
              Position
            </th>
            <th scope="col" className="px-2 py-2">
              Page
            </th>
            <th scope="col" className="px-2 py-2">
              Emplacement
            </th>
            <th scope="col" className="px-2 py-2">
              Extrait
            </th>
            <th scope="col" className="px-2 py-2">
              Vecteur (extrait)
            </th>
          </tr>
        </thead>
        <tbody>
          {chunks.map((chunk) => (
            <tr
              key={`${resourceId}-${String(chunk.position)}`}
              data-testid={`${resourceId}-chunk-${String(chunk.position)}`}
              data-page={chunk.page ?? ''}
              className="border-b border-solid border-border"
            >
              <td className="px-2 py-2 font-mono">{chunk.position}</td>
              <td className="px-2 py-2 font-mono">{chunk.page ?? '—'}</td>
              <td className="px-2 py-2 font-mono">
                {chunk.charStart}–{chunk.charEnd} · {chunk.tokenCount} jetons
              </td>
              <td className="px-2 py-2">{chunk.text}</td>
              <td className="px-2 py-2">
                <Vector chunk={chunk} testId={`${resourceId}-vector-${String(chunk.position)}`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Steps({ snapshot }: Readonly<{ snapshot: Spec509Snapshot }>) {
  const ok = snapshot.status === 'ready';
  return (
    <ol data-testid="ingestion-steps" className="m-0 grid list-none gap-2 p-0 text-13">
      <li>1. Extraction {ok ? '✓' : snapshot.status === 'failed' ? '✗' : '…'}</li>
      <li>2. Découpage {ok ? '✓' : snapshot.status === 'failed' ? 'non exécuté' : '…'}</li>
      <li>
        3. Embedding 1024 dimensions {ok ? '✓' : snapshot.status === 'failed' ? 'non exécuté' : '…'}
      </li>
      <li>4. Événement {snapshot.event ?? '—'}</li>
    </ol>
  );
}

function Failure({
  failed,
  retried,
}: Readonly<{ failed: Spec509Snapshot; retried: Spec509Snapshot }>) {
  const [current, setCurrent] = useState<Spec509Snapshot>(failed);
  const [attempts, setAttempts] = useState(0);
  return (
    <>
      <Status testId="ingestion-failure-status" snapshot={current} />
      <div aria-live="polite" className="mt-3">
        {current.status === 'failed' ? (
          <p data-testid="ingestion-failure-reason" className="mt-0 text-14">
            {current.errorMessage ?? 'Le traitement a échoué.'} Code : {current.errorCode ?? '—'}.
            Le bouton « Réessayer » relance le même apport sans créer de doublon.
          </p>
        ) : (
          <p data-testid="ingestion-retry-success" className="mt-0 text-14">
            Deuxième tentative réussie : {current.chunkCount} passage(s), événement{' '}
            {current.event ?? '—'}.
          </p>
        )}
      </div>
      <button
        type="button"
        data-testid="ingestion-retry"
        className="mt-3 rounded-12 bg-ink px-4 py-2 text-13 font-600 text-white"
        onClick={() => {
          setAttempts((value) => value + 1);
          setCurrent(retried);
        }}
      >
        Réessayer
      </button>
      <p data-testid="ingestion-retry-attempts" className="mt-2 text-12 text-ink-muted">
        Tentatives : {attempts}
      </p>
      {current.status === 'ready' ? (
        <ChunkTable resourceId="ingestion-failure" chunks={current.chunks} />
      ) : null}
    </>
  );
}

export function Spec509View({ data }: Readonly<{ data: Spec509Data }>) {
  return (
    <>
      <p className="mt-6 text-sm">
        Les deux apports fictifs sont réellement extraits, découpés et vectorisés en mode simulé.
        Aucun appel réseau, aucune clé et aucun contenu privé ne sont utilisés.
      </p>

      <BaseCard testId="ingestion-steps-card" title="Étapes du traitement">
        <Steps snapshot={data.note} />
      </BaseCard>

      <BaseCard testId="ingestion-note-card" title="Note : idées et brouillon">
        <Status testId="ingestion-note-status" snapshot={data.note} />
        <p className="mt-3 text-13">
          {data.note.outcome.outcome} · {data.note.outcome.embeddingCount} vecteur(s) de 1024
          dimensions.
        </p>
        <ChunkTable resourceId="ingestion-note" chunks={data.note.chunks} />
      </BaseCard>

      <BaseCard testId="ingestion-pdf-card" title="PDF privé de deux pages">
        <Status testId="ingestion-pdf-status" snapshot={data.pdf} />
        <p className="mt-3 text-13">
          Pages : {data.pdf.pages ?? '—'} · fichier Anthropic simulé :{' '}
          <span className="font-mono">{data.pdf.anthropicFileId ?? 'non envoyé'}</span>
        </p>
        <ChunkTable resourceId="ingestion-pdf" chunks={data.pdf.chunks} />
      </BaseCard>

      <BaseCard testId="ingestion-failure-card" title="Échec lisible et réessai">
        <Failure failed={data.failure.failed} retried={data.failure.retried} />
      </BaseCard>

      <BaseCard testId="ingestion-contract-card" title="Contrat d’entrée et résultat validé">
        <pre className="overflow-x-auto rounded-12 bg-canvas p-4 text-12">
          {JSON.stringify({ input: data.input, output: data.contractOutput }, null, 2)}
        </pre>
        <p className="mt-2 text-12 text-ink-muted">
          Schémas Zod de `@learny/contracts` : identifiant UUID, résultat prêt/échec/ignoré.
        </p>
      </BaseCard>
    </>
  );
}
