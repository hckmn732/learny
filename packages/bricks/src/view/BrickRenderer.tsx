'use client';

import type { ComponentType } from 'react';

import type { BrickType } from '../brick-types';
import type { BrickViewProps } from '../view-types';

import { brickViews } from './registry';

/** Renders the view registered for the brick type (SPEC-503 EF-1, BR-BRI-01). */
export function BrickRenderer<T extends BrickType>(props: BrickViewProps<T>) {
  const View = brickViews[props.brick.type] as ComponentType<BrickViewProps<T>>;
  return <View {...props} />;
}
