// Reference examples of the `scripted_dialogue` type. The invalid one totals 27 criteria points.
import type { BrickExample } from '../../payloads';

import type { ScriptedDialoguePayload } from './schema';

export const scriptedDialogueExample: BrickExample<'scripted_dialogue'> = {
  valid: {
    role: 'Contrôleur de gestion',
    context:
      'Vous êtes le contrôleur de gestion d’une PME. L’apprenant vous présente son analyse des écarts de marge.',
    learnerGoal: 'Expliquer l’écart de marge en distinguant l’effet prix de l’effet volume.',
    endCondition:
      'L’apprenant a distingué les deux effets et proposé une action corrective chiffrée.',
    openingLine: 'Bonjour, la marge a baissé de deux points ce trimestre. Par où commençons-nous ?',
    maxTurns: 12,
    criteria: [
      { key: 'distinction', label: 'Distinction prix / volume', points: 5, description: '' },
      { key: 'action', label: 'Action corrective', points: 5, description: '' },
    ],
    sources: [],
  },
  invalid: {
    role: 'Contrôleur de gestion',
    context:
      'Vous êtes le contrôleur de gestion d’une PME. L’apprenant vous présente son analyse des écarts de marge.',
    learnerGoal: 'Expliquer l’écart de marge en distinguant l’effet prix de l’effet volume.',
    endCondition:
      'L’apprenant a distingué les deux effets et proposé une action corrective chiffrée.',
    openingLine: 'Bonjour, la marge a baissé de deux points ce trimestre. Par où commençons-nous ?',
    maxTurns: 12,
    criteria: [
      { key: 'a', label: 'Critère A', points: 9, description: '' },
      { key: 'b', label: 'Critère B', points: 9, description: '' },
      { key: 'c', label: 'Critère C', points: 9, description: '' },
    ],
    sources: [],
  },
  invalidCode: 'CRITERIA_POINTS_MISMATCH',
};

export type ScriptedDialogueExamplePayload = ScriptedDialoguePayload;
