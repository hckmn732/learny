import { runSchemaSuite } from '../../../test/suite';

runSchemaSuite('instruction', [
  { name: 'titre de 2 caractères', make: (p) => ({ ...p, title: 'ok' }) },
  { name: 'titre de 121 caractères', make: (p) => ({ ...p, title: 'x'.repeat(121) }) },
  { name: 'consigne de 9 caractères', make: (p) => ({ ...p, taskMd: 'x'.repeat(9) }) },
  { name: 'consigne de 4 001 caractères', make: (p) => ({ ...p, taskMd: 'x'.repeat(4001) }) },
  { name: 'neuf données', make: (p) => ({ ...p, data: Array.from({ length: 9 }, () => 'xx') }) },
  { name: 'donnée vide', make: (p) => ({ ...p, data: [''] }) },
  { name: 'donnée de 81 caractères', make: (p) => ({ ...p, data: ['x'.repeat(81)] }) },
  { name: 'livrable de 2 caractères', make: (p) => ({ ...p, deliverable: 'ok' }) },
  { name: 'question d’explication vide', make: (p) => ({ ...p, explanationPrompt: '' }) },
  { name: 'trois indices', make: (p) => ({ ...p, hints: ['xxxxx', 'xxxxx', 'xxxxx'] }) },
  { name: 'indice de 4 caractères', make: (p) => ({ ...p, hints: ['xxxx'] }) },
  { name: 'indice de 401 caractères', make: (p) => ({ ...p, hints: ['x'.repeat(401)] }) },
  { name: 'aucun critère', make: (p) => ({ ...p, criteria: [] }) },
  {
    name: 'neuf critères',
    make: (p) => ({
      ...p,
      criteria: Array.from({ length: 9 }, (_, index) => ({
        key: `c${String(index)}`,
        label: 'Critère',
        points: 1,
        description: 'xx',
      })),
    }),
  },
  {
    name: 'description de critère de 1 caractère',
    make: (p) => ({
      ...p,
      criteria: p.criteria.map((c, i) => (i === 0 ? { ...c, description: 'x' } : c)),
    }),
  },
  {
    name: 'critère à 11 points',
    make: (p) => ({
      ...p,
      criteria: p.criteria.map((c, i) => (i === 0 ? { ...c, points: 11 } : c)),
    }),
  },
  { name: 'estimation de 4 minutes', make: (p) => ({ ...p, estimatedMinutes: 4 }) },
  { name: 'estimation de 121 minutes', make: (p) => ({ ...p, estimatedMinutes: 121 }) },
  { name: 'seuil de réussite nul', make: (p) => ({ ...p, passPoints: 0 }) },
  {
    name: 'production texte de 49 caractères',
    make: (p) => ({ ...p, production: { kind: 'text', maxChars: 49 } }),
  },
  {
    name: 'production texte incohérente',
    make: (p) => ({ ...p, production: { kind: 'text', minChars: 200, maxChars: 100 } }),
  },
  {
    name: 'production fichier sans type',
    make: (p) => ({ ...p, production: { kind: 'file', accept: [], maxSizeMb: 10 } }),
  },
  {
    name: 'production fichier de 51 Mo',
    make: (p) => ({
      ...p,
      production: { kind: 'file', accept: ['application/pdf'], maxSizeMb: 51 },
    }),
  },
  {
    name: 'production tableau sans colonne',
    make: (p) => ({
      ...p,
      production: { kind: 'table', columns: [], minRows: 1, maxRows: 2, initialRows: 1 },
    }),
  },
  {
    name: 'production tableau à 9 colonnes',
    make: (p) => ({
      ...p,
      production: {
        kind: 'table',
        columns: Array.from({ length: 9 }, (_, index) => ({
          key: `c${String(index)}`,
          label: 'Colonne',
          type: 'text',
        })),
        minRows: 1,
        maxRows: 2,
        initialRows: 1,
      },
    }),
  },
  {
    name: 'production tableau avec 5 champs d’en-tête',
    make: (p) => ({
      ...p,
      production: {
        kind: 'table',
        fields: Array.from({ length: 5 }, (_, index) => ({
          key: `f${String(index)}`,
          label: 'Champ',
          type: 'text',
        })),
        columns: [{ key: 'c', label: 'Colonne', type: 'text' }],
        minRows: 1,
        maxRows: 2,
        initialRows: 1,
      },
    }),
  },
  {
    name: 'production tableau avec lignes incohérentes',
    make: (p) => ({
      ...p,
      production: {
        kind: 'table',
        columns: [{ key: 'c', label: 'Colonne', type: 'text' }],
        minRows: 5,
        maxRows: 4,
        initialRows: 5,
      },
    }),
  },
  {
    name: 'colonne select à 21 options',
    make: (p) => ({
      ...p,
      production: {
        kind: 'table',
        columns: [
          {
            key: 'c',
            label: 'Colonne',
            type: 'select',
            options: Array.from({ length: 21 }, (_, index) => ({
              value: `v${String(index)}`,
              label: 'Option',
            })),
          },
        ],
        minRows: 1,
        maxRows: 2,
        initialRows: 1,
      },
    }),
  },
  {
    name: 'valeur d’option vide',
    make: (p) => ({
      ...p,
      production: {
        kind: 'table',
        columns: [
          { key: 'c', label: 'Colonne', type: 'select', options: [{ value: '', label: 'Option' }] },
        ],
        minRows: 1,
        maxRows: 2,
        initialRows: 1,
      },
    }),
  },
]);
