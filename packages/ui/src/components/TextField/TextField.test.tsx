// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { Search } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { TextField } from './TextField';

afterEach(cleanup);

describe('[SPEC-302] TextField', () => {
  it('associe le libellé au champ et l’habillage formulaire (EF-4)', () => {
    renderComponent(<TextField data-testid="champ" label="Adresse e-mail" />);
    const input = screen.getByLabelText('Adresse e-mail');
    expect(input.getAttribute('data-testid')).toBe('champ');
    expect(input.className).toContain('min-h-48');
    expect(input.className).toContain('border-border-strong');
    expect(input.className).toContain('text-15');
  });

  it('variante recherche avec icône et libellé masqué possible', () => {
    renderComponent(
      <TextField hideLabel label="Rechercher" leadingIcon={Search} variant="search" />,
    );
    const input = screen.getByLabelText('Rechercher');
    expect(input.className).toContain('min-h-42');
    expect(input.className).toContain('pl-42');
    expect(input.className).toContain('border-border');
    expect(document.querySelector('label')?.className).toContain('sr-only');
  });

  it('relie indice et erreur par aria-describedby, avec role alert et aria-invalid', () => {
    renderComponent(
      <TextField error="Adresse invalide." hint="Format attendu : nom@domaine.fr" label="E-mail" />,
    );
    const input = screen.getByLabelText('E-mail');
    const describedBy = input.getAttribute('aria-describedby');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(describedBy).toBeTruthy();
    expect(describedBy).toContain('-hint');
    expect(describedBy).toContain('-error');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Adresse invalide.');
    expect(input.className).toContain('border-orange-ink');
  });
});
