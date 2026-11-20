'use client';

import { useActionState } from 'react';

import { api } from '@learny/api-client';
import type { AiTaskCompatibility } from '@learny/contracts';
import { Badge, Button, Card, ErrorState } from '@learny/ui';

interface Spec506DemoState {
  scenario: 'idle' | 'success' | 'invalid';
  input: string;
  report: AiTaskCompatibility | null;
  error: string | null;
}

function formText(formData: FormData, key: string, fallback: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : fallback;
}

const INITIAL: Spec506DemoState = { scenario: 'idle', input: '{}', report: null, error: null };

const STEP_LABELS: Record<string, string> = {
  tools: 'Appel d’outils strict',
  structured: 'Sortie structurée',
  web_search: 'Recherche web',
  passage_refs: 'Renvois aux apports',
  vision: 'Entrée image',
};

function statusTone(compatible: boolean): 'green' | 'orange' {
  return compatible ? 'green' : 'orange';
}

function statusLabel(compatible: boolean): string {
  return compatible ? 'Réussi' : 'Sous réserve';
}

function reportStatus(report: AiTaskCompatibility | null): string {
  if (report === null) return 'Aucun rapport';
  return report.status === 'compatible' ? 'Compatible' : 'Sous réserve';
}

export default function Spec506Demo() {
  const runSpec506Demo = async (
    _previous: Spec506DemoState,
    formData: FormData,
  ): Promise<Spec506DemoState> => {
    try {
      return (await api.devSddSpec506Run({
        body: { scenario: formText(formData, 'scenario', 'success') },
      }, { idempotencyKey: crypto.randomUUID() })) as Spec506DemoState;
    } catch (caught) {
      return {
        scenario: formText(formData, 'scenario', 'success') === 'invalid' ? 'invalid' : 'success',
        input: '{}',
        report: null,
        error: caught instanceof Error ? caught.message : 'Démonstration indisponible.',
      };
    }
  };
  const [state, action, pending] = useActionState(runSpec506Demo, INITIAL);
  const report = state.report;

  return (
    <div className="mt-6 grid gap-6">
      <Card data-testid="spec-506-demo" labelledBy="spec-506-demo-title">
        <h2 id="spec-506-demo-title" className="font-display text-xl font-600">
          Batterie de qualification
        </h2>
        <p className="mt-2 text-14 text-ink-muted">
          Deux scénarios simulés, sans champ de clé : le modèle réussit la batterie complète ou
          échoue sur une seule brique. Aucun fournisseur réel n’est appelé.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <form action={action}>
            <input type="hidden" name="scenario" value="success" />
            <Button
              type="submit"
              variant="lime"
              data-testid="spec-506-run-success"
              loading={pending}
            >
              Qualifier (succès simulé)
            </Button>
          </form>
          <form action={action}>
            <input type="hidden" name="scenario" value="invalid" />
            <Button
              type="submit"
              variant="outline"
              data-testid="spec-506-run-invalid"
              loading={pending}
            >
              Qualifier (brique invalide)
            </Button>
          </form>
        </div>
        {state.error === null ? null : (
          <ErrorState
            data-testid="spec-506-error"
            title="Qualification indisponible"
            description={state.error}
          />
        )}
        <p className="mt-4 text-14">
          Statut :{' '}
          <span data-testid="spec-506-status" className="font-600">
            {pending ? 'Qualification en cours…' : reportStatus(report)}
          </span>
          {report === null ? null : (
            <span className="ml-3 font-mono text-13 text-ink-muted">
              {report.modelId} · {report.checkedAt} · {report.durationMs} ms
            </span>
          )}
        </p>
      </Card>

      <Card data-testid="spec-506-steps" labelledBy="spec-506-steps-title">
        <h2 id="spec-506-steps-title" className="font-display text-xl font-600">
          Rapport par étape
        </h2>
        {report === null ? (
          <p data-testid="spec-506-steps-empty" className="mt-4 text-14 text-ink-muted">
            Lancez un scénario pour afficher les quatre étapes.
          </p>
        ) : (
          <div
            role="region"
            aria-label="Rapport de compatibilité"
            tabIndex={0}
            className="mt-4 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <table className="w-full min-w-[38rem] text-left text-13">
              <thead>
                <tr>
                  <th scope="col" className="px-3 py-2">
                    Étape
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Statut
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Code
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.requiredCapabilities.map((capability) => {
                  const reason = report.reasons.find((entry) =>
                    capability === 'structured'
                      ? entry.code === 'STRUCTURED_UNRELIABLE'
                      : capability === 'vision'
                        ? entry.code === 'NO_VISION'
                        : entry.code === 'NO_TOOLS',
                  );
                  return (
                    <tr
                      key={capability}
                      data-testid="spec-506-step-row"
                      className="border-t border-border"
                    >
                      <th scope="row" className="px-3 py-2 font-600">
                        {STEP_LABELS[capability] ?? capability}
                      </th>
                      <td className="px-3 py-2">
                        <Badge tone={statusTone(reason === undefined)}>
                          {statusLabel(reason === undefined)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 font-mono">{reason?.code ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card data-testid="spec-506-bricks" labelledBy="spec-506-bricks-title">
        <h2 id="spec-506-bricks-title" className="font-display text-xl font-600">
          Rapport par type de brique
        </h2>
        {report === null ? (
          <p data-testid="spec-506-bricks-empty" className="mt-4 text-14 text-ink-muted">
            Les treize types apparaîtront après une qualification.
          </p>
        ) : (
          <div
            role="region"
            aria-label="Rapport par type de brique"
            tabIndex={0}
            className="mt-4 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <p className="p-3 text-14 text-ink-muted">
              Pendant une tâche réelle, chaque brique continue d’être validée par `@learny/bricks`,
              corrigée jusqu’à deux fois, puis arrêtée avec `INVALID_OUTPUT`.
            </p>
          </div>
        )}
      </Card>

      <Card data-testid="spec-506-contract" labelledBy="spec-506-contract-title">
        <h2 id="spec-506-contract-title" className="font-display text-xl font-600">
          Contrat d’entrée et résultat validé
        </h2>
        <div className="mt-4 grid gap-3">
          <p className="m-0 text-13 font-600">Entrée validée par Zod</p>
          <pre
            data-testid="spec-506-contract-input"
            role="region"
            aria-label="Entrée validée de la qualification"
            tabIndex={0}
            className="overflow-x-auto rounded-12 bg-canvas p-4 font-mono text-13 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {state.input}
          </pre>
          <p className="m-0 text-13 font-600">Résultat validé</p>
          <pre
            data-testid="spec-506-contract-result"
            role="region"
            aria-label="Résultat validé de la qualification"
            tabIndex={0}
            className="max-h-64 overflow-auto rounded-12 bg-canvas p-4 font-mono text-13 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {report === null ? '{}' : JSON.stringify(report, null, 2)}
          </pre>
          <p className="m-0 text-13 text-ink-muted">
            Le rapport ne contient ni clé, ni chiffré, ni contenu privé. Une erreur simulée est
            rendue avec un code sûr.
          </p>
        </div>
      </Card>
    </div>
  );
}
