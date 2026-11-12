// @vitest-environment jsdom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { PageHeader } from './PageHeader';

afterEach(cleanup);

describe('[SPEC-303] PageHeader', () => {
  it('empile fil d’Ariane, sur-titre et titre 34 px (EF-16)', () => {
    renderComponent(
      <PageHeader
        actions={<button type="button">Action</button>}
        breadcrumb={<span data-testid="crumb">Programme / Cours</span>}
        data-testid="page-header"
        eyebrow="SAP S/4HANA Finance"
        title="Mes lacunes"
      />,
    );
    const header = screen.getByTestId('page-header');
    expect(header.tagName).toBe('HEADER');
    const title = screen.getByRole('heading', { level: 1, name: 'Mes lacunes' });
    expect(title.className).toContain('font-display');
    expect(title.className).toContain('text-34');
    expect(title.className).toContain('tracking-title');
    expect(screen.getByText('SAP S/4HANA Finance').className).toContain('text-14');
    const crumb = screen.getByTestId('crumb');
    const eyebrow = screen.getByText('SAP S/4HANA Finance');
    expect(crumb.compareDocumentPosition(eyebrow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Action' })).toBeTruthy();
  });
});
