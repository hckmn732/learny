// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { Card, CardHeader } from './Card';

afterEach(cleanup);

describe('[SPEC-303] Card', () => {
  it('applique les quatre tons, remplissages et rayons de EF-1', () => {
    renderComponent(
      <>
        <Card data-testid="card-default" />
        <Card data-testid="card-dark" tone="dark" />
        <Card data-testid="card-lime" tone="lime" />
        <Card data-testid="card-subtle" tone="subtle" />
        <Card data-testid="card-lg" padding="lg" radius={20} />
      </>,
    );

    const standard = screen.getByTestId('card-default');
    expect(standard.tagName).toBe('SECTION');
    expect(standard.className).toContain('rounded-24');
    expect(standard.className).toContain('border-border');
    expect(standard.className).toContain('bg-surface');
    expect(standard.className).toContain('py-22');
    expect(standard.className).toContain('px-24');

    const dark = screen.getByTestId('card-dark');
    expect(dark.className).toContain('bg-ink');
    expect(dark.className).toContain('text-white');

    const lime = screen.getByTestId('card-lime');
    expect(lime.className).toContain('bg-lime');
    expect(lime.className).toContain('text-ink');

    const subtle = screen.getByTestId('card-subtle');
    expect(subtle.className).toContain('bg-surface-subtle');
    expect(subtle.className).toContain('rounded-18');
    expect(subtle.className).not.toContain('border-border');

    const large = screen.getByTestId('card-lg');
    expect(large.className).toContain('py-24');
    expect(large.className).toContain('px-28');
    expect(large.className).toContain('rounded-20');
  });

  it('choisit l’élément sémantique et le libellé (EF-1)', () => {
    renderComponent(
      <Card as="article" data-testid="card-article" labelledBy="card-title">
        <CardHeader
          actions={<button type="button">Action</button>}
          description="Description"
          title="Titre de carte"
          titleId="card-title"
          titleSize="lg"
        />
      </Card>,
    );

    const card = screen.getByTestId('card-article');
    expect(card.tagName).toBe('ARTICLE');
    expect(card.getAttribute('aria-labelledby')).toBe('card-title');
    const heading = screen.getByRole('heading', { level: 2, name: 'Titre de carte' });
    expect(heading.id).toBe('card-title');
    expect(heading.className).toContain('font-display');
    expect(heading.className).toContain('text-22');
    expect(heading.className).toContain('tracking-heading');
    expect(screen.getByRole('button', { name: 'Action' })).toBeTruthy();
    expect(screen.getByText('Description').className).toContain('text-13');
  });
});
