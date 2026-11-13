import { runSchemaSuite } from '../../../test/suite';

runSchemaSuite('recall_card', [
  { name: 'recto de 2 caractères', make: (p) => ({ ...p, front: 'ok' }) },
  { name: 'recto de 301 caractères', make: (p) => ({ ...p, front: 'x'.repeat(301) }) },
  { name: 'verso vide', make: (p) => ({ ...p, back: '' }) },
  { name: 'verso de 601 caractères', make: (p) => ({ ...p, back: 'x'.repeat(601) }) },
  { name: 'source vide', make: (p) => ({ ...p, sourceLabel: '' }) },
  { name: 'source de 121 caractères', make: (p) => ({ ...p, sourceLabel: 'x'.repeat(121) }) },
  {
    name: 'moyen mnémotechnique de 201 caractères',
    make: (p) => ({ ...p, mnemonic: 'x'.repeat(201) }),
  },
]);
