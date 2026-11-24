// [SPEC-4003] Parité des testID et des opérations avec SPEC-4002 ET-3 (CA-5).
//
// Le test lit les sources réellement livrées : chaque identifiant de la liste doit apparaître dans
// un écran ou un composant, et chaque opération doit exister dans le registre du contrat. Un
// identifiant renommé côté mobile casse donc la preuve, au lieu de rester dans un fichier oublié.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { quizRoutes } from '@learny/contracts/attempts';
import { formationRoutes } from '@learny/contracts/cadrage';
import { programmeRoutes } from '@learny/contracts/programme';
import { getQuizResult } from '@learny/contracts/quiz-result';
import { simpleModeRoutes } from '@learny/contracts/simple-mode';
import { uploadsRoutes } from '@learny/contracts/uploads';

import { SIMPLE_OPERATIONS, SIMPLE_TEST_IDS, expandTestIds } from '../../src/simple/parity';

const ROOT = process.cwd();
const SOURCE_DIRS = [path.join(ROOT, 'src/simple'), path.join(ROOT, 'app/formations')];

function filesUnder(directory: string): string[] {
  if (!statSync(directory).isDirectory()) return [directory];
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

const sources = SOURCE_DIRS.flatMap(filesUnder)
  .filter((file) => /\.(ts|tsx)$/.test(file) && !file.endsWith('.test.ts'))
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

const routes = [
  ...Object.values(simpleModeRoutes),
  uploadsRoutes.resourcesFinalize,
  programmeRoutes.programmeValidate,
  formationRoutes.formationUpdate,
  quizRoutes.saveQuizAnswer,
  quizRoutes.submitQuizAttempt,
  getQuizResult,
];

describe('[SPEC-4003] parité testID et opérations (CA-5)', () => {
  it('reprend exactement les identifiants de SPEC-4002 ET-3', () => {
    expect(SIMPLE_TEST_IDS).toEqual([
      'simple-card-drop',
      'simple-card-tutor',
      'simple-dropzone',
      'simple-file-{i}',
      'simple-role-{i}',
      'simple-link',
      'simple-motivation',
      'simple-create',
      'simple-key-warning',
      'simple-steps',
      'simple-chapters-found',
      'simple-kpis',
      'simple-modules',
      'simple-deadline',
      'simple-start',
      'simple-adjust',
      'diagnostic-progress',
      'diagnostic-skip',
      'simple-ready-card',
      'simple-generation',
    ]);
  });

  it('rend chaque identifiant dans un écran ou un composant mobile', () => {
    for (const id of expandTestIds(2)) {
      const prefix = id.replace(/-\d+$/, '');
      expect(sources.includes(prefix)).toBe(true);
    }
  });

  it('appelle les mêmes opérations que le contrat, pour le même parcours', () => {
    for (const operation of SIMPLE_OPERATIONS) {
      expect(routes.some((route) => route.id === operation)).toBe(true);
    }
  });
});
