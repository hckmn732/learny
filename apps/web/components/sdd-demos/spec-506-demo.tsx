'use client';

import { useActionState } from 'react';

import type { QualificationReport } from '@learny/contracts';
import { Badge, Button, Card, ErrorState } from '@learny/ui';

import { runSpec506Demo, type Spec506DemoState } from '../../app/%5Fdev/sdd/spec-506-actions';

const INITIAL: Spec506DemoState = { scenario: 'idle', input: '{}', report: null, error: null };

const STEP_LABELS: Record<string, string> = {
  connection: 'Connexion',
  tools: 'Appel d’outils',
  structured: 'Sortie structurée',
  bricks: 'Treize briques',
};

const BRICK_LABELS: Record<string, string> = {
  text: 'Texte',
  resource_excerpt: 'Extrait de ressource',
  choice_question: 'Question à choix',
  open_question: 'Question ouverte',
  cloze: 'Texte à trous',
  matching: 'Association',
  ordering: 'Mise en ordre',
  categorization: 'Classement',
  recall_card: 'Carte de rappel',
  instruction: 'Consigne',
  scripted_dialogue: 'Dialogue scénarisé',
  timer: 'Minuteur',
  scoring: 'Barème',
};

function statusTone(status: 'passed' | 'failed'): 'green' | 'orange' {
  return status === 'passed' ? 'green' : 'orange';
}

function statusLabel(status: 'passed' | 'failed'): string {
  return status === 'passed' ? 'Réussi' : 'Échec';
}

function reportStatus(report: QualificationReport | null): string {
  if (report === null) return 'Aucun rapport';
  return report.status === 'qualified' ? 'Qualifié' : 'Échec de qualification';
}

export default function Spec506Demo() {
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
              {report.modelId} · {report.modelVersion} · {report.durationMs} ms
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
            aria-label="Rapport par étape"
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
                    Durée
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Code d’erreur
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Version
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.steps.map((step) => (
                  <tr
                    key={step.step}
                    data-testid="spec-506-step-row"
                    className="border-t border-border"
                  >
                    <th scope="row" className="px-3 py-2 font-600">
                      {STEP_LABELS[step.step] ?? step.step}
                    </th>
                    <td className="px-3 py-2">
                      <Badge tone={statusTone(step.status)}>{statusLabel(step.status)}</Badge>
                    </td>
                    <td className="px-3 py-2 font-mono">{step.durationMs} ms</td>
                    <td className="px-3 py-2 font-mono">{step.errorCode ?? '—'}</td>
                    <td className="px-3 py-2 font-mono">{step.modelVersion}</td>
                  </tr>
                ))}
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
            <table className="w-full min-w-[44rem] text-left text-13">
              <thead>
                <tr>
                  <th scope="col" className="px-3 py-2">
                    Type
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Statut
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Durée
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Code d’erreur
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Détail sûr
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.bricks.map((brick) => (
                  <tr
                    key={brick.type}
                    data-testid="spec-506-brick-row"
                    className="border-t border-border"
                  >
                    <th scope="row" className="px-3 py-2 font-600">
                      {BRICK_LABELS[brick.type] ?? brick.type}
                    </th>
                    <td className="px-3 py-2">
                      <Badge tone={statusTone(brick.status)}>{statusLabel(brick.status)}</Badge>
                    </td>
                    <td className="px-3 py-2 font-mono">{brick.durationMs} ms</td>
                    <td className="px-3 py-2 font-mono">{brick.errorCode ?? '—'}</td>
                    <td className="px-3 py-2 font-mono">
                      {brick.issues[0]?.code ?? '—'}
                      {brick.issues[0]?.path ? ` @ ${brick.issues[0].path}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
