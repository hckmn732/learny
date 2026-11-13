import { runSchemaSuite } from '../../../test/suite';

runSchemaSuite('categorization', [
  { name: 'consigne de 2 caractères', make: (p) => ({ ...p, instruction: 'ok' }) },
  { name: 'consigne de 301 caractères', make: (p) => ({ ...p, instruction: 'x'.repeat(301) }) },
  { name: 'une seule catégorie', make: (p) => ({ ...p, categories: p.categories.slice(0, 1) }) },
  {
    name: 'cinq catégories',
    make: (p) => ({
      ...p,
      categories: Array.from({ length: 5 }, (_, index) => ({
        id: `c${String(index)}`,
        label: 'Catégorie',
        notionId: null,
      })),
    }),
  },
  {
    name: 'libellé de catégorie vide',
    make: (p) => ({
      ...p,
      categories: p.categories.map((category, i) =>
        i === 0 ? { ...category, label: '' } : category,
      ),
    }),
  },
  { name: 'trois items', make: (p) => ({ ...p, items: p.items.slice(0, 3) }) },
  {
    name: 'treize items',
    make: (p) => ({
      ...p,
      items: Array.from({ length: 13 }, (_, index) => ({
        id: `i${String(index)}`,
        text: 'Item',
        categoryId: 'actif',
      })),
    }),
  },
  {
    name: 'texte d’item vide',
    make: (p) => ({
      ...p,
      items: p.items.map((item, i) => (i === 0 ? { ...item, text: '' } : item)),
    }),
  },
  {
    name: 'texte d’item de 121 caractères',
    make: (p) => ({
      ...p,
      items: p.items.map((item, i) => (i === 0 ? { ...item, text: 'x'.repeat(121) } : item)),
    }),
  },
  { name: 'explication de 9 caractères', make: (p) => ({ ...p, explanation: 'x'.repeat(9) }) },
]);
