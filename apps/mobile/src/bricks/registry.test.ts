// Vitest [SPEC-3301] — completeness of the native registry (CA-1, ET-1, BR-BRI-01).
import { describe, expect, it } from 'vitest';

import { BRICK_TYPES } from '@learny/bricks';

import {
  BRICK_RENDERERS,
  isNativeBrickType,
  isWebOnlyBrickType,
  NATIVE_BRICK_TYPES,
  WEB_ONLY_BRICK_TYPES,
} from './registry';

describe('[SPEC-3301] registre natif des briques', () => {
  it('[SPEC-3301] couvre les treize types de BRICK_TYPES (CA-1, BR-BRI-01)', () => {
    expect(BRICK_TYPES).toHaveLength(13);
    expect(Object.keys(BRICK_RENDERERS).sort()).toEqual([...BRICK_TYPES].sort());
  });

  it('[SPEC-3301] rend neuf types nativement et renvoie quatre types au web (ADR-3009 § 2)', () => {
    expect(NATIVE_BRICK_TYPES).toHaveLength(9);
    expect(WEB_ONLY_BRICK_TYPES).toHaveLength(4);
    expect([...NATIVE_BRICK_TYPES, ...WEB_ONLY_BRICK_TYPES].sort()).toEqual(
      [...BRICK_TYPES].sort(),
    );
    expect(NATIVE_BRICK_TYPES.filter((type) => WEB_ONLY_BRICK_TYPES.includes(type))).toEqual([]);
  });

  it('[SPEC-3301] annonce le rendu de chaque type, sans contradiction (ET-1)', () => {
    for (const type of NATIVE_BRICK_TYPES) {
      expect(BRICK_RENDERERS[type]).toBe('native');
      expect(isNativeBrickType(type)).toBe(true);
      expect(isWebOnlyBrickType(type)).toBe(false);
    }
    for (const type of WEB_ONLY_BRICK_TYPES) {
      expect(BRICK_RENDERERS[type]).toBe('web');
      expect(isWebOnlyBrickType(type)).toBe(true);
      expect(isNativeBrickType(type)).toBe(false);
    }
  });

  it('[SPEC-3301] les cinq types de jeu et la carte de rappel sont natifs (BR-MEM-05)', () => {
    for (const type of [
      'matching',
      'ordering',
      'categorization',
      'cloze',
      'recall_card',
    ] as const) {
      expect(isNativeBrickType(type)).toBe(true);
    }
  });
});
