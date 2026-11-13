// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { TextView } from '@learny/bricks/view';

import { cleanup, renderComponent } from '../../test-render';

afterEach(cleanup);

function render(bodyMd: string) {
  return renderComponent(
    <TextView
      brick={{
        versionId: '00000000-0000-4000-8000-000000000503',
        type: 'text',
        notionLabels: [],
        publicPayload: { title: 'La comptabilité générale', bodyMd, sources: [] },
      }}
      status="idle"
      value={null}
      variant="course"
    />,
  );
}

describe('[SPEC-503] vue texte', () => {
  it('rend le Markdown GFM et les listes carrées (EF-11)', () => {
    const { container } = render(
      '**À retenir**\n\n- un\n- deux\n\n| Clé | Sens |\n| --- | --- |\n| 40 | Débit |',
    );
    const html = container.innerHTML;
    expect(html).toContain('font-700');
    expect(container.textContent).toContain('À retenir');
    expect(html).toContain('before:content');
    expect(container.querySelector('table th')?.textContent).toBe('Clé');
  });

  it('rend un Markdown piégé inerte (CA-6, CL-3, CL-10)', () => {
    const { container } = render(
      'Un <button>Valider</button> <script>alert(1)</script> [lien](javascript:alert(1))',
    );
    expect(container.textContent).toContain('Valider');
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
  });
});
