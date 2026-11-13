// Testing Library helper of the brick views. It lives in src so the boundary rule keeps
// `@learny/testing` (which depends on db and services) out of the bricks package.
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import type { ReactElement } from 'react';

export { cleanup, screen } from '@testing-library/react';
export type { RenderResult } from '@testing-library/react';

export function renderComponent(
  ui: ReactElement,
  options?: RenderOptions,
): RenderResult & { user: UserEvent } {
  return { user: userEvent.setup(), ...render(ui, options) };
}
