'use client';

import { useState } from 'react';

import type { TutorRunResult } from '@learny/contracts';
import type { TutorDemo } from '@learny/tutor/demo';

import { BaseCard } from '../sdd/base-tokens';

type Scenario = 'success' | 'refusal' | 'invalid';

const SCENARIOS: { id: Scenario; label: string; testId: string }[] = [
  { id: 'success', label: 'Lancer le parcours validé', testId: 'tutor-run-success' },
  { id: 'refusal', label: 'Tenter un outil inconnu', testId: 'tutor-run-refusal' },
  { id: 'invalid', label: 'Épuiser les corrections', testId: 'tutor-run-invalid' },
];

const STATUS_LABEL: Record<string, string> = {
  executed: 'exécutée',
  guard_refused: 'refusée par le garde-fou',
  unknown_tool: 'outil inconnu, aucune écriture',
  invalid_input: 'entrée invalide',
  failed: 'échec contrôlé',
};

function resultFor(demo: TutorDemo, scenario: Scenario): TutorRunResult {
  if (scenario === 'refusal') return demo.refusal;
  if (scenario === 'invalid') return demo.invalid;
  return demo.success;
}

function ToolTable({ result }: Readonly<{ result: TutorRunResult }>) {
  if (result.toolCalls.length === 0) {
    return <p className="mt-3 text-13">Aucun appel d’outil : la réponse est un texte direct.</p>;
  }
  return (
    <div
      role="region"
      aria-label="Chronologie des appels d’outil"
      tabIndex={0}
      className="mt-3 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <table className="w-full min-w-[44rem] text-left text-13">
        <thead>
          <tr>
            <th scope="col" className="px-2 py-2">
              Tour
            </th>
            <th scope="col" className="px-2 py-2">
              Outil
            </th>
            <th scope="col" className="px-2 py-2">
              Validation / garde / exécution
            </th>
            <th scope="col" className="px-2 py-2">
              Sortie ou erreur
            </th>
          </tr>
        </thead>
        <tbody>
          {result.toolCalls.map((call) => (
            <tr
              key={call.toolCallId}
              data-testid="tutor-tool-row"
              className="border-t border-border align-top"
            >
              <td className="px-2 py-2 font-mono">{call.turn}</td>
              <td className="px-2 py-2 font-mono">{call.toolName}</td>
              <td className="px-2 py-2" data-testid="tutor-tool-status">
                {STATUS_LABEL[call.status] ?? call.status}
              </td>
              <td className="px-2 py-2 font-mono text-12">
                {call.error === undefined
                  ? JSON.stringify(call.output)
                  : `${call.error.code} — ${call.error.message}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Spec508Client({ demo }: Readonly<{ demo: TutorDemo }>) {
  const [scenario, setScenario] = useState<Scenario>('success');
  const result = resultFor(demo, scenario);

  return (
    <>
      <BaseCard testId="tutor-registry" title="Registre fermé des dix actions">
        <p className="text-13">
          Le modèle ne peut appeler aucune action hors de cette liste. Chaque action valide son
          entrée par Zod, exécute son garde-fou puis écrit dans une transaction sous RLS.
        </p>
        <div
          role="region"
          aria-label="Actions du tuteur"
          tabIndex={0}
          className="mt-4 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <table className="w-full min-w-[52rem] text-left text-13">
            <thead>
              <tr>
                <th scope="col" className="px-2 py-2">
                  Action
                </th>
                <th scope="col" className="px-2 py-2">
                  Rôle
                </th>
                <th scope="col" className="px-2 py-2">
                  Entrée
                </th>
                <th scope="col" className="px-2 py-2">
                  Garanties
                </th>
              </tr>
            </thead>
            <tbody>
              {demo.registry.map((action) => (
                <tr key={action.name} data-testid="tutor-action-row" className="border-t border-border align-top">
                  <th scope="row" className="px-2 py-2 font-mono">
                    {action.name}
                  </th>
                  <td className="px-2 py-2">{action.description}</td>
                  <td className="px-2 py-2 font-mono text-12">{action.inputKeys.join(', ')}</td>
                  <td className="px-2 py-2">schéma · garde-fou · transaction</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </BaseCard>

      <BaseCard testId="tutor-prompts" title="Consignes versionnées, ton et langue">
        <div
          role="region"
          aria-label="Consignes par tâche"
          tabIndex={0}
          className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <table className="w-full min-w-[40rem] text-left text-13">
            <thead>
              <tr>
                <th scope="col" className="px-2 py-2">
                  Tâche
                </th>
                <th scope="col" className="px-2 py-2">
                  Consigne
                </th>
                <th scope="col" className="px-2 py-2">
                  Version
                </th>
                <th scope="col" className="px-2 py-2">
                  Ton / langue
                </th>
              </tr>
            </thead>
            <tbody>
              {demo.prompts.map((prompt) => (
                <tr key={prompt.id} data-testid="tutor-prompt-row" className="border-t border-border">
                  <td className="px-2 py-2 font-mono">{prompt.task}</td>
                  <td className="px-2 py-2">{prompt.preview}</td>
                  <td className="px-2 py-2">{prompt.version}</td>
                  <td className="px-2 py-2">
                    {prompt.tone} / {prompt.language}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-13">
          Libellés fixes de l’interface : en français. La sortie du tuteur suit le profil :
        </p>
        <p className="mt-2 rounded-12 border border-solid border-border p-3 text-13" data-testid="tutor-tone-output">
          <span className="font-semibold">tu / en</span> — {demo.tone.text}
        </p>
        <p className="mt-2 rounded-12 border border-solid border-border p-3 text-13">
          <span className="font-semibold">vous / fr</span> — {demo.success.text}
        </p>
      </BaseCard>

      <BaseCard testId="tutor-run" title="Chronologie d’un tour de tuteur">
        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              data-testid={entry.testId}
              aria-pressed={scenario === entry.id}
              onClick={() => {
                setScenario(entry.id);
              }}
              className={`rounded-12 border border-solid border-border px-3 py-2 text-13 ${
                scenario === entry.id ? 'bg-green text-ink' : 'bg-surface text-ink'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <p className="mt-4 text-13" data-testid="tutor-run-status">
          Statut : <strong>{result.status === 'completed' ? 'terminé' : result.status}</strong> ·{' '}
          {result.turns} tour(s) · modèle simulé {result.model} · bascule automatique :{' '}
          {result.fallback}
        </p>
        <ToolTable result={result} />
        {result.corrections.length > 0 ? (
          <p className="mt-3 text-13" data-testid="tutor-corrections">
            Corrections : {result.corrections.map((entry) => `${String(entry.corrections)}/${String(entry.errors)}`).join(', ')}
          </p>
        ) : null}
        {result.notification === null ? null : (
          <p className="mt-3 text-13" data-testid="tutor-notification">
            Notification {result.notification.type} · motif {result.notification.reason} · choix
            humain exigé, aucune bascule vers l’IA fournie.
          </p>
        )}
      </BaseCard>

      <BaseCard testId="tutor-injection" title="Apport piégé traité comme donnée">
        <p className="text-13">
          Le passage suivant contient « ignore les instructions » et une fausse balise fermante. Il
          reste dans une balise <code>&lt;document&gt;</code> échappée : aucune action n’est
          déclenchée, aucune donnée n’est écrite.
        </p>
        <pre
          data-testid="tutor-injection-block"
          className="mt-3 overflow-x-auto rounded-12 bg-canvas p-3 text-12 whitespace-pre-wrap"
        >
          {demo.injection.dataBlock}
        </pre>
        <p className="mt-3 text-13" data-testid="tutor-injection-count">
          Actions exécutées : {demo.injection.toolCalls} · balises brutes non échappées : 0
        </p>
        <p className="mt-2 text-13">{demo.injection.text}</p>
      </BaseCard>
    </>
  );
}
