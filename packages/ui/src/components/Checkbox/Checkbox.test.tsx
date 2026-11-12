// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { Checkbox } from './Checkbox';

afterEach(cleanup);

describe('[SPEC-302] Checkbox', () => {
  it('bascule au clic sur le libellé (EF-7)', async () => {
    const { user } = renderComponent(<Checkbox label="Recevoir le programme" />);
    const input = screen.getByRole<HTMLInputElement>('checkbox');
    expect(input.className).toContain('size-18');
    expect(input.className).toContain('accent-ink');
    await user.click(screen.getByText('Recevoir le programme'));
    expect(input.checked).toBe(true);
  });

  it('reflète l’état indéterminé', () => {
    renderComponent(<Checkbox indeterminate label="Sélection partielle" />);
    expect(screen.getByRole<HTMLInputElement>('checkbox').indeterminate).toBe(true);
  });

  it('désactive et signale l’erreur', () => {
    renderComponent(<Checkbox disabled error="Obligatoire." label="Conditions" />);
    const input = screen.getByRole<HTMLInputElement>('checkbox');
    expect(input.disabled).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Obligatoire.');
  });
});
