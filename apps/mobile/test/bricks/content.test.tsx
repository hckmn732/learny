// Jest + RNTL [SPEC-3301] — content bricks, hand-offs and refused charges (EF-7, CL-1, CL-2).
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { BrickPublic } from '@learny/bricks';

import { BrickView } from '../../src/bricks';
import { parsePublicPayload } from '../../src/bricks/public-schemas';
import { WEB_ONLY_BRICK_TYPES } from '../../src/bricks/registry';
import { showcaseFor } from '../../src/bricks/showcase';
import { expectAccessible } from '../utils/expectAccessible';

import { brickOf, invalidBrick } from './support';

describe('[SPEC-3301] briques de contenu', () => {
  it('[SPEC-3301] un texte rend son titre, son Markdown et ses sources (EF-7)', async () => {
    const entry = showcaseFor('text');
    const parsed = parsePublicPayload('text', entry.brick.publicPayload);
    if (!parsed.ok) throw new Error('the example charge must parse');
    await render(<BrickView brick={entry.brick} mode="read" />);
    expect(screen.getByTestId('brick-text')).toBeTruthy();
    expect(screen.getByTestId('brick-text-markdown')).toBeTruthy();
    if (parsed.payload.title !== undefined) {
      expect(screen.getByTestId('brick-text-title')).toBeTruthy();
    }
  });

  it('[SPEC-3301] un extrait montre sa référence et ouvre sa ressource (BR-COU-02)', async () => {
    const entry = showcaseFor('resource_excerpt');
    const parsed = parsePublicPayload('resource_excerpt', entry.brick.publicPayload);
    if (!parsed.ok) throw new Error('the example charge must parse');
    const onOpenResource = jest.fn();
    await render(<BrickView brick={entry.brick} mode="read" onOpenResource={onOpenResource} />);
    expect(screen.getByTestId('brick-excerpt-location')).toBeTruthy();
    expectAccessible(screen, 'brick-resource-link', { role: 'link' });
    await fireEvent.press(screen.getByTestId('brick-resource-link'));
    expect(onOpenResource).toHaveBeenCalledWith(parsed.payload.resourceId);
  });

  it('[SPEC-3301] les quatre types hors périmètre renvoient au web (CL-1, ADR-3009 § 2)', async () => {
    const onOpenWeb = jest.fn();
    for (const type of WEB_ONLY_BRICK_TYPES) {
      await render(<BrickView brick={brickOf(type)} mode="read" onOpenWeb={onOpenWeb} />);
      expect(screen.getByTestId(`brick-${type}`)).toBeTruthy();
      expect(screen.getByText('Cette activité se fait sur le web')).toBeTruthy();
      await fireEvent.press(screen.getByTestId('brick-web-link'));
    }
    expect(onOpenWeb).toHaveBeenCalledTimes(WEB_ONLY_BRICK_TYPES.length);
  });

  it('[SPEC-3301] un type inconnu du client affiche la carte de renvoi (CL-1)', async () => {
    const unknown = {
      brickId: 'inconnu',
      versionId: 'inconnu',
      type: 'nouveau_type',
      notionIds: [],
      publicPayload: {},
    } as unknown as BrickPublic;
    await render(<BrickView brick={unknown} mode="read" />);
    expect(screen.getByText('Cette activité se fait sur le web')).toBeTruthy();
  });

  it('[SPEC-3301] une charge invalide ne casse rien et le dit (CL-2, BR-BRI-02)', async () => {
    for (const type of ['choice_question', 'cloze', 'matching', 'text'] as const) {
      await render(<BrickView brick={invalidBrick(type)} mode="read" />);
      expect(screen.getByText('Ce contenu ne peut pas être affiché')).toBeTruthy();
    }
  });
});
