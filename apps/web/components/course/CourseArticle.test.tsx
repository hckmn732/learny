// @vitest-environment jsdom
// Unit tests of the course article (SPEC-609 §12): sanitised Markdown, flash question reveal and
// a deleted source without a broken link.

import { afterEach, describe, expect, it } from 'vitest';

import type { CourseSection } from '@learny/contracts';
import { cleanup, renderComponent, screen } from '@learny/testing/render';

import { CourseArticle } from './CourseArticle';

afterEach(cleanup);

function section(overrides: Partial<CourseSection> = {}): CourseSection {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'text',
    anchor: 'entete',
    title: null,
    contentMd: 'Une pièce réunit un en-tête et des postes.',
    data: null,
    origin: 'resource',
    notionIds: [],
    citations: [],
    version: 1,
    reported: false,
    ...overrides,
  };
}

describe('[SPEC-609] article du cours', () => {
  it('CA-3 — retire un script et neutralise un lien javascript:', () => {
    const { container } = renderComponent(
      <CourseArticle
        sections={[
          section({
            contentMd:
              'Texte sûr.\n\n<script>window.__pwned = true</script>\n\n[piège](javascript:alert(1))',
          }),
        ]}
      />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).not.toContain('javascript:');
    expect(container.textContent).not.toContain('window.__pwned');
  });

  it('BR-COU-05 — masque la réponse puis la révèle au clic', async () => {
    const { user } = renderComponent(
      <CourseArticle
        sections={[
          section({
            kind: 'flash_question',
            anchor: 'eclair',
            data: { question: 'Où est le sens débit ?', answer: 'Dans chaque poste.' },
            contentMd: null,
          }),
        ]}
      />,
    );
    expect(screen.queryByTestId('course-answer')).toBeNull();
    await user.click(screen.getByTestId('course-reveal'));
    expect(screen.getByTestId('course-answer').textContent).toContain('Dans chaque poste.');
  });

  it('CL-3 — une source supprimée affiche son étiquette sans lien', () => {
    renderComponent(
      <CourseArticle
        sections={[
          section({
            citations: [
              {
                id: '22222222-2222-4222-8222-222222222222',
                chunkId: null,
                resourceId: null,
                label: 'Guide FI',
                quote: null,
                location: { page: 4 },
                mediaKind: 'pdf',
                deleted: true,
              },
            ],
          }),
        ]}
      />,
    );
    expect(screen.getByTestId('course-source').textContent).toContain('Guide FI · Source supprimée');
    expect(screen.queryByRole('button', { name: /Guide FI/ })).toBeNull();
  });
});
