'use server';

// Server actions of the SPEC-504 demonstration (ADR-0049). They only create isolated demo
// accounts; the product code never calls them.
import { isAiTask } from '@learny/config';

import { runMockCall, type MockCallState } from './spec-504-data';

const SCENARIOS = new Set([
  'demo',
  'demo-tool-call',
  'demo-refusal',
  'demo-timeout',
  'demo-object',
  'demo-invalid-object',
]);

export interface ActionState {
  status: 'idle' | 'done';
  call: MockCallState | null;
}

export async function callScenario(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const rawTask = formData.get('task');
  const rawScenario = formData.get('scenario');
  const task = typeof rawTask === 'string' ? rawTask : 'tutor';
  const scenario = typeof rawScenario === 'string' ? rawScenario : 'demo';
  if (!isAiTask(task) || !SCENARIOS.has(scenario)) {
    return { status: 'done', call: null };
  }
  return { status: 'done', call: await runMockCall({ task, scenario }) };
}
