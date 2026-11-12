// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { ProgressBar } from './ProgressBar';

afterEach(cleanup);

describe('[SPEC-303] ProgressBar', () => {
  it('borne la valeur et expose l’ARIA de EF-3 (CL-7)', () => {
    renderComponent(
      <>
        <ProgressBar data-testid="bar-low" label="Progression" value={-5} />
        <ProgressBar data-testid="bar-high" label="Progression" tone="orange" value={140} />
      </>,
    );

    const low = screen.getByTestId('bar-low');
    expect(low.getAttribute('role')).toBe('progressbar');
    expect(low.getAttribute('aria-valuemin')).toBe('0');
    expect(low.getAttribute('aria-valuemax')).toBe('100');
    expect(low.getAttribute('aria-valuenow')).toBe('0');
    expect(low.getAttribute('aria-label')).toBe('Progression');
    expect(low.firstElementChild?.getAttribute('style')).toContain('width: 0%');
    expect(low.className).toContain('h-8');
    expect(low.className).toContain('rounded-4');
    expect(low.className).toContain('bg-surface-muted');

    const high = screen.getByTestId('bar-high');
    expect(high.getAttribute('aria-valuenow')).toBe('100');
    expect(high.firstElementChild?.getAttribute('style')).toContain('width: 100%');
    expect(high.firstElementChild?.className).toContain('bg-orange');
  });

  it('accepte un libellé par id, la variante sm et le fond sombre', () => {
    renderComponent(
      <>
        <span id="progress-label">Maîtrise du module</span>
        <ProgressBar
          data-testid="bar-labelled"
          labelledBy="progress-label"
          onDark
          size="sm"
          tone="lime"
          value={45}
        />
      </>,
    );
    const bar = screen.getByTestId('bar-labelled');
    expect(bar.getAttribute('aria-labelledby')).toBe('progress-label');
    expect(bar.hasAttribute('aria-label')).toBe(false);
    expect(bar.className).toContain('h-4');
    expect(bar.className).toContain('bg-dark-500');
    expect(bar.firstElementChild?.className).toContain('bg-lime');
  });

  it('devient purement décorative avec decorative (EF-3)', () => {
    renderComponent(<ProgressBar data-testid="bar-decorative" decorative value={30} />);
    const bar = screen.getByTestId('bar-decorative');
    expect(bar.getAttribute('aria-hidden')).toBe('true');
    expect(bar.hasAttribute('role')).toBe(false);
    expect(bar.hasAttribute('aria-valuenow')).toBe(false);
  });
});
