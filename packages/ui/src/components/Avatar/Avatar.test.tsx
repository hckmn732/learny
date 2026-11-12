// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { Avatar, getInitials } from './Avatar';

afterEach(cleanup);

describe('[SPEC-303] Avatar', () => {
  it('calcule les initiales, accents conservés (EF-5)', () => {
    expect(getInitials('Alex', 'Perrin')).toBe('AP');
    expect(getInitials('Élise', 'Ortiz')).toBe('ÉO');
    expect(getInitials('alex', 'perrin')).toBe('AP');
    expect(getInitials('Alex')).toBe('A');
    expect(getInitials('', '')).toBe('?');
    expect(getInitials(undefined, undefined)).toBe('?');
    expect(getInitials('  ', '   ')).toBe('?');
  });

  it('affiche le cercle indigo décoratif et ses tailles (EF-5)', () => {
    renderComponent(
      <>
        <Avatar data-testid="avatar-md" firstName="Alex" lastName="Perrin" />
        <Avatar data-testid="avatar-sm" firstName="Élise" lastName="Ortiz" size="sm" />
      </>,
    );
    const md = screen.getByTestId('avatar-md');
    expect(md.textContent).toBe('AP');
    expect(md.getAttribute('aria-hidden')).toBe('true');
    expect(md.className).toContain('bg-indigo');
    expect(md.className).toContain('size-34');
    expect(md.className).toContain('text-13');
    const sm = screen.getByTestId('avatar-sm');
    expect(sm.textContent).toBe('ÉO');
    expect(sm.className).toContain('size-28');
    expect(sm.className).toContain('text-11');
  });
});
