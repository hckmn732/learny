// Rendering factory for React component tests (Testing Library + user-event).
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import type { ReactElement } from 'react';

export function renderComponent(
  ui: ReactElement,
  options?: RenderOptions,
): RenderResult & { user: UserEvent } {
  return { user: userEvent.setup(), ...render(ui, options) };
}
