// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SearchResponse,
  type SearchGroup,
  type SearchItem,
  type SearchKind,
} from '@learny/contracts';
import { cleanup, renderComponent, screen, waitFor, within } from '@learny/testing/render';

import { fr } from '../../messages/fr';

import { GlobalSearch, type SearchFunction } from './global-search';

const FORMATION_ID = '11111111-1111-4111-8111-111111111111';
const NOTION_ID = '22222222-2222-4222-8222-222222222222';
const CHAPTER_ID = '33333333-3333-4333-8333-333333333333';

function item(kind: SearchKind, index: number, overrides: Partial<SearchItem> = {}): SearchItem {
  const id = [NOTION_ID, CHAPTER_ID, FORMATION_ID][index] ?? NOTION_ID;
  const href =
    kind === 'notion'
      ? `/formations/${FORMATION_ID}/programme#notion-${id}`
      : kind === 'chapter'
        ? `/formations/${FORMATION_ID}/cours?chapitre=${id}`
        : `/formations/${id}`;
  return {
    id,
    title:
      kind === 'notion'
        ? 'Réseau local'
        : kind === 'chapter'
          ? 'Introduction au réseau'
          : 'Réseaux d’entreprise',
    snippet: 'Un réseau relie des machines proches.',
    highlights: [{ start: 3, end: 9 }],
    titleHighlights: [{ start: 0, end: 6 }],
    href,
    ...overrides,
  };
}

function responseFor(
  query: string,
  kinds: SearchKind[] = ['notion', 'chapter', 'formation'],
): SearchResponse {
  const groups: SearchGroup[] = kinds.map((kind, index) => ({
    kind,
    label: kind === 'notion' ? 'Notions' : kind === 'chapter' ? 'Chapitres' : 'Formations',
    total: 1,
    items: [item(kind, index, kind === 'formation' ? { titleHighlights: [] } : {})],
  }));
  return SearchResponse.parse({ query, groups });
}

