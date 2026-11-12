// @vitest-environment jsdom
import { cleanup } from '@testing-library/react';
import { Bell } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { IconButton } from './IconButton';

afterEach(cleanup);

describe('[SPEC-302] IconButton', () => {
  it('expose aria-label et l’icône décorative (EF-2)', () => {
    renderComponent(<IconButton icon={Bell} label="Notifications" />);
    const button = document.querySelector('button');
    expect(button?.getAttribute('aria-label')).toBe('Notifications');
    expect(button?.className).toContain('size-42');
    expect(button?.className).toContain('border-border');
    expect(button?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('taille et ton sombre', () => {
    renderComponent(<IconButton icon={Bell} label="Notifications" size="sm" tone="dark" />);
    const button = document.querySelector('button');
    expect(button?.className).toContain('size-32');
    expect(button?.className).toContain('border-dark-600');
    expect(button?.className).toContain('text-on-dark-muted');
  });

  it('affiche le badge en haut à droite', () => {
    renderComponent(
      <IconButton
        badge={<span data-testid="pastille">3</span>}
        icon={Bell}
        label="Notifications"
      />,
    );
    const badge = document.querySelector('[data-testid="pastille"]');
    expect(badge?.parentElement?.className).toContain('absolute');
  });
});
