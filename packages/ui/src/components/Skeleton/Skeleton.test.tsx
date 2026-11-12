// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { Skeleton, SkeletonCard, SkeletonGroup, SkeletonStatRow, SkeletonText } from './Skeleton';

afterEach(cleanup);

describe('[SPEC-303] Skeleton', () => {
  it('est masqué et pulse, avec désactivation sous mouvement réduit (EF-13)', () => {
    renderComponent(<Skeleton data-testid="skeleton" radius={14} />);
    const skeleton = screen.getByTestId('skeleton');
    expect(skeleton.getAttribute('aria-hidden')).toBe('true');
    expect(skeleton.className).toContain('bg-surface-muted');
    expect(skeleton.className).toContain('rounded-14');
    expect(skeleton.className).toContain('animate-skeleton-pulse');
    expect(skeleton.className).toContain('motion-reduce:animate-none');
  });

  it('groupe annoncé une fois : aria-busy et « Chargement… » (CL-3, CA-5)', () => {
    renderComponent(
      <SkeletonGroup data-testid="loading">
        <SkeletonText lines={2} />
        <SkeletonCard />
        <SkeletonStatRow />
      </SkeletonGroup>,
    );
    const loading = screen.getByTestId('loading');
    expect(loading.getAttribute('aria-busy')).toBe('true');
    expect(loading.textContent).toContain('Chargement…');
    expect(loading.textContent.match(/Chargement/g)).toHaveLength(1);
    expect(loading.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});
