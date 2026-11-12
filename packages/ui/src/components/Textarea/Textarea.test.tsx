// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { Textarea } from './Textarea';

afterEach(cleanup);

describe('[SPEC-302] Textarea', () => {
  it('associe le libellé et affiche le compteur (EF-5)', async () => {
    const { user } = renderComponent(<Textarea defaultValue="" label="Vos notes" maxLength={10} />);
    const textarea = screen.getByLabelText('Vos notes');
    expect(textarea.className).toContain('min-h-96');
    expect(textarea.className).toContain('leading-1.5');
    expect(textarea.className).toContain('resize-y');
    expect(screen.getByText('0 / 10').getAttribute('aria-live')).toBe('off');

    await user.type(textarea, '123456789');
    const counter = screen.getByText('9 / 10');
    expect(counter.getAttribute('aria-live')).toBe('polite');
  });

  it('affiche l’erreur sous le champ avec role alert', () => {
    renderComponent(<Textarea error="Trop court." label="Vos notes" />);
    expect(screen.getByRole('alert').textContent).toBe('Trop court.');
    expect(screen.getByLabelText('Vos notes').getAttribute('aria-invalid')).toBe('true');
  });
});
