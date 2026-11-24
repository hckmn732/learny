// Vitest [SPEC-3301] — state machines of the board games (EF-5, CA-4, CL-4).
import { describe, expect, it } from 'vitest';

import {
  assign,
  emptyCategorization,
  emptyMatching,
  emptyOrdering,
  moveDown,
  moveItem,
  moveUp,
  swapItems,
  tapCategory,
  tapItem,
  tapLeft,
  tapOrderingItem,
  tapRight,
} from './games';

describe('[SPEC-3301] jeux jouables par appuis successifs', () => {
  it('[SPEC-3301] association : sélectionner une notion puis une définition la place (CA-4)', () => {
    const start = emptyMatching(['l1', 'l2']);
    const selected = tapLeft(start, 'l1');
    expect(selected.selectedLeft).toBe('l1');
    const placed = tapRight(selected, 'r2');
    expect(placed.pairs).toEqual({ l1: 'r2', l2: null });
    expect(placed.selectedLeft).toBeNull();
  });

  it('[SPEC-3301] association : toucher la même définition la retire', () => {
    const placed = tapRight(tapLeft(emptyMatching(['l1']), 'l1'), 'r2');
    const cleared = tapRight(tapLeft(placed, 'l1'), 'r2');
    expect(cleared.pairs['l1']).toBeNull();
  });

  it('[SPEC-3301] association : sans notion sélectionnée rien ne bouge', () => {
    const start = emptyMatching(['l1']);
    expect(tapRight(start, 'r1')).toBe(start);
  });

  it('[SPEC-3301] remise en ordre : deux appuis échangent deux positions (CA-4)', () => {
    const start = emptyOrdering(['i1', 'i2', 'i3']);
    const selected = tapOrderingItem(start, 'i1');
    expect(selected.selected).toBe('i1');
    const swapped = tapOrderingItem(selected, 'i3');
    expect(swapped.order).toEqual(['i3', 'i2', 'i1']);
    expect(swapped.selected).toBeNull();
  });

  it('[SPEC-3301] remise en ordre : toucher deux fois le même élément le désélectionne', () => {
    const start = emptyOrdering(['i1', 'i2']);
    expect(tapOrderingItem(tapOrderingItem(start, 'i1'), 'i1').selected).toBeNull();
  });

  it('[SPEC-3301] remise en ordre : monter et descendre d’une position (ET-4)', () => {
    const start = emptyOrdering(['i1', 'i2', 'i3']);
    expect(moveUp(start, 'i3').order).toEqual(['i1', 'i3', 'i2']);
    expect(moveDown(start, 'i1').order).toEqual(['i2', 'i1', 'i3']);
    expect(moveDown(emptyOrdering(['i1', 'i2']), 'i2').order).toEqual(['i1', 'i2']);
  });

  it('[SPEC-3301] remise en ordre : un glisser interrompu ne change rien (CL-4)', () => {
    const start = emptyOrdering(['i1', 'i2', 'i3']);
    // The drag path only moves on release: a cancelled gesture is the state it started from.
    expect(start.order).toEqual(['i1', 'i2', 'i3']);
    expect(moveItem(start.order, 0, 0)).toEqual(['i1', 'i2', 'i3']);
    expect(swapItems(start.order, 'i1', 'i1')).toEqual(['i1', 'i2', 'i3']);
    expect(moveItem(start.order, 0, 9)).toEqual(['i1', 'i2', 'i3']);
    expect(moveItem(start.order, -1, 2)).toEqual(['i1', 'i2', 'i3']);
  });

  it('[SPEC-3301] classement : un appui sur l’élément puis sur la catégorie le range (CA-4)', () => {
    const start = emptyCategorization(['i1', 'i2']);
    const selected = tapItem(start, 'i1');
    expect(selected.selectedItem).toBe('i1');
    const filed = tapCategory(selected, 'c1');
    expect(filed.assignments).toEqual({ i1: 'c1', i2: null });
    expect(filed.selectedItem).toBeNull();
  });

  it('[SPEC-3301] classement : la même catégorie retire l’élément', () => {
    const filed = tapCategory(tapItem(emptyCategorization(['i1']), 'i1'), 'c1');
    const removed = tapCategory(tapItem(filed, 'i1'), 'c1');
    expect(removed.assignments['i1']).toBeNull();
  });

  it('[SPEC-3301] classement : sans élément sélectionné rien ne bouge', () => {
    const start = emptyCategorization(['i1']);
    expect(tapCategory(start, 'c1')).toBe(start);
    expect(assign(start, 'i1', 'c2').assignments).toEqual({ i1: 'c2' });
  });
});
