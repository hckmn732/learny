// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { Popover, PopoverContent, PopoverTrigger } from './Popover';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  globalThis.ResizeObserver = ResizeObserverMock;
  Object.defineProperty(Element.prototype, 'hasPointerCapture', {
    configurable: true,
    value: () => false,
  });
  Object.defineProperty(Element.prototype, 'releasePointerCapture', {
    configurable: true,
    value: () => undefined,
  });
  Object.defineProperty(Element.prototype, 'setPointerCapture', {
    configurable: true,
    value: () => undefined,
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

afterEach(cleanup);

describe('[SPEC-303] Popover', () => {
  it('se ferme avec Échap et rend le focus au déclencheur (EF-6, CA-2)', async () => {
    const { user } = renderComponent(
      <Popover>
        <PopoverTrigger asChild>
          <button data-testid="popover-trigger" type="button">
            Notifications
          </button>
        </PopoverTrigger>
        <PopoverContent aria-labelledby="popover-title" data-testid="popover-content">
          <h2 id="popover-title">Notifications</h2>
          <p>Vos révisions dues.</p>
        </PopoverContent>
      </Popover>,
    );
    const trigger = screen.getByTestId('popover-trigger');
    await user.click(trigger);
    const content = await screen.findByTestId('popover-content');
    expect(content.getAttribute('aria-labelledby')).toBe('popover-title');
    expect(content.className).toContain('rounded-20');
    expect(content.className).toContain('shadow-popover');
    expect(content.className).toContain('w-[400px]');

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByTestId('popover-content')).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });
});
