// Jest + RNTL [SPEC-3301] — the three board games played by successive taps (EF-5, CA-4, ET-4).
import { fireEvent, render, screen } from '@testing-library/react-native';

import { BrickView } from '../../src/bricks';
import { parsePublicPayload } from '../../src/bricks/public-schemas';
import { showcaseFor } from '../../src/bricks/showcase';
import { expectAccessible } from '../utils/expectAccessible';

describe('[SPEC-3301] jeux jouables sans glisser', () => {
  it('[SPEC-3301] association : deux appuis placent une définition (CA-4)', async () => {
    const entry = showcaseFor('matching');
    const parsed = parsePublicPayload('matching', entry.brick.publicPayload);
    if (!parsed.ok) throw new Error('the example charge must parse');
    const left = parsed.payload.lefts[0]?.id ?? '';
    const right = parsed.payload.rights[0]?.id ?? '';
    const onResponse = jest.fn();
    await render(
      <BrickView
        brick={entry.brick}
        mode="play"
        onResponse={onResponse}
        response={{ pairs: {} }}
      />,
    );
    expectAccessible(screen, `brick-item-${left}`, { role: 'button' });
    await fireEvent.press(screen.getByTestId(`brick-item-${left}`));
    await fireEvent.press(screen.getByTestId(`brick-item-${right}`));
    expect(onResponse).toHaveBeenCalledWith({
      pairs: expect.objectContaining({ [left]: right }) as unknown,
    });
    expect(screen.getByTestId('brick-live')).toBeTruthy();
  });

  it('[SPEC-3301] association corrigée : la bonne définition est rappelée (BR-MEM-10)', async () => {
    const entry = showcaseFor('matching');
    await render(
      <BrickView
        brick={entry.brick}
        correction={entry.correction ?? undefined}
        mode="play"
        response={entry.response}
      />,
    );
    expect(screen.getByTestId('brick-feedback')).toBeTruthy();
    expect(screen.getByText('Exact.')).toBeTruthy();
  });

  it('[SPEC-3301] remise en ordre : deux appuis échangent deux éléments (CA-4)', async () => {
    const entry = showcaseFor('ordering');
    const parsed = parsePublicPayload('ordering', entry.brick.publicPayload);
    if (!parsed.ok) throw new Error('the example charge must parse');
    const first = parsed.payload.items[0]?.id ?? '';
    const second = parsed.payload.items[1]?.id ?? '';
    const onResponse = jest.fn();
    await render(
      <BrickView
        brick={entry.brick}
        mode="play"
        onResponse={onResponse}
        response={{ order: parsed.payload.items.map((item) => item.id) }}
      />,
    );
    await fireEvent.press(screen.getByTestId(`brick-item-${first}`));
    await fireEvent.press(screen.getByTestId(`brick-item-${second}`));
    expect(onResponse).toHaveBeenCalledWith({
      order: [second, first, ...parsed.payload.items.slice(2).map((item) => item.id)],
    });
  });

  it('[SPEC-3301] remise en ordre : les boutons Monter et Descendre sont annoncés (ET-4)', async () => {
    const entry = showcaseFor('ordering');
    const parsed = parsePublicPayload('ordering', entry.brick.publicPayload);
    if (!parsed.ok) throw new Error('the example charge must parse');
    const first = parsed.payload.items[0]?.id ?? '';
    await render(
      <BrickView
        brick={entry.brick}
        mode="play"
        response={{ order: parsed.payload.items.map((item) => item.id) }}
      />,
    );
    expect(screen.getByTestId(`brick-move-down-${first}`)).toBeTruthy();
    expectAccessible(screen, `brick-move-down-${first}`, { role: 'button', label: 'Descendre' });
    expectAccessible(screen, `brick-move-up-${first}`, { role: 'button', label: 'Monter' });
  });

  it('[SPEC-3301] classement : un élément puis une catégorie le rangent (CA-4)', async () => {
    const entry = showcaseFor('categorization');
    const parsed = parsePublicPayload('categorization', entry.brick.publicPayload);
    if (!parsed.ok) throw new Error('the example charge must parse');
    const item = parsed.payload.items[0]?.id ?? '';
    const category = parsed.payload.categories[0]?.id ?? '';
    const onResponse = jest.fn();
    await render(
      <BrickView brick={entry.brick} mode="play" onResponse={onResponse} response={{}} />,
    );
    await fireEvent.press(screen.getByTestId(`brick-item-${item}`));
    await fireEvent.press(screen.getByTestId(`brick-category-${category}`));
    expect(onResponse).toHaveBeenCalledWith({
      assignments: expect.objectContaining({ [item]: category }) as unknown,
    });
    expect(screen.getByTestId('brick-live')).toBeTruthy();
  });
});
