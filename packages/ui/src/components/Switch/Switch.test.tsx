// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { Switch } from './Switch';

afterEach(cleanup);

function Controlled({ locked = false }: Readonly<{ locked?: boolean }>) {
  const [checked, setChecked] = useState(false);
  return (
    <Switch
      checked={locked ? true : checked}
      label="Notifications"
      locked={locked}
      onCheckedChange={setChecked}
    />
  );
}

describe('[SPEC-302] Switch', () => {
  it('expose role switch et aria-checked, et bascule au clic (EF-8)', async () => {
    const { user } = renderComponent(<Controlled />);
    const control = screen.getByRole('switch', { name: 'Notifications' });
    expect(control.getAttribute('aria-checked')).toBe('false');
    expect(control.className).toContain('bg-border-strong');
    expect(control.textContent).toBe('');

    await user.click(control);
    expect(control.getAttribute('aria-checked')).toBe('true');
    expect(control.className).toContain('data-[state=checked]:bg-ink');
  });

  it('bascule avec Espace (CL-3)', async () => {
    const { user } = renderComponent(<Controlled />);
    const control = screen.getByRole('switch', { name: 'Notifications' });
    control.focus();
    await user.keyboard(' ');
    expect(control.getAttribute('aria-checked')).toBe('true');
  });

  it('verrouillé : aria-disabled et valeur inchangée (EF-8)', async () => {
    const { user } = renderComponent(<Controlled locked />);
    const control = screen.getByRole('switch', { name: 'Notifications' });
    expect(control.getAttribute('aria-disabled')).toBe('true');
    expect(control.className).toContain('opacity-55');
    await user.click(control);
    expect(control.getAttribute('aria-checked')).toBe('true');
  });

  it('associe la description', () => {
    renderComponent(
      <Switch checked description="Révisions dues." label="Rappels" onCheckedChange={() => {}} />,
    );
    expect(
      screen.getByRole('switch', { name: 'Rappels' }).getAttribute('aria-describedby'),
    ).toBeTruthy();
  });
});
