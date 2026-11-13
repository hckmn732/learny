// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { InstructionResponse } from '@learny/bricks/view';
import { InstructionView } from '@learny/bricks/view';

import { cleanup, renderComponent, screen } from '../../test-render';

afterEach(cleanup);

const BRICK = {
  versionId: '00000000-0000-4000-8000-000000000503',
  type: 'instruction' as const,
  notionLabels: ['Équilibre d’une pièce'],
  publicPayload: {
    title: 'Saisir une pièce équilibrée',
    taskMd: 'Saisissez la pièce comptable correspondante.',
    data: ['Société FR01'],
    deliverable: 'Une pièce équilibrée.',
    production: {
      kind: 'table' as const,
      fields: [],
      columns: [
        {
          key: 'cle',
          label: 'Clé',
          type: 'select' as const,
          options: [
            { value: '40', label: '40 · débit' },
            { value: '50', label: '50 · crédit' },
          ],
        },
        { key: 'montant', label: 'Montant (€)', type: 'number' as const },
      ],
      minRows: 2,
      maxRows: 4,
      initialRows: 2,
      checks: [
        {
          type: 'sum_equal' as const,
          numberColumn: 'montant',
          groupColumn: 'cle',
          left: ['40'],
          right: ['50'],
          leftLabel: 'Débit',
          rightLabel: 'Crédit',
          sideColumnLabel: 'Sens',
        },
      ],
    },
    explanationPrompt: 'Expliquez pourquoi.',
    hintsCount: 2,
    criteria: [{ key: 'equilibre', label: 'Pièce équilibrée', points: 10 }],
    estimatedMinutes: 15,
    passPoints: 8,
    sources: [],
  },
};

function value(rows: InstructionResponse['rows']): InstructionResponse {
  return { fields: {}, rows, explanation: '' };
}

const BALANCED = value([
  { cle: '40', montant: '120' },
  { cle: '50', montant: '120' },
]);

describe('[SPEC-503] vue consigne', () => {
  it('affiche les totaux en direct et l’état équilibré (EF-10)', () => {
    renderComponent(
      <InstructionView
        brick={BRICK}
        onChange={() => {}}
        status="answered"
        value={BALANCED}
        variant="exercise"
      />,
    );
    const state = screen.getByTestId('brick-table-state');
    expect(state.textContent).toBe('✓ Pièce équilibrée');
    expect(state.className).toContain('bg-green-soft');
    expect(screen.getAllByText('120 €').length).toBeGreaterThan(0);
  });

  it('affiche l’écart quand les totaux diffèrent (EF-10)', () => {
    renderComponent(
      <InstructionView
        brick={BRICK}
        onChange={() => {}}
        status="answered"
        value={value([
          { cle: '40', montant: '120' },
          { cle: '50', montant: '100' },
        ])}
        variant="exercise"
      />,
    );
    expect(screen.getByTestId('brick-table-state').textContent).toBe('Écart : 20 €');
  });

  it('cache Ajouter au maximum et Retirer au minimum (CL-7)', () => {
    const max = value([
      { cle: '40', montant: '1' },
      { cle: '50', montant: '1' },
      { cle: '40', montant: '1' },
      { cle: '50', montant: '1' },
    ]);
    const { unmount } = renderComponent(
      <InstructionView
        brick={BRICK}
        onChange={() => {}}
        status="idle"
        value={max}
        variant="exercise"
      />,
    );
    expect(screen.queryByTestId('brick-table-add-row')).toBeNull();
    unmount();

    renderComponent(
      <InstructionView
        brick={BRICK}
        onChange={() => {}}
        status="idle"
        value={BALANCED}
        variant="exercise"
      />,
    );
    expect(screen.queryByTestId('brick-table-remove-0')).toBeNull();
  });

  it('propose des indices et la soumission (EF-10)', async () => {
    const onHintRequest = vi.fn();
    const { user } = renderComponent(
      <InstructionView
        brick={BRICK}
        hints={['Commencez par les frais bancaires.']}
        hintsUsed={1}
        onChange={() => {}}
        onHintRequest={onHintRequest}
        status="idle"
        value={BALANCED}
        variant="exercise"
      />,
    );
    expect(screen.getByTestId('brick-instruction-hint').textContent).toContain('Indice 1');
    await user.click(screen.getByTestId('brick-instruction-hint-request'));
    expect(onHintRequest).toHaveBeenCalledTimes(1);
  });
});
