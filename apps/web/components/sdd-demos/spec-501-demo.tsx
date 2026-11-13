'use client';

import { useState } from 'react';

import {
  BRICK_TYPES,
  brickExamples,
  validateBrick,
  type BrickIssue,
  type BrickReferenceResolver,
  type BrickType,
  type BrickDraft,
} from '@learny/bricks';
import { Button, Card, ErrorState, Skeleton } from '@learny/ui';

import {
  correctDemoBrick,
  createDemoBrick,
  reportDemoBrick,
  resetDemoBrick,
} from '../../app/%5Fdev/sdd/spec-501-actions';
import type { DemoBrick } from '../../app/%5Fdev/sdd/spec-501-types';

const FORMATION = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const NOTION = '11111111-1111-4111-8111-111111111111';
const RESOURCE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const demoResolver: BrickReferenceResolver = {
  existingNotionIds: (_formationId, ids) => Promise.resolve(new Set(ids)),
  chunks: (ids) => Promise.resolve(new Map(ids.map((id) => [id, { resourceId: RESOURCE }]))),
  resources: (ids) =>
    Promise.resolve(
      new Map(
        ids.map((id) => [
          id,
          { kind: 'pdf' as const, pages: 1000, durationSec: null, deleted: false },
        ]),
      ),
    ),
  existingBrickIds: (_formationId, ids) => Promise.resolve(new Set(ids)),
};

function draftOf(type: BrickType, payload: unknown): BrickDraft {
  return {
    type,
    formationId: FORMATION,
    purpose: 'bank',
    notionIds: type === 'timer' || type === 'scoring' ? [] : [NOTION],
    origin: type === 'resource_excerpt' ? 'resource' : 'tutor',
    payload,
  };
}

type ValidationState =
  | { kind: 'idle' }
  | { kind: 'valid'; fingerprint: string | null }
  | { kind: 'invalid'; issues: BrickIssue[] }
  | { kind: 'malformed'; message: string };

export interface Spec501DemoProps {
  brick: DemoBrick | null;
  error: string | null;
}

