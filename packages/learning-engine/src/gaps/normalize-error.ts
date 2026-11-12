// Normalisation of an open answer used to recognise the same error twice (SPEC-404 EF-2,
// ADR-0024): lower case, accents removed, superfluous spaces collapsed. The function is pure and
// deterministic; no locale-dependent case folding is involved.
import { EngineError } from '../errors';

/**
 * EF-2 — normalised form of an open answer: NFKD decomposition, combining marks removed, lower
 * case, any whitespace run replaced by one space and the edges trimmed. Two answers written with
 * different accents, case or spacing therefore produce the same key.
 */
export function normalizeError(value: string): string {
  if (typeof value !== 'string') {
    throw new EngineError('INVALID_INPUT', 'Une réponse à normaliser doit être une chaîne.', {
      path: 'response',
    });
  }
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/\s+/gu, ' ')
    .trim();
}
