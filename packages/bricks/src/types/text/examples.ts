// Reference examples of the `text` type: one valid insertion and one invalid one with raw HTML.
import type { BrickExample } from '../../payloads';

import type { TextPayload } from './schema';

export const textExample: BrickExample<'text'> = {
  valid: {
    title: 'La comptabilité générale',
    bodyMd:
      'La comptabilité générale enregistre les flux de l’entreprise. **À retenir** : chaque écriture respecte le principe de la partie double.',
    sources: [],
  },
  invalid: {
    title: 'La comptabilité générale',
    bodyMd: 'Un paragraphe <strong>en gras</strong> inséré comme HTML brut.',
    sources: [],
  },
  invalidCode: 'HTML_NOT_ALLOWED',
};

export type TextExamplePayload = TextPayload;
