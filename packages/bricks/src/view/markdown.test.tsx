// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { cleanup, renderComponent, screen } from '../test-render';

import { ExcerptChip } from './excerpt-chip';
import { MarkdownContent } from './markdown';

afterEach(cleanup);

const MARKDOWN = `# Titre

## Sous-titre

### Petit titre

Un **gras** et du \`code\` avec [un lien](https://example.com/a) et [relatif](./page).

- puce un
- puce deux

1. premier
2. second

> citation

| Col | Val |
| --- | --- |
| a | 1 |

[danger](javascript:alert(1)) [mail](mailto:a@b.fr) [autre](ftp://x) [nu](plain)
`;

describe('[SPEC-503] rendu Markdown', () => {
  it('rend titres, listes, tableau, citation et code sans HTML brut', () => {
    renderComponent(<MarkdownContent markdown={`${MARKDOWN}\n<script>alert(1)</script>`} />);
    const root = screen.getByTestId('brick-markdown');
    expect(root.querySelector('h1')?.textContent).toBe('Titre');
    expect(root.querySelector('h2')?.textContent).toBe('Sous-titre');
    expect(root.querySelector('h3')?.textContent).toBe('Petit titre');
    expect(root.querySelectorAll('ul li')).toHaveLength(2);
    expect(root.querySelectorAll('ol li')).toHaveLength(2);
    expect(root.querySelector('blockquote')?.textContent).toContain('citation');
    expect(root.querySelector('table th')?.textContent).toBe('Col');
    expect(root.querySelector('table td')?.textContent).toBe('a');
    expect(root.querySelector('code')?.textContent).toBe('code');
    expect(root.querySelector('strong')?.textContent).toBe('gras');
    expect(root.querySelector('script')).toBeNull();
  });

  it('ne laisse passer que les schémas d’URL sûrs (CL-3)', () => {
    renderComponent(<MarkdownContent markdown={MARKDOWN} />);
    const hrefs = [...screen.getByTestId('brick-markdown').querySelectorAll('a')].map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).toContain('https://example.com/a');
    expect(hrefs).toContain('./page');
    expect(hrefs).toContain('mailto:a@b.fr');
    expect(hrefs).toContain('plain');
    expect(hrefs.some((href) => href?.startsWith('javascript:'))).toBe(false);
    expect(hrefs.some((href) => href?.startsWith('ftp:'))).toBe(false);
  });
});

describe('[SPEC-503] puce d’extrait', () => {
  it('est un bouton quand une ouverture est possible', async () => {
    let opened = 0;
    const { user } = renderComponent(
      <ExcerptChip kind="pdf" label="Guide, p. 4" onOpen={() => (opened += 1)} />,
    );
    await user.click(screen.getByRole('button', { name: 'Guide, p. 4' }));
    expect(opened).toBe(1);
  });

  it('est un simple libellé sans ouverture, et signale une source supprimée', () => {
    renderComponent(<ExcerptChip kind="web" label="Page" />);
    expect(screen.getByTestId('brick-excerpt').tagName).toBe('SPAN');
    cleanup();
    renderComponent(<ExcerptChip deleted kind="note" label="Note" onOpen={() => undefined} />);
    expect(screen.getByTestId('brick-excerpt').textContent).toBe('Source supprimée');
  });
});
