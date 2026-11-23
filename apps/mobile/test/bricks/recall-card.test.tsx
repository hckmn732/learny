// Jest + RNTL [SPEC-3301] — recall card (EF-6, ET-4).
import { fireEvent, render, screen } from '@testing-library/react-native';

import { BrickView } from '../../src/bricks';
import { parsePublicPayload } from '../../src/bricks/public-schemas';
import { showcaseFor } from '../../src/bricks/showcase';
import { Text } from '../../src/ui';
import { expectAccessible } from '../utils/expectAccessible';

const entry = showcaseFor('recall_card');

describe('[SPEC-3301] carte de rappel', () => {
  it('[SPEC-3301] le recto invite à révéler et le verso montre la réponse (EF-6)', async () => {
    const parsed = parsePublicPayload('recall_card', entry.brick.publicPayload);
    if (!parsed.ok) throw new Error('the example charge must parse');
    await render(<BrickView brick={entry.brick} mode="play" />);
    expect(screen.getByTestId('brick-recall-front')).toBeTruthy();
    expect(screen.getByText(parsed.payload.front)).toBeTruthy();
    expect(screen.getByTestId('brick-recall-back-markdown')).toBeTruthy();
  });

  it('[SPEC-3301] le bouton « Révéler la réponse » retourne la carte (ET-4)', async () => {
    const parsed = parsePublicPayload('recall_card', entry.brick.publicPayload);
    if (!parsed.ok) throw new Error('the example charge must parse');
    await render(<BrickView brick={entry.brick} mode="play" />);
    expectAccessible(screen, 'brick-reveal', { role: 'button' });
    expect(screen.getAllByText('Révéler la réponse').length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByTestId('brick-reveal'));
    expect(screen.getByText('Masquer la réponse')).toBeTruthy();
    expect(screen.getByText(parsed.payload.back)).toBeTruthy();
  });

  it('[SPEC-3301] la carte annonce sa source et les boutons du parent (EF-6, BR-COU-02)', async () => {
    const parsed = parsePublicPayload('recall_card', entry.brick.publicPayload);
    if (!parsed.ok) throw new Error('the example charge must parse');
    await render(
      <BrickView
        actions={<Text testID="parent-actions">Je savais</Text>}
        brick={entry.brick}
        mode="play"
      />,
    );
    expect(screen.getByTestId('parent-actions')).toBeTruthy();
    if (parsed.payload.sourceLabel !== undefined) {
      expect(screen.getByText(`Source : ${parsed.payload.sourceLabel}`)).toBeTruthy();
    }
  });
});
