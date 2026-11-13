// Demonstration of SPEC-504: real resolution on three isolated accounts and the six simulated
// scenarios. The preview is built by the pure Anthropic contract used by the provider wrapper.
import { AI_TASKS, DEFAULT_MODEL_BY_TASK, type AiTask } from '@learny/config';
import { buildAnthropicRequestPreview } from '@learny/llm';

import { loadResolutionDemo } from '../../app/%5Fdev/sdd/spec-504-data';
import { BaseCard, BaseTokenStyle } from '../sdd/base-tokens';

import { Spec504Form } from './spec-504-client';

function previews(): Record<AiTask, unknown> {
  return Object.fromEntries(
    AI_TASKS.map((task) => [
      task,
      buildAnthropicRequestPreview({
        task,
        modelId: DEFAULT_MODEL_BY_TASK[task],
        managed: true,
        system: [
          { text: 'Consigne système stable de la tâche.', cache: true },
          { text: 'Question courante.', cache: false },
        ],
      }),
    ]),
  ) as Record<AiTask, unknown>;
}

export default async function Spec504Demo() {
  const resolution = await loadResolutionDemo();
  return (
    <>
      <BaseTokenStyle />
      <BaseCard testId="llm-resolution" title="Résolution">
        <div
          role="region"
          aria-label="Résolution par utilisateur et par tâche"
          tabIndex={0}
          className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <table className="w-full min-w-[52rem] text-left text-13">
            <thead>
              <tr>
                <th scope="col" className="px-3 py-2">
                  Utilisateur
                </th>
                {AI_TASKS.map((task) => (
                  <th key={task} scope="col" className="px-3 py-2">
                    {task}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resolution.map((row) => (
                <tr key={row.key} data-testid="llm-resolution-row" className="border-t border-border">
                  <th scope="row" className="px-3 py-2 font-semibold">
                    {row.label}
                  </th>
                  {row.cells.map((cell) => (
                    <td
                      key={cell.task}
                      data-testid={`llm-resolution-${row.key}-${cell.task}`}
                      className="px-3 py-2 font-mono"
                    >
                      {cell.model}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </BaseCard>
      <Spec504Form previews={previews()} />
    </>
  );
}
