// Jest + RNTL [SPEC-3303] — zone de saisie du tuteur (EF-5, ET-4, CL-2).
import { fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';

import { Composer } from '../../src/features/tuteur/Composer';
import { expectAccessible } from '../utils/expectAccessible';

function renderComposer(element: ReactElement) {
  return render(element);
}

describe('[SPEC-3303] zone de saisie du tuteur', () => {
  it('désactive l’envoi tant que la question est vide (EF-5)', async () => {
    const view = await renderComposer(
      <Composer
        value=""
        onChangeText={() => undefined}
        onSend={() => undefined}
        onStop={() => undefined}
        busy={false}
      />,
    );
    expect(view.getByTestId('tutor-send').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    expectAccessible(view, 'tutor-send', { role: 'button', label: 'Envoyer' });
    expectAccessible(view, 'tutor-input', { label: 'Votre question au tuteur' });
  });

  it('active l’envoi et transmet la question (EF-5, CL-2)', async () => {
    const onSend = jest.fn();
    const view = await renderComposer(
      <Composer
        value="Pourquoi deux dates ?"
        onChangeText={() => undefined}
        onSend={onSend}
        onStop={() => undefined}
        busy={false}
      />,
    );
    expect(view.getByTestId('tutor-send').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: false }),
    );
    await fireEvent.press(view.getByTestId('tutor-send'));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('remplace l’envoi par « Arrêter » pendant le flux (ET-2)', async () => {
    const onStop = jest.fn();
    const view = await renderComposer(
      <Composer
        value="Question"
        onChangeText={() => undefined}
        onSend={() => undefined}
        onStop={onStop}
        busy
      />,
    );
    expect(view.queryByTestId('tutor-send')).toBeNull();
    expect(view.getByTestId('tutor-stop')).toHaveTextContent('Arrêter');
    await fireEvent.press(view.getByTestId('tutor-stop'));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('garde la saisie visible et plafonne la hauteur du champ (ET-4)', async () => {
    const view = await renderComposer(
      <Composer
        value="ligne"
        onChangeText={() => undefined}
        onSend={() => undefined}
        onStop={() => undefined}
        busy={false}
      />,
    );
    const input = view.getByTestId('tutor-input');
    expect(input.props.multiline).toBe(true);
    // Le champ grandit jusqu'à cinq lignes puis défile : la saisie reste au-dessus du clavier.
    await fireEvent(input, 'contentSizeChange', {
      nativeEvent: { contentSize: { height: 400, width: 300 } },
    });
    const grown = view.getByTestId('tutor-input');
    const flattened = StyleSheet.flatten(grown.props.style as never) as { height?: number };
    expect(flattened.height).toBeLessThanOrEqual(5 * 21 + 2 * 16);
  });
});
