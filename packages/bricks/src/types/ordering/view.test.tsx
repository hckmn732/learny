// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OrderingView } from '@learny/bricks/view';

import { cleanup, renderComponent, screen } from '../../test-render';

afterEach(cleanup);

const BRICK = {
  versionId: '00000000-0000-4000-8000-000000000503',
  type: 'ordering' as const,
  notionLabels: [],
  publicPayload: {
    instruction: 'Remettez dans l’ordre.',
    items: [
      { id: 'a', text: 'Un' },
      { id: 'b', text: 'Deux' },
      { id: 'c', text: 'Trois' },
    ],
    sources: [],
  },
};

describe('[SPEC-503] vue remise en ordre', () => {
  it('descend avec le bouton et désactive les extrémités (EF-6)', async () => {
    const onChange = vi.fn();
    const { user } = renderComponent(
      <OrderingView brick={BRICK} onChange={onChange} status="idle" value={null} variant="game" />,
    );
    expect(screen.getByTestId<HTMLButtonElement>('brick-move-up-a').disabled).toBe(true);
    expect(screen.getByTestId<HTMLButtonElement>('brick-move-down-c').disabled).toBe(true);
    await user.click(screen.getByTestId('brick-move-down-a'));
    expect(onChange).toHaveBeenCalledWith({ order: ['b', 'a', 'c'] });
  });

  it('déplace la ligne focalisée avec Alt+Flèche (EF-6)', async () => {
    const onChange = vi.fn();
    const { user } = renderComponent(
      <OrderingView brick={BRICK} onChange={onChange} status="idle" value={null} variant="game" />,
    );
    screen.getByTestId('brick-move-down-b').focus();
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(onChange).toHaveBeenCalledWith({ order: ['b', 'a', 'c'] });
  });
});