export default function Spec501Demo({ brick, error }: Readonly<Spec501DemoProps>) {
  const [type, setType] = useState<BrickType>('choice_question');
  const [json, setJson] = useState(() =>
    JSON.stringify(brickExamples.choice_question.valid, null, 2),
  );
  const [validation, setValidation] = useState<ValidationState>({ kind: 'idle' });

  function selectType(next: BrickType): void {
    setType(next);
    setJson(JSON.stringify(brickExamples[next].valid, null, 2));
    setValidation({ kind: 'idle' });
  }

  async function validate(): Promise<void> {
    let payload: unknown;
    try {
      payload = JSON.parse(json) as unknown;
    } catch {
      setValidation({ kind: 'malformed', message: 'Le JSON saisi n’est pas valide.' });
      return;
    }
    const result = await validateBrick(draftOf(type, payload), demoResolver);
    if (result.ok) {
      setValidation({ kind: 'valid', fingerprint: result.value.fingerprint });
    } else {
      setValidation({ kind: 'invalid', issues: result.error });
    }
  }

  return (
    <div className="mt-6 grid gap-6">
      {error === null ? null : (
        <ErrorState
          data-testid="brick-error"
          title="Démonstration indisponible"
          description={error}
        />
      )}

      <Card data-testid="brick-validation" aria-labelledby="brick-validation-title">
        <h2 id="brick-validation-title" className="font-display text-xl font-600">
          Schéma et validation
        </h2>
        <div className="mt-4 grid gap-4">
          <label htmlFor="brick-type" className="text-14 font-600">
            Type de brique
          </label>
          <select
            id="brick-type"
            data-testid="brick-type-select"
            className="min-h-44 rounded-12 border border-solid border-border bg-surface px-14 text-14"
            value={type}
            onChange={(event) => {
              selectType(event.target.value as BrickType);
            }}
          >
            {BRICK_TYPES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <label htmlFor="brick-json" className="text-14 font-600">
            Charge JSON
          </label>
          <textarea
            id="brick-json"
            data-testid="brick-json"
            className="min-h-72 rounded-12 border border-solid border-border bg-surface p-14 font-mono text-13"
            spellCheck={false}
            value={json}
            onChange={(event) => {
              setJson(event.target.value);
            }}
          />

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              data-testid="brick-load-invalid"
              onClick={() => {
                setJson(JSON.stringify(brickExamples[type].invalid, null, 2));
                setValidation({ kind: 'idle' });
              }}
            >
              Charger l’exemple invalide
            </Button>
            <Button
              type="button"
              variant="lime"
              data-testid="brick-validate"
              onClick={() => {
                void validate();
              }}
            >
              Valider
            </Button>
          </div>

          <div data-testid="brick-result" aria-live="polite" className="min-h-12 text-14">
            {validation.kind === 'valid' ? (
              <p className="m-0">
                <strong>Valide</strong>{' '}
                {validation.fingerprint === null ? (
                  <span>· aucune empreinte (type non question)</span>
                ) : (
                  <>
                    · empreinte{' '}
                    <code data-testid="brick-fingerprint" className="font-mono text-13">
                      {validation.fingerprint}
                    </code>
                  </>
                )}
              </p>
            ) : null}
            {validation.kind === 'invalid'
              ? validation.issues.map((issue) => (
                  <p key={`${issue.code}-${issue.path}`} data-testid="brick-issue" className="m-0">
                    <code className="font-mono text-13">{issue.code}</code>{' '}
                    <span className="font-mono text-13">{issue.path}</span> — {issue.message}
                  </p>
                ))
              : null}
            {validation.kind === 'malformed' ? (
              <p data-testid="brick-issue" className="m-0">
                <code className="font-mono text-13">SCHEMA_INVALID</code> {validation.message}
              </p>
            ) : null}
          </div>
        </div>
      </Card>

      <Card data-testid="brick-lifecycle" aria-labelledby="brick-lifecycle-title">
        <h2 id="brick-lifecycle-title" className="font-display text-xl font-600">
          Cycle de vie
        </h2>
        <p className="mt-2 text-13 text-ink-muted">
          Une brique de l’utilisateur de démonstration, créée puis corrigée par le vrai service.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <form action={createDemoBrick}>
            <Button type="submit" variant="lime" data-testid="brick-create">
              Créer
            </Button>
          </form>
          <form action={reportDemoBrick}>
            <Button
              type="submit"
              variant="outline"
              data-testid="brick-report"
              disabled={brick === null}
            >
              Signaler
            </Button>
          </form>
          <form action={correctDemoBrick}>
            <Button
              type="submit"
              variant="dark"
              data-testid="brick-correct"
              disabled={brick === null}
            >
              Corriger
            </Button>
          </form>
          <form action={resetDemoBrick}>
            <Button type="submit" variant="ghost" data-testid="brick-reset">
              Réinitialiser
            </Button>
          </form>
        </div>
        <p className="mt-4 text-14">
          Statut :{' '}
          <strong data-testid="brick-status">
            {brick === null ? 'aucune brique' : brick.status}
          </strong>
          {brick === null ? null : ` · version ${String(brick.currentVersion)}`}
        </p>
        {brick === null ? (
          <p className="mt-2 text-13 text-ink-muted">Cliquez sur « Créer » pour commencer.</p>
        ) : (
          <div
            role="region"
            aria-label="Versions de la brique"
            tabIndex={0}
            className="mt-4 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <table data-testid="brick-versions" className="w-full min-w-[32rem] text-left text-13">
              <caption className="sr-only">Versions de la brique de démonstration</caption>
              <thead>
                <tr>
                  <th scope="col" className="border-b border-border py-2 pr-3">
                    Version
                  </th>
                  <th scope="col" className="border-b border-border py-2 pr-3">
                    Auteur
                  </th>
                  <th scope="col" className="border-b border-border py-2 pr-3">
                    Origine
                  </th>
                  <th scope="col" className="border-b border-border py-2">
                    Empreinte
                  </th>
                </tr>
              </thead>
              <tbody>
                {brick.versions.map((version) => (
                  <tr key={version.versionId}>
                    <td className="border-b border-divider py-2 pr-3 font-mono">
                      {version.version}
                    </td>
                    <td className="border-b border-divider py-2 pr-3">{version.createdBy}</td>
                    <td className="border-b border-divider py-2 pr-3">{version.origin}</td>
                    <td className="border-b border-divider py-2 font-mono">
                      {version.fingerprint === null ? '—' : version.fingerprint.slice(0, 12)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card data-testid="brick-public" aria-labelledby="brick-public-title">
        <h2 id="brick-public-title" className="font-display text-xl font-600">
          Charge publique
        </h2>
        <p className="mt-2 text-13 text-ink-muted">
          La charge envoyée au navigateur avant correction : aucune bonne réponse, aucun élément
          attendu, aucun indice.
        </p>
        {brick === null ? (
          <Skeleton data-testid="brick-public-skeleton" className="mt-4 h-24 w-full" />
        ) : (
          <pre
            data-testid="brick-public-json"
            className="mt-4 overflow-x-auto rounded-12 bg-canvas p-14 font-mono text-12"
          >
            {JSON.stringify(brick.publicPayload, null, 2)}
          </pre>
        )}
      </Card>
    </div>
  );
}
