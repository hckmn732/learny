// [SPEC-4003] Réception d'un partage : URI de document et schéma interne.
import { describe, expect, it } from 'vitest';

import { simpleMimeOf } from './mime';
import { parseSharedUri } from './share';

describe('[SPEC-4003] réception d’un partage', () => {
  it('accepte un PDF partagé par son URI de contenu', () => {
    const shared = parseSharedUri('content://com.android.providers.downloads/1234/Cours.pdf');
    expect(shared?.name).toBe('Cours.pdf');
    expect(shared?.mime).toBe('application/pdf');
  });

  it('accepte une image et un DOCX', () => {
    expect(parseSharedUri('file:///tmp/Inbox/page.png')?.mime).toBe('image/png');
    expect(parseSharedUri('content://downloads/Annales.docx')?.mime).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('lit le schéma interne du pont de partage', () => {
    const shared = parseSharedUri(
      'learny://partage?uri=content%3A%2F%2Fdownloads%2FManuel.pdf&name=Manuel.pdf&type=application%2Fpdf&size=2048',
    );
    expect(shared).toEqual({
      uri: 'content://downloads/Manuel.pdf',
      name: 'Manuel.pdf',
      mime: 'application/pdf',
      sizeBytes: 2048,
    });
  });

  it('refuse un type non pris en charge et une URL vide', () => {
    expect(parseSharedUri('content://downloads/virus.exe')).toBeNull();
    expect(parseSharedUri('')).toBeNull();
    expect(parseSharedUri(null)).toBeNull();
    expect(simpleMimeOf('cours.md')).toBe('text/markdown');
  });
});
