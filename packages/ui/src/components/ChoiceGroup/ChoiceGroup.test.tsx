// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { ChoiceGroup, type ChoiceOption } from './ChoiceGroup';

afterEach(cleanup);

const OPTIONS: ChoiceOption[] = [
  {
    value: 'magic',
    label: 'Recevoir un lien de connexion',
    description: 'Sans mot de passe : un lien valable 1 heure.',
    testId: 'auth-method-magic',
  },
  {
    value: 'password',
    label: 'Choisir un mot de passe',
    description: '12 caractères au moins.',
    testId: 'auth-method-password',
  },
  {
    value: 'disabled',
    label: 'Option indisponible',
    disabled: true,
  },
];

function Controlled() {
  const [value, setValue] = useState('magic');
  return (
    <ChoiceGroup
      aria-label="Façon de se connecter"
      onValueChange={setValue}
      options={OPTIONS}
      value={value}
    />
  );
}

describe('[SPEC-601] ChoiceGroup', () => {
  it('expose un radiogroup, les cartes et aria-checked (ET-7)', async () => {
    const { user } = renderComponent(<Controlled />);
    expect(screen.getByRole('radiogroup', { name: 'Façon de se connecter' })).toBeTruthy();
    const magic = screen.getByRole('radio', { name: /Recevoir un lien de connexion/ });
    const password = screen.getByRole('radio', { name: /Choisir un mot de passe/ });
    expect(magic.getAttribute('aria-checked')).toBe('true');
    expect(password.getAttribute('aria-checked')).toBe('false');
    expect(magic.className).toContain('border-2');
    expect(magic.className).toContain('bg-surface-subtle');
    expect(password.className).toContain('border-border-strong');

    await user.click(password);
    expect(magic.getAttribute('aria-checked')).toBe('false');
    expect(password.getAttribute('aria-checked')).toBe('true');
    expect(password).toBe(document.activeElement);
  });

  it('navigue aux flèches et sélectionne au clavier (ET-7)', async () => {
    const { user } = renderComponent(<Controlled />);
    const magic = screen.getByRole('radio', { name: /Recevoir un lien de connexion/ });
    const password = screen.getByRole('radio', { name: /Choisir un mot de passe/ });
    magic.focus();

    await user.keyboard('{ArrowDown}');
    expect(password.getAttribute('aria-checked')).toBe('true');
    expect(password).toBe(document.activeElement);

    await user.keyboard('{ArrowUp}');
    expect(magic.getAttribute('aria-checked')).toBe('true');
    expect(magic).toBe(document.activeElement);

    // The disabled third option is skipped and the selection loops to the first card.
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}');
    expect(magic.getAttribute('aria-checked')).toBe('true');
    expect(magic).toBe(document.activeElement);
  });

  it('sélectionne avec Espace et Entrée et garde un seul arrêt de tabulation', async () => {
    const { user } = renderComponent(<Controlled />);
    const magic = screen.getByRole('radio', { name: /Recevoir un lien de connexion/ });
    const password = screen.getByRole('radio', { name: /Choisir un mot de passe/ });
    magic.focus();

    await user.keyboard('{ArrowDown}');
    await user.keyboard(' ');
    expect(password.getAttribute('aria-checked')).toBe('true');

    await user.keyboard('{ArrowUp}');
    await user.keyboard('{Enter}');
    expect(magic.getAttribute('aria-checked')).toBe('true');

    expect(magic.getAttribute('tabindex')).toBe('0');
    expect(password.getAttribute('tabindex')).toBe('-1');
  });
});
