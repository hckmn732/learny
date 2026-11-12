// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { SegmentedControl } from './SegmentedControl';

afterEach(cleanup);

const OPTIONS = [
  { value: 'toutes', label: 'Toutes', count: 8 },
  { value: 'non-lues', label: 'Non lues', count: 3 },
  { value: 'archivees', label: 'Archivées' },
] as const;

type Value = (typeof OPTIONS)[number]['value'];

function Controlled({ initial = 'toutes' }: Readonly<{ initial?: Value }>) {
  const [value, setValue] = useState<Value>(initial);
  return (
    <SegmentedControl
      aria-label="Filtre des notifications"
      onValueChange={setValue}
      options={[...OPTIONS]}
      value={value}
    />
  );
}

describe('[SPEC-302] SegmentedControl', () => {
  it('expose aria-pressed et un tabindex itinérant (EF-9, CA-3)', () => {
    renderComponent(<Controlled />);
    const group = screen.getByRole('group', { name: 'Filtre des notifications' });
    expect(group.className).toContain('bg-canvas');
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    expect(buttons.map((button) => button.tabIndex)).toEqual([0, -1, -1]);
    expect(buttons[0]?.textContent).toContain('8');
  });

  it('déplace le focus et la sélection avec les flèches, en boucle (CL-3)', async () => {
    const { user } = renderComponent(<Controlled />);
    const buttons = screen.getAllByRole('button');
    buttons[0]?.focus();
    await user.keyboard('{ArrowRight}');
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(buttons[1]);
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(buttons[0]);
    await user.keyboard('{ArrowLeft}');
    expect(buttons[2]?.getAttribute('aria-pressed')).toBe('true');
  });

  it('Début et Fin vont aux extrémités (CL-3)', async () => {
    const { user } = renderComponent(<Controlled initial="non-lues" />);
    const buttons = screen.getAllByRole('button');
    buttons[1]?.focus();
    await user.keyboard('{End}');
    expect(buttons[2]?.getAttribute('aria-pressed')).toBe('true');
    await user.keyboard('{Home}');
    expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true');
  });

  it('variante solid : conteneur bordé et option active sombre', () => {
    renderComponent(
      <SegmentedControl
        aria-label="Affichage"
        onValueChange={() => {}}
        options={[...OPTIONS]}
        value="toutes"
        variant="solid"
      />,
    );
    const group = screen.getByRole('group', { name: 'Affichage' });
    expect(group.className).toContain('border-border');
    expect(screen.getAllByRole('button')[0]?.className).toContain('bg-ink');
  });
});
