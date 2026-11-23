// Jest + RNTL [SPEC-3301] — the choice question (EF-2, CA-3, BR-MEM-10).
import { fireEvent, render, screen } from '@testing-library/react-native';

import { BrickView } from '../../src/bricks';
import { parsePublicPayload } from '../../src/bricks/public-schemas';
import { showcaseFor } from '../../src/bricks/showcase';
import { expectAccessible } from '../utils/expectAccessible';

const entry = showcaseFor('choice_question');

function charge() {
  const parsed = parsePublicPayload('choice_question', entry.brick.publicPayload);
  if (!parsed.ok) throw new Error('the example charge must parse');
  return parsed.payload;
}

describe('[SPEC-3301] question à choix', () => {
  it('[SPEC-3301] affiche l’énoncé, la consigne et les options lettres A à D (EF-2)', async () => {
    await render(<BrickView brick={entry.brick} mode="read" />);
    expect(screen.getByTestId('brick-choice_question')).toBeTruthy();
    expect(screen.getByText(charge().stem)).toBeTruthy();
    expect(screen.getByTestId('brick-consigne')).toBeTruthy();
    expect(screen.getByTestId('brick-option-0')).toBeTruthy();
    expect(screen.getByTestId('brick-option-1')).toBeTruthy();
  });

  it('[SPEC-3301] une option est un bouton radio et la sélection part au parent (EF-2, ET-4)', async () => {
    const onResponse = jest.fn();
    await render(
      <BrickView
        brick={entry.brick}
        mode="play"
        onResponse={onResponse}
        response={{ optionIds: [] }}
      />,
    );
    expectAccessible(screen, 'brick-option-0', { role: 'radio' });
    await fireEvent.press(screen.getByTestId('brick-option-0'));
    expect(onResponse).toHaveBeenCalledWith({ optionIds: [charge().options[0]?.id] });
  });

  it('[SPEC-3301] en lecture une option ne répond pas (EF-1)', async () => {
    const onResponse = jest.fn();
    await render(<BrickView brick={entry.brick} mode="read" onResponse={onResponse} />);
    await fireEvent.press(screen.getByTestId('brick-option-0'));
    expect(onResponse).not.toHaveBeenCalled();
  });

  it('[SPEC-3301] aucune bonne réponse ni explication avant la correction (CA-3, ET-2)', async () => {
    await render(<BrickView brick={entry.brick} mode="play" />);
    expect(screen.queryByTestId('brick-feedback')).toBeNull();
    const correction = entry.outcome?.correction;
    if (correction?.kind === 'choice_question') {
      expect(screen.queryByText(correction.explanation)).toBeNull();
    }
    expect(JSON.stringify(entry.brick.publicPayload)).not.toContain('correct');
  });

  it('[SPEC-3301] corrigée, la bonne option est marquée et l’explication s’affiche (BR-MEM-10)', async () => {
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
    const correction = entry.outcome?.correction;
    if (correction?.kind === 'choice_question') {
      expect(screen.getByText(correction.explanation)).toBeTruthy();
    }
  });
});
