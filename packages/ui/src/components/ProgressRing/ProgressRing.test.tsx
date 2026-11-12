// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { ProgressRing } from './ProgressRing';

afterEach(cleanup);

describe('[SPEC-303] ProgressRing', () => {
  it('calcule le dasharray de 86 % et le libellé accessible (EF-4, CA-3)', () => {
    renderComponent(
      <ProgressRing data-testid="ring" label="Notions retenues à 1 mois : 86 %" value={86} />,
    );
    const ring = screen.getByTestId('ring');
    expect(ring.getAttribute('role')).toBe('img');
    expect(ring.getAttribute('aria-label')).toBe('Notions retenues à 1 mois : 86 %');
    expect(ring.textContent).toContain('86 %');
    const svg = ring.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 112 112');
    const circles = ring.querySelectorAll('circle');
    expect(circles).toHaveLength(2);
    expect(circles[0]?.getAttribute('stroke-width')).toBe('12');
    expect(circles[0]?.getAttribute('class')).toContain('stroke-indigo-soft');
    expect(circles[1]?.getAttribute('class')).toContain('stroke-indigo');
    expect(circles[1]?.getAttribute('stroke-dasharray')).toBe('248.6 289');
    expect(circles[1]?.getAttribute('stroke-linecap')).toBe('round');
    expect(circles[1]?.getAttribute('transform')).toBe('rotate(-90 56 56)');
  });

  it('rend uniquement la piste à 0 et borne à 100 (CL-7)', () => {
    renderComponent(
      <>
        <ProgressRing data-testid="ring-zero" label="Zéro" value={0} />
        <ProgressRing data-testid="ring-full" label="Plein" value={180} />
      </>,
    );
    expect(
      screen
        .getByTestId('ring-zero')
        .querySelectorAll('circle')[1]
        ?.getAttribute('stroke-dasharray'),
    ).toBe('0.0 289');
    expect(screen.getByTestId('ring-zero').textContent).toContain('0 %');
    expect(screen.getByTestId('ring-full').textContent).toContain('100 %');
  });

  it('variante xs teal de 36 px pour les tableaux (EF-4)', () => {
    renderComponent(
      <ProgressRing
        data-testid="ring-xs"
        label="Module 5 sur 6 : 83 %"
        size="xs"
        tone="teal"
        value={83}
      />,
    );
    const ring = screen.getByTestId('ring-xs');
    expect(ring.textContent).toBe('');
    const svg = ring.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('36');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 36 36');
    const circles = ring.querySelectorAll('circle');
    expect(circles[0]?.getAttribute('class')).toContain('stroke-border');
    expect(circles[1]?.getAttribute('class')).toContain('stroke-teal');
    expect(circles[1]?.getAttribute('stroke-dasharray')).toBe('73.0 88');
  });
});
