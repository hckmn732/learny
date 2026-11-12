import { describe, expect, it } from 'vitest';

import {
  SEARCH_TOO_LONG_MESSAGE,
  SEARCH_TOO_SHORT_MESSAGE,
  SearchQuery,
  SearchResponse,
} from '@learny/contracts';
import { clock } from '@learny/core';
import { createLogCapture, createLogger } from '@learny/core/server';

import type { ServiceContext } from '../context';

import { ELLIPSIS, buildSnippet, computeHighlights, toPlainText, toPlainTitle } from './highlight';
import { fold, normalizeQuery, queryTerms } from './normalize';

import { searchUserContent } from './index';

/** The text covered by every highlight, in order. */
function covered(text: string, ranges: { start: number; end: number }[]): string[] {
  return ranges.map((range) => text.slice(range.start, range.end));
}

describe('[SPEC-212] normalisation et surlignage', () => {
  describe('normalisation de la requête (EF-1, CA-1)', () => {
    it('applique NFKC, réduit les espaces et rogne', () => {
      expect(normalizeQuery('  Ｒéseau \t\n  ﬁbre  ')).toBe('Réseau fibre');
      expect(normalizeQuery('réseau')).toBe('réseau');
      expect(normalizeQuery('   ')).toBe('');
    });

    it('refuse une requête de moins de 2 caractères normalisés', () => {
      for (const q of ['', 'a', '  a  ', '\n\t', '  ']) {
        const parsed = SearchQuery.safeParse({ q });
        expect(parsed.success, JSON.stringify(q)).toBe(false);
        expect(parsed.error?.issues[0]?.message).toBe(SEARCH_TOO_SHORT_MESSAGE);
      }
      expect(SEARCH_TOO_SHORT_MESSAGE).toBe('Saisissez au moins 2 caractères.');
    });

    it('accepte exactement 2 et 100 caractères, refuse 101 après normalisation (CL-9)', () => {
      expect(SearchQuery.safeParse({ q: 'ab' }).data?.q).toBe('ab');
      expect(SearchQuery.safeParse({ q: ' a b ' }).data?.q).toBe('a b');
      expect(SearchQuery.safeParse({ q: 'x'.repeat(100) }).success).toBe(true);
      const tooLong = SearchQuery.safeParse({ q: 'x'.repeat(101) });
      expect(tooLong.success).toBe(false);
      expect(tooLong.error?.issues[0]?.message).toBe(SEARCH_TOO_LONG_MESSAGE);
      expect(SEARCH_TOO_LONG_MESSAGE).toBe('Recherche limitée à 100 caractères.');
      // The bound counts the normalized text: the blanks around and between words are reduced.
      expect(SearchQuery.safeParse({ q: `${'x'.repeat(98)}${' '.repeat(40)}yy` }).success).toBe(
        false,
      );
      expect(SearchQuery.safeParse({ q: `  ${'x'.repeat(100)}  ` }).success).toBe(true);
    });

    it('compte les points de code : un emoji vaut un caractère', () => {
      expect(SearchQuery.safeParse({ q: '🌍' }).success).toBe(false);
      expect(SearchQuery.safeParse({ q: '🌍🌍' }).success).toBe(true);
      expect(SearchQuery.safeParse({ q: '🌍'.repeat(100) }).success).toBe(true);
      expect(SearchQuery.safeParse({ q: '🌍'.repeat(101) }).success).toBe(false);
    });

    it('limite par groupe : 5 par défaut, de 1 à 20', () => {
      expect(SearchQuery.parse({ q: 'ab' }).limit).toBe(5);
      expect(SearchQuery.parse({ q: 'ab', limit: '20' }).limit).toBe(20);
      expect(SearchQuery.parse({ q: 'ab', limit: '1' }).limit).toBe(1);
      for (const limit of ['0', '21', '-1', '1.5', 'abc', '']) {
        expect(SearchQuery.safeParse({ q: 'ab', limit }).success, limit).toBe(false);
      }
    });

    it('refuse sans appel SQL une requête hors bornes (CL-1)', async () => {
      let sqlCalls = 0;
      const capture = createLogCapture();
      const ctx: ServiceContext = {
        userId: '00000000-0000-4000-8000-000000000001',
        requestId: 'req-test',
        db: {
          run() {
            sqlCalls += 1;
            return Promise.reject(new Error('aucune requête SQL attendue'));
          },
        },
        clock,
        logger: createLogger({ clock, destination: capture.destination }),
      };
      for (const q of ['a', '  a  ', 'x'.repeat(101)]) {
        const result = await searchUserContent(ctx, { q });
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).toBe('VALIDATION_FAILED');
          expect(result.error.errors?.[0]?.path).toBe('query.q');
        }
      }
      expect((await searchUserContent(ctx, { q: 'ab', limit: 21 })).ok).toBe(false);
      expect(sqlCalls).toBe(0);
      // The text of the refused query is never written to the logs (ET-5).
      expect(capture.text()).not.toContain('xxxxxxxx');
    });
  });

  describe('repli des accents et de la casse (EF-4, CA-2)', () => {
    it('replie les accents, les cédilles et la casse', () => {
      expect(fold('Réseau')).toBe('reseau');
      expect(fold('RÉSEAU')).toBe('reseau');
      expect(fold('Où ÇA se passe à Noël ?')).toBe('ou ca se passe a noel ?');
      expect(fold('réseau')).toBe('reseau');
      expect(fold('')).toBe('');
    });

    it('est insensible à la forme de normalisation Unicode', () => {
      expect(fold('é')).toBe(fold('é'));
      expect(fold('Å')).toBe('a');
    });

    it('ne garde que les mots utiles de la requête', () => {
      expect(queryTerms('Réseau')).toEqual(['reseau']);
      expect(queryTerms('  réseau   RÉSEAU ')).toEqual(['reseau']);
      expect(queryTerms('réseau a')).toEqual(['reseau']);
      expect(queryTerms('a b')).toEqual(['a', 'b']);
      expect(queryTerms('')).toEqual([]);
    });
  });

  describe('positions de surlignage (EF-4, CL-2, CL-8, CA-4)', () => {
    it('trouve chaque occurrence sans tenir compte de la casse ni des accents', () => {
      const text = 'Le réseau, les RESEAUX et un Réseau local.';
      const ranges = computeHighlights(text, 'reseau');
      expect(covered(text, ranges)).toEqual(['réseau', 'RESEAU', 'Réseau']);
      expect(ranges).toEqual([
        { start: 3, end: 9 },
        { start: 15, end: 21 },
        { start: 29, end: 35 },
      ]);
    });

    it('donne les mêmes positions relatives pour Réseau, reseau et RESEAU (CL-2)', () => {
      const text = 'Le réseau local relie le réseau distant.';
      const expected = computeHighlights(text, 'reseau');
      expect(expected).toHaveLength(2);
      expect(computeHighlights(text, 'Réseau')).toEqual(expected);
      expect(computeHighlights(text, 'RESEAU')).toEqual(expected);
      expect(computeHighlights(text, '  réséau ')).toEqual(expected);
    });

    it('garde les positions du texte original avec des caractères décomposés ou combinants', () => {
      const decomposed = 'Un réseau de Noël';
      // Positions are those of the NFC text: « Un réseau de Noël ».
      const ranges = computeHighlights(decomposed, 'reseau');
      expect(covered(decomposed.normalize('NFC'), ranges)).toEqual(['réseau']);
      expect(ranges).toEqual([{ start: 3, end: 9 }]);
      // A mark that does not compose stays attached to its letter.
      const stacked = 'x́y réseau';
      expect(covered(stacked, computeHighlights(stacked, 'x'))).toEqual(['x́']);
      expect(computeHighlights('un x́ seul', 'xy')).toEqual([]);
    });

    it('fusionne les plages qui se touchent ou se recouvrent', () => {
      expect(computeHighlights('reseaureseau', 'reseau')).toEqual([{ start: 0, end: 12 }]);
      expect(computeHighlights('aabb ab', 'aab ab bb')).toEqual([
        { start: 0, end: 4 },
        { start: 5, end: 7 },
      ]);
    });

    it('surligne chaque mot de la requête', () => {
      const text = 'Le plan de trésorerie suit le budget de trésorerie.';
      expect(covered(text, computeHighlights(text, 'budget tresorerie'))).toEqual([
        'trésorerie',
        'budget',
        'trésorerie',
      ]);
    });

    it('ne coupe jamais une paire de substitution ni une séquence combinante (CL-8)', () => {
      const text = 'Voyage 🌍🌍 en 🌍 réseau';
      const earth = computeHighlights(text, '🌍🌍');
      expect(earth).toEqual([{ start: 7, end: 11 }]);
      expect(covered(text, earth)).toEqual(['🌍🌍']);
      for (const range of computeHighlights(text, '🌍')) {
        const piece = text.slice(range.start, range.end);
        expect(Array.from(piece).every((char) => char === '🌍')).toBe(true);
      }
      const combining = 'café ́seul';
      expect(() => computeHighlights(combining, '́́')).not.toThrow();
      expect(() => computeHighlights('🌍', '\ud83c')).not.toThrow();
    });

    it('renvoie des plages valides : croissantes, non vides, dans le texte', () => {
      const text = 'Réseaux, réseau, RÉSEAU et ressources du réseau.';
      const ranges = computeHighlights(text, 'réseau');
      let previous = -1;
      for (const range of ranges) {
        expect(range.start).toBeGreaterThan(previous);
        expect(range.end).toBeGreaterThan(range.start);
        expect(range.end).toBeLessThanOrEqual(text.length);
        previous = range.end;
      }
    });

    it('ne trouve rien si la requête ne figure pas dans le texte', () => {
      expect(computeHighlights('Le trésor', 'reseau')).toEqual([]);
      expect(computeHighlights('', 'reseau')).toEqual([]);
      expect(computeHighlights('Le réseau', '  ')).toEqual([]);
    });
  });

  describe('nettoyage des extraits (ET-4, CA-4)', () => {
    it('retire les balises, les scripts, les commentaires et les entités', () => {
      expect(toPlainText("<script>alert('x')</script>Le <b>réseau</b> est <i>sûr</i>.")).toBe(
        'Le réseau est sûr.',
      );
      expect(toPlainText('A<!-- caché -->B&nbsp;C&#39;D&amp;E')).toBe('A B C D E');
      expect(toPlainText('<style>p{color:red}</style><p>Texte</p>')).toBe('Texte');
      expect(toPlainText('<img src=x onerror=alert(1)>Texte')).toBe('Texte');
    });

    it('aplatit le Markdown : titres, emphase, listes, citations, liens, code, tableaux', () => {
      const markdown = [
        '# Le réseau',
        '',
        'Un **réseau** relie des *machines* et des __nœuds__ avec `ping`.',
        '',
        '- premier point',
        '1. second point',
        '> citation importante',
        '',
        '[la documentation](https://example.test/doc) et ![schéma](img.png)',
        '',
        '| a | b |',
        '|---|---|',
        '| 1 | 2 |',
        '',
        '```ts',
        'const x = 1',
        '```',
      ].join('\n');
      const plain = toPlainText(markdown);
      expect(plain).toBe(
        'Le réseau Un réseau relie des machines et des nœuds avec ping. premier point second point citation importante la documentation et schéma a b 1 2 const x = 1',
      );
      expect(plain).not.toMatch(/[*_`#>|[\]]/);
      expect(plain).not.toContain('https://');
    });

    it('conserve les identifiants avec soulignés et les chiffres de liste dans une phrase', () => {
      expect(toPlainText('La variable snake_case_name vaut 2.5 et 3) fin')).toBe(
        'La variable snake_case_name vaut 2.5 et 3) fin',
      );
    });

    it('ne laisse sortir aucun chevron, même isolé (CA-4)', () => {
      for (const source of [
        'a < b et c > d',
        '<<script>alert(1)//<</script>',
        '<a href="x">lien</a> <b',
        '1 <2 et 3> 2',
        '&lt;script&gt;alert(1)&lt;/script&gt;',
        '<![CDATA[x]]> <?php echo 1 ?>',
      ]) {
        const plain = toPlainText(source);
        expect(plain, source).not.toContain('<');
        expect(plain, source).not.toContain('>');
        expect(buildSnippet(source, 'alert').snippet, source).not.toMatch(/[<>]/);
      }
    });

    it('nettoie un titre sans toucher à sa ponctuation', () => {
      expect(toPlainTitle('C++ & Rust <b>*args*</b>')).toBe('C++ & Rust *args*');
      expect(toPlainTitle(null)).toBe('');
    });
  });

  describe('extraits de 160 caractères au plus (EF-4, CL-7, CA-4)', () => {
    const filler = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor ';

    it('garde un texte court tel quel et surligne la requête', () => {
      const { snippet, highlights } = buildSnippet('Le **réseau** relie les machines.', 'reseau');
      expect(snippet).toBe('Le réseau relie les machines.');
      expect(covered(snippet, highlights)).toEqual(['réseau']);
    });

    it('coupe à 160 caractères avec une ellipse finale quand la correspondance est au début', () => {
      const text = `Le réseau ${filler.repeat(10)}`;
      const { snippet, highlights } = buildSnippet(text, 'reseau');
      expect(snippet.length).toBeLessThanOrEqual(160);
      expect(snippet.startsWith('Le réseau')).toBe(true);
      expect(snippet.endsWith(ELLIPSIS)).toBe(true);
      expect(snippet.startsWith(ELLIPSIS)).toBe(false);
      expect(covered(snippet, highlights)).toEqual(['réseau']);
    });

    it('recentre l’extrait sur une correspondance au-delà du 160ᵉ caractère (CL-7)', () => {
      const text = `${filler.repeat(8)}Le réseau local est ici. ${filler.repeat(8)}`;
      expect(text.indexOf('réseau')).toBeGreaterThan(160);
      const { snippet, highlights } = buildSnippet(text, 'RESEAU');
      expect(snippet.length).toBeLessThanOrEqual(160);
      expect(snippet.startsWith(ELLIPSIS)).toBe(true);
      expect(snippet.endsWith(ELLIPSIS)).toBe(true);
      expect(covered(snippet, highlights)).toEqual(['réseau']);
      // Centred: the match sits about in the middle of the snippet.
      const middle = (highlights[0]?.start ?? 0) / snippet.length;
      expect(middle).toBeGreaterThan(0.3);
      expect(middle).toBeLessThan(0.7);
    });

    it('met l’ellipse seulement au début quand la correspondance est en fin de texte', () => {
      const text = `${filler.repeat(10)}se termine par le réseau`;
      const { snippet, highlights } = buildSnippet(text, 'reseau');
      expect(snippet.length).toBeLessThanOrEqual(160);
      expect(snippet.startsWith(ELLIPSIS)).toBe(true);
      expect(snippet.endsWith(ELLIPSIS)).toBe(false);
      expect(snippet.endsWith('le réseau')).toBe(true);
      expect(covered(snippet, highlights)).toEqual(['réseau']);
    });

    it('coupe aux frontières de mots quand elles sont proches', () => {
      const text = `${filler.repeat(8)}réseau ${filler.repeat(8)}`;
      const { snippet } = buildSnippet(text, 'reseau');
      const body = snippet.slice(1, -1);
      for (const word of body.split(' ')) {
        expect(filler.includes(word) || word === 'réseau', word).toBe(true);
      }
    });

    it('tient dans 160 caractères sans correspondance (faute de frappe)', () => {
      const { snippet, highlights } = buildSnippet(filler.repeat(10), 'reseua');
      expect(snippet.length).toBeLessThanOrEqual(160);
      expect(snippet.endsWith(ELLIPSIS)).toBe(true);
      expect(highlights).toEqual([]);
    });

    it('ne coupe jamais une paire de substitution (CL-8)', () => {
      for (let shift = 0; shift < 4; shift += 1) {
        const text = `${'x'.repeat(shift)}${'🌍'.repeat(120)} réseau ${'🌍'.repeat(120)}`;
        const { snippet, highlights } = buildSnippet(text, 'reseau');
        expect(snippet.length).toBeLessThanOrEqual(160);
        expect(snippet, `shift ${String(shift)}`).toBe(snippet.normalize('NFC'));
        // No lone surrogate in the result: a round trip through UTF-8 is lossless.
        expect(new TextDecoder().decode(new TextEncoder().encode(snippet))).toBe(snippet);
        expect(covered(snippet, highlights)).toEqual(['réseau']);
      }
    });

    it('produit toujours un texte NFC et des positions qui le désignent', () => {
      const text = `${'é'.repeat(100)} le réseau ${'é'.repeat(100)}`;
      const { snippet, highlights } = buildSnippet(text, 'reseau');
      expect(snippet).toBe(snippet.normalize('NFC'));
      expect(snippet.length).toBeLessThanOrEqual(160);
      expect(covered(snippet, highlights)).toEqual(['réseau']);
    });

    it('accepte une source absente', () => {
      expect(buildSnippet(null, 'reseau')).toEqual({ snippet: '', highlights: [] });
      expect(buildSnippet(undefined, 'reseau')).toEqual({ snippet: '', highlights: [] });
    });
  });

  describe('contrat de réponse', () => {
    it('refuse un lien externe et un extrait trop long', () => {
      const item = {
        id: '00000000-0000-4000-8000-000000000001',
        title: 'Réseau',
        snippet: 'Texte',
        highlights: [{ start: 0, end: 2 }],
        titleHighlights: [],
        href: '/formations/x',
      };
      const group = (patch: object) => ({
        query: 'reseau',
        groups: [{ kind: 'notion', label: 'Notions', total: 1, items: [{ ...item, ...patch }] }],
      });
      expect(SearchResponse.safeParse(group({})).success).toBe(true);
      expect(SearchResponse.safeParse(group({ href: 'https://example.test' })).success).toBe(false);
      expect(SearchResponse.safeParse(group({ href: '//example.test/x' })).success).toBe(false);
      expect(SearchResponse.safeParse(group({ snippet: 'x'.repeat(161) })).success).toBe(false);
      expect(SearchResponse.safeParse(group({ highlights: [{ start: 3, end: 3 }] })).success).toBe(
        false,
      );
    });
  });
});
