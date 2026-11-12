// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { StatCard, StatRow } from './StatCard';

afterEach(cleanup);

describe('[SPEC-303] StatCard', () => {
  it('applique les tons sombre et clair de EF-2', () => {
    renderComponent(
      <StatRow data-testid="stat-row">
        <StatCard data-testid="stat-dark" label="à consolider" tone="dark" value="4 notions" />
        <StatCard data-testid="stat-light" label="maîtrisées" value="23 notions" />
      </StatRow>,
    );

    const row = screen.getByTestId('stat-row');
    expect(row.className).toContain('gap-12');
    expect(row.className).toContain('flex-wrap');
    expect(row.className).toContain('max-[479px]:flex-col');

    const dark = screen.getByTestId('stat-dark');
    expect(dark.className).toContain('bg-ink');
    expect(dark.className).toContain('rounded-22');
    expect(dark.className).toContain('p-20');
    expect(dark.className).toContain('flex-[1_1_220px]');
    const darkValue = screen.getByText('4 notions');
    expect(darkValue.className).toContain('font-display');
    expect(darkValue.className).toContain('text-34');
    expect(darkValue.className).toContain('text-lime');
    expect(screen.getByText('à consolider').className).toContain('text-on-dark-secondary');
    expect(screen.getByText('à consolider').className).toContain('text-13');

    const light = screen.getByTestId('stat-light');
    expect(light.className).toContain('bg-surface');
    expect(light.className).toContain('border-border');
    expect(screen.getByText('23 notions').className).toContain('text-ink');
    expect(screen.getByText('maîtrisées').className).toContain('text-ink-muted');
  });
});