const EMPTY: SearchResponse = { query: 'zzzz', groups: [] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(search: SearchFunction) {
  const onNavigate = vi.fn();
  const result = renderComponent(<GlobalSearch onNavigate={onNavigate} search={search} />);
  const input = screen.getByTestId<HTMLInputElement>('header-search-input');
  return { ...result, input, onNavigate };
}

afterEach(cleanup);

describe('[SPEC-307] Recherche globale : interface', () => {
  it('n’interroge l’API qu’à partir de deux caractères normalisés (CA-1)', async () => {
    const search = vi.fn<SearchFunction>().mockResolvedValue(responseFor('réseau'));
    const { user, input } = setup(search);

    await user.type(input, 'r');
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(search).not.toHaveBeenCalled();
    expect(input.value).toBe('r');
    expect(screen.getByTestId('search-state-idle').textContent).toBe(fr.search.shortHint);

    await user.type(input, 'éseau');
    await waitFor(() => {
      expect(search).toHaveBeenCalledTimes(1);
    });
    expect(search.mock.calls[0]?.[0]).toEqual({ query: { q: 'réseau' } });
    expect(search.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(input.value).toBe('réseau');

    const notions = await screen.findByTestId('search-group-notion');
    const chapters = screen.getByTestId('search-group-chapter');
    const formations = screen.getByTestId('search-group-formation');
    expect(
      notions.compareDocumentPosition(chapters) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      chapters.compareDocumentPosition(formations) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(notions).getByText('Notions')).toBeTruthy();
    expect(within(chapters).getByText('Chapitres')).toBeTruthy();
    expect(within(formations).getByText('Formations')).toBeTruthy();
    expect(screen.getAllByTestId('search-option')).toHaveLength(3);
    expect(screen.getByTestId('search-view-all').getAttribute('href')).toBe(
      '/recherche?q=r%C3%A9seau',
    );
  });

  it('rend le même jeu de résultats avec accents et sans accent (CA-3)', async () => {
    const search = vi
      .fn<SearchFunction>()
      .mockImplementation(({ query }) => Promise.resolve(responseFor(query.q)));
    const { user, input } = setup(search);

    await user.type(input, 'reseau');
    await screen.findAllByTestId('search-option');
    const withoutAccent = screen
      .getAllByTestId('search-option-title')
      .map((node) => node.textContent);

    await user.clear(input);
    await user.type(input, 'RÉSEAU');
    await waitFor(() => {
      expect(search).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('search-option-title').map((node) => node.textContent)).toEqual(
        withoutAccent,
      );
    });
    expect(search.mock.calls[1]?.[0]).toEqual({ query: { q: 'RÉSEAU' } });
  });

  it('suit le motif combobox au clavier et ouvre le résultat actif (CA-2)', async () => {
    const search = vi.fn<SearchFunction>().mockResolvedValue(responseFor('reseau'));
    const { user, input, onNavigate } = setup(search);

    await user.type(input, 'reseau');
    const options = await screen.findAllByTestId('search-option');
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    const listbox = await screen.findByRole('listbox', { name: fr.search.resultsLabel });
    expect(input.getAttribute('aria-controls')).toBe(listbox.id);

    await user.keyboard('{ArrowDown}');
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0]?.id);
    expect(options[0]?.getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{ArrowDown}');
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1]?.id);
    await user.keyboard('{ArrowUp}');
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0]?.id);

    await user.keyboard('{Enter}');
    expect(onNavigate).toHaveBeenCalledWith(
      `/formations/${FORMATION_ID}/programme#notion-${NOTION_ID}`,
    );
    expect(screen.getByTestId('search-suggestions').className).toContain('hidden');

    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('search-suggestions').className).toContain('flex');
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('search-suggestions').className).toContain('hidden');
    expect(input.value).toBe('reseau');

    await user.keyboard('{ArrowDown}');
    await user.tab();
    expect(document.activeElement).toBe(screen.getByTestId('search-view-all'));
    expect(screen.getByTestId('search-suggestions').className).toContain('flex');
  });

  it('conserve la saisie pendant le chargement puis affiche l’état vide (CL-2)', async () => {
    const pending = deferred<SearchResponse>();
    const search = vi.fn<SearchFunction>().mockReturnValue(pending.promise);
    const { user, input } = setup(search);

    await user.type(input, 'zzzz');
    await waitFor(() => {
      expect(screen.getByTestId('search-state-loading')).toBeTruthy();
    });
    expect(input.value).toBe('zzzz');
    expect(screen.getByTestId('search-state-loading').textContent).toBe(fr.search.loading);

    pending.resolve(EMPTY);
    await waitFor(() => {
      expect(screen.getByTestId('search-state-empty').textContent).toBe(fr.search.empty('zzzz'));
    });
    expect(input.value).toBe('zzzz');
  });

  it('affiche une erreur réessayable sans effacer la requête (CL-3)', async () => {
    const search = vi
      .fn<SearchFunction>()
      .mockRejectedValueOnce(new Error('réseau indisponible'))
      .mockResolvedValueOnce(EMPTY);
    const { user, input } = setup(search);

    await user.type(input, 'reseau');
    const error = await screen.findByTestId('search-state-error');
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent).toContain(fr.search.error);
    expect(input.value).toBe('reseau');

    await user.click(screen.getByTestId('search-retry'));
    await waitFor(() => {
      expect(search).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByTestId('search-state-empty').textContent).toBe(fr.search.empty('reseau'));
    });
    expect(input.value).toBe('reseau');
  });

  it('ignore la réponse tardive d’une ancienne requête (CA-4)', async () => {
    const older = deferred<SearchResponse>();
    const recent = deferred<SearchResponse>();
    const search = vi
      .fn<SearchFunction>()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(recent.promise);
    const { user, input } = setup(search);

    await user.type(input, 'reseau');
    await waitFor(() => {
      expect(search).toHaveBeenCalledTimes(1);
    });
    await user.clear(input);
    await user.type(input, 'routage');
    await waitFor(() => {
      expect(search).toHaveBeenCalledTimes(2);
    });

    recent.resolve(
      responseFor('routage', ['notion']).groups.reduce<SearchResponse>(
        (response, group) => ({
          ...response,
          groups: [
            {
              ...group,
              items: group.items.map((entry) => ({ ...entry, title: 'Routage' })),
            },
          ],
        }),
        { query: 'routage', groups: [] },
      ),
    );
    await waitFor(() => {
      expect(screen.getByTestId('search-option-title').textContent).toBe('Routage');
    });

    older.resolve(responseFor('reseau'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.getAllByTestId('search-option-title').map((node) => node.textContent)).toEqual([
      'Routage',
    ]);
    expect(input.value).toBe('routage');
  });

  it('rend les extraits comme du texte sûr, jamais en HTML (ET-3)', async () => {
    const malicious = responseFor('reseau', ['notion']).groups[0];
    if (malicious === undefined) throw new Error('groupe de test absent');
    const search = vi.fn<SearchFunction>().mockResolvedValue({
      query: 'reseau',
      groups: [
        {
          ...malicious,
          items: [
            {
              ...item('notion', 0),
              title: '<script>alert(1)</script>Réseau',
              snippet: '<img src=x onerror=alert(2)> Un réseau sûr',
              titleHighlights: [{ start: 0, end: 8 }],
            },
          ],
        },
      ],
    });
    const { user, input, container } = setup(search);

    await user.type(input, 'reseau');
    await screen.findAllByTestId('search-option');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTestId('search-option-title').textContent).toContain(
      '<script>alert(1)</script>',
    );
    expect(screen.getByTestId('search-option-snippet').textContent).toContain(
      '<img src=x onerror=alert(2)>',
    );
  });
});
