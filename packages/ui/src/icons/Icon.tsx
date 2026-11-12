import type { ComponentProps } from 'react';

import { iconRegistry, type IconName } from './registry';

export type IconProps = Omit<ComponentProps<'svg'>, 'ref' | 'name'> & {
  name: IconName;
  /** Mockup size in pixels (EF-17). */
  size?: number;
  strokeWidth?: number;
};

/** Named icon of the registry; it is always decorative (the control carries the name). */
export const Icon = ({ name, size = 18, strokeWidth = 1.8, ...props }: IconProps) => {
  const Component = iconRegistry[name];
  return <Component size={size} strokeWidth={strokeWidth} {...props} aria-hidden="true" />;
};
