// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { brickExamples, brickRegistry, BRICK_TYPES, type BrickType } from '@learny/bricks';
import type { BrickViewProps } from '@learny/bricks/view';
import { BrickRenderer, brickViews } from '@learny/bricks/view';

import type { BrickPublic } from '../public-brick';
import { cleanup, renderComponent } from '../test-render';

afterEach(cleanup);

function publicBrick(type: BrickType): BrickPublic {
  const payload = brickExamples[type].valid;
  return {
    brickId: `00000000-0000-4000-8000-${String(BRICK_TYPES.indexOf(type) + 1).padStart(12, '0')}`,
    versionId: `10000000-0000-4000-8000-${String(BRICK_TYPES.indexOf(type) + 1).padStart(12, '0')}`,
    type,
    notionIds: [],
    publicPayload: brickRegistry[type].toPublic(payload as never, 'seed'),
  };
}

function propsFor(type: BrickType): BrickViewProps<BrickType> {
  const brick = publicBrick(type);
  return {
    brick: {
      versionId: brick.versionId,
      type,
      notionLabels: ['Notion démo'],
      publicPayload: brick.publicPayload,
    },
    variant: 'course',
    value: null,
    status: 'idle',
  };
}

describe('[SPEC-503] registre des vues', () => {
  it('enregistre exactement une vue pour chacun des treize types (CA-1, BR-BRI-01)', () => {
    expect(Object.keys(brickViews).sort()).toEqual([...BRICK_TYPES].sort());
    expect(Object.keys(brickViews)).toHaveLength(13);
  });

  it.each([...BRICK_TYPES])('rend l’exemple valide de %s sans erreur (CA-1)', (type) => {
    const { container } = renderComponent(
      createElement(BrickRenderer as never, propsFor(type) as never),
    );
    expect(container.querySelector(`[data-testid="brick-${type}"]`)).not.toBeNull();
  });
});
