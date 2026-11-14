// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { DialogFooter } from './Dialog';

afterEach(cleanup);

describe('[SPEC-303] pied de dialogue', () => {
  it('aligne les actions à droite et accepte une classe (EF-8)', () => {
    renderComponent(
      <DialogFooter className="extra">
        <button type="button">Annuler</button>
      </DialogFooter>,
    );
    const footer = screen.getByRole('button', { name: 'Annuler' }).parentElement;
    expect(footer?.className).toContain('justify-end');
    expect(footer?.className).toContain('extra');
  });
});
