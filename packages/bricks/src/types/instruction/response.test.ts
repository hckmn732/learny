import { describe, expect, it } from 'vitest';

import { parseInstructionResponse } from './response';
import type { InstructionProduction } from './schema';

const table: InstructionProduction = {
  kind: 'table',
  fields: [],
  columns: [{ key: 'montant', label: 'Montant', type: 'number' }],
  minRows: 2,
  maxRows: 3,
  initialRows: 2,
  checks: [],
};

describe('[SPEC-502] schémas de réponse d’une consigne', () => {
  it('accepte un tableau dans les bornes de lignes', () => {
    const parsed = parseInstructionResponse(table, {
      fields: { libelle: 'Pièce' },
      rows: [{ montant: '120' }, { montant: '120' }],
    });
    expect(parsed.ok).toBe(true);
  });

  it('refuse un tableau hors bornes', () => {
    for (const rows of [[{ montant: '120' }], [{}, {}, {}, {}]]) {
      const parsed = parseInstructionResponse(table, { fields: {}, rows });
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.error.code).toBe('RESPONSE_INVALID');
    }
  });

  it('refuse un tableau mal formé', () => {
    const parsed = parseInstructionResponse(table, { rows: 'deux' });
    expect(parsed.ok).toBe(false);
  });

  it('valide les bornes d’une production texte', () => {
    const text: InstructionProduction = { kind: 'text', minChars: 10, maxChars: 50 };
    expect(parseInstructionResponse(text, { text: 'Une réponse assez longue.' }).ok).toBe(true);
    expect(parseInstructionResponse(text, { text: 'Court' }).ok).toBe(false);
    expect(parseInstructionResponse(text, { text: 'x'.repeat(51) }).ok).toBe(false);
  });

  it('accepte une explication facultative de 2 000 caractères au plus', () => {
    const text: InstructionProduction = { kind: 'text', minChars: 0, maxChars: 50 };
    expect(parseInstructionResponse(text, { text: 'ok', explanation: 'Parce que.' }).ok).toBe(true);
    expect(parseInstructionResponse(text, { text: 'ok', explanation: 'x'.repeat(2001) }).ok).toBe(
      false,
    );
  });

  it('exige un identifiant de ressource pour une production fichier', () => {
    const file: InstructionProduction = {
      kind: 'file',
      accept: ['application/pdf'],
      maxSizeMb: 10,
    };
    expect(
      parseInstructionResponse(file, {
        resourceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      }).ok,
    ).toBe(true);
    expect(parseInstructionResponse(file, { resourceId: 'fichier.pdf' }).ok).toBe(false);
  });

  it('n’accepte qu’un lien HTTPS', () => {
    const link: InstructionProduction = { kind: 'link' };
    expect(parseInstructionResponse(link, { url: 'https://example.com/production' }).ok).toBe(true);
    expect(parseInstructionResponse(link, { url: 'http://example.com/production' }).ok).toBe(false);
    expect(parseInstructionResponse(link, { url: 'javascript:alert(1)' }).ok).toBe(false);
  });
});
