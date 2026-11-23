// Jest + RNTL [SPEC-3301] — cloze and open question (EF-3, EF-4, CL-3).
import { fireEvent, render, screen } from '@testing-library/react-native';

import { BrickView } from '../../src/bricks';
import { parsePublicPayload } from '../../src/bricks/public-schemas';
import { showcaseFor } from '../../src/bricks/showcase';
import { expectAccessible } from '../utils/expectAccessible';

describe('[SPEC-3301] saisies de texte', () => {
  it('[SPEC-3301] texte à trous : un champ par trou, largeur adaptée et correction par trou (EF-4)', async () => {
    const entry = showcaseFor('cloze');
    const parsed = parsePublicPayload('cloze', entry.brick.publicPayload);
    if (!parsed.ok) throw new Error('the example charge must parse');
    const onResponse = jest.fn();
    await render(
      <BrickView brick={entry.brick} mode="play" onResponse={onResponse} response={{ gaps: {} }} />,
    );
    expect(screen.getByTestId('brick-gap-0')).toBeTruthy();
    expectAccessible(screen, 'brick-gap-0', {
      label: `Trou 1 sur ${String(parsed.payload.gaps.length)}`,
    });
    await fireEvent.changeText(screen.getByTestId('brick-gap-0'), 'débit');
    expect(onResponse).toHaveBeenCalledWith({
      gaps: { [String(parsed.payload.gaps[0]?.id)]: 'débit' },
    });
  });

  it('[SPEC-3301] texte à trous corrigé : la réponse attendue est affichée (BR-MEM-10)', async () => {
    const entry = showcaseFor('cloze');
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

  it('[SPEC-3301] question ouverte : compteur de caractères et note du tuteur (EF-3)', async () => {
    const entry = showcaseFor('open_question');
    const parsed = parsePublicPayload('open_question', entry.brick.publicPayload);
    if (!parsed.ok) throw new Error('the example charge must parse');
    const onResponse = jest.fn();
    await render(<BrickView brick={entry.brick} mode="play" onResponse={onResponse} response="" />);
    expect(screen.getByTestId('brick-open_question-counter')).toBeTruthy();
    expect(
      screen.getByText(`0 / ${String(parsed.payload.answerMaxChars)} caractères`),
    ).toBeTruthy();
    expect(screen.getByTestId('brick-open_question-tutor')).toBeTruthy();
    await fireEvent.changeText(
      screen.getByTestId('brick-open_question-input'),
      'La partie double.',
    );
    expect(onResponse).toHaveBeenCalledWith('La partie double.');
  });

  it('[SPEC-3301] question ouverte : le champ est multiligne et borné (EF-3, CL-3)', async () => {
    const entry = showcaseFor('open_question');
    const parsed = parsePublicPayload('open_question', entry.brick.publicPayload);
    if (!parsed.ok) throw new Error('the example charge must parse');
    await render(<BrickView brick={entry.brick} mode="play" response="" />);
    const field = screen.getByTestId('brick-open_question-input');
    expect(field.props.multiline).toBe(true);
    expect(field.props.maxLength).toBe(parsed.payload.answerMaxChars);
  });
});
