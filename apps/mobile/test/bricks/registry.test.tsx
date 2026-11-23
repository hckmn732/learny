// Jest + RNTL [SPEC-3301] — the registry binds all thirteen types (CA-1, ET-1, BR-BRI-01).
import { render, screen } from '@testing-library/react-native';

import { BRICK_TYPES } from '@learny/bricks';

import { BrickView } from '../../src/bricks';
import { showcaseFor } from '../../src/bricks/showcase';
import { nativeBrickViews } from '../../src/bricks/views';

import { brickOf } from './support';

describe('[SPEC-3301] registre des rendus natifs', () => {
  it('[SPEC-3301] le registre des composants couvre les treize types (CA-1)', () => {
    expect(Object.keys(nativeBrickViews).sort()).toEqual([...BRICK_TYPES].sort());
    for (const type of BRICK_TYPES) {
      expect(typeof nativeBrickViews[type]).toBe('function');
    }
  });

  it('[SPEC-3301] chaque exemple s’affiche en lecture sans erreur (CA-1, EF-8)', async () => {
    for (const type of BRICK_TYPES) {
      await render(<BrickView brick={brickOf(type)} mode="read" />);
      expect(screen.getByTestId(`brick-${type}`)).toBeTruthy();
    }
  });

  it('[SPEC-3301] chaque exemple s’affiche en jeu sans erreur (CA-1)', async () => {
    for (const type of BRICK_TYPES) {
      await render(<BrickView brick={brickOf(type)} mode="play" response={undefined} />);
      expect(screen.getByTestId(`brick-${type}`)).toBeTruthy();
    }
  });

  it('[SPEC-3301] chaque correction de type s’affiche en corrigé (CA-1)', async () => {
    for (const type of BRICK_TYPES) {
      const entry = showcaseFor(type);
      const correction = entry.correction ?? undefined;
      const response = entry.response ?? undefined;
      await render(
        <BrickView brick={brickOf(type)} correction={correction} mode="play" response={response} />,
      );
      expect(screen.getByTestId(`brick-${type}`)).toBeTruthy();
    }
  });
});
