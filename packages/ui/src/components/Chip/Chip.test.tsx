// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { Chip } from './Chip';

afterEach(cleanup);

function ControlledChip() {
  const [pressed, setPressed] = useState(false);
  return (
    <Chip count={4} onPressedChange={setPressed} pressed={pressed} shape="pill">
      À consolider
    </Chip>
  );
}

describe('[SPEC-302] Chip', () => {
  it('bascule aria-pressed au clic et affiche le compteur (EF-11)', async () => {
    const { user } = renderComponent(<ControlledChip />);
    const chip = screen.getByRole('button', { name: /À consolider/ });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    expect(chip.className).toContain('border-border-strong');
    expect(chip.textContent).toContain('4');
    await user.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(chip.className).toContain('bg-ink');
  });

  it('forme arrondie avec nom accessible explicite', () => {
    renderComponent(
      <Chip ariaLabel="Lundi" onPressedChange={() => {}} pressed shape="rounded">
        L
      </Chip>,
    );
    const chip = screen.getByRole('button', { name: 'Lundi' });
    expect(chip.className).toContain('rounded-12');
    expect(chip.className).toContain('min-h-40');
    expect(chip.className).toContain('text-white');
  });

  it('pilule sm non sélectionnée en texte atténué', () => {
    renderComponent(
      <Chip onPressedChange={() => {}} pressed={false} shape="pill" size="sm">
        Filtre
      </Chip>,
    );
    expect(screen.getByRole('button', { name: 'Filtre' }).className).toContain('text-ink-muted');
  });
});
