import { runSchemaSuite } from '../../../test/suite';

runSchemaSuite('text', [
  { name: 'titre vide', make: (p) => ({ ...p, title: '' }) },
  { name: 'titre de 121 caractères', make: (p) => ({ ...p, title: 'x'.repeat(121) }) },
  { name: 'corps vide', make: (p) => ({ ...p, bodyMd: '' }) },
  { name: 'corps de 20 001 caractères', make: (p) => ({ ...p, bodyMd: 'x'.repeat(20001) }) },
  { name: 'champ inconnu', make: (p) => ({ ...p, hint: 'inconnu' }) },
]);
