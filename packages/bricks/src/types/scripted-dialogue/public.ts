// Public payload of a scripted dialogue (ET-7): the exact fields scripted by the specification;
// end condition and grading criteria stay server-side.
import type { ScriptedDialoguePayload } from './schema';

export interface ScriptedDialoguePublic {
  role: string;
  context: string;
  learnerGoal: string;
  openingLine: string;
  maxTurns: number;
}

export function scriptedDialoguePublic(payload: ScriptedDialoguePayload): ScriptedDialoguePublic {
  return {
    role: payload.role,
    context: payload.context,
    learnerGoal: payload.learnerGoal,
    openingLine: payload.openingLine,
    maxTurns: payload.maxTurns,
  };
}
