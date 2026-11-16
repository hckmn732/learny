// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { ResponsivePanel } from './ResponsivePanel';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
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
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: () => undefined,
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

afterEach(cleanup);

function Harness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Ouvrir
      </button>
      <ResponsivePanel
        open={open}
        onOpenChange={setOpen}
        title="Notifications"
        testId="responsive-panel"
        returnFocusRef={triggerRef}
      >
        <p>Contenu</p>
      </ResponsivePanel>
    </div>
  );
}

describe('[SPEC-802] ResponsivePanel', () => {
  it('affiche le titre, le contenu et un bouton Fermer de la taille tactile', async () => {
    renderComponent(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    await waitFor(() => {
      expect(screen.getByTestId('responsive-panel')).toBeTruthy();
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Notifications')).toBeTruthy();
    expect(screen.getByText('Contenu')).toBeTruthy();
    const close = screen.getByTestId('panel-close');
    expect(close.getAttribute('aria-label')).toBe('Fermer');
    expect(close.className).toContain('touch-target');
    // Below sm the panel is full screen; the lateral geometry starts at 768 px.
    expect(screen.getByTestId('responsive-panel').className).toContain('inset-0');
    expect(screen.getByTestId('responsive-panel').className).toContain('sm:w-[var(--panel-width)]');
  });

  it('ferme par le bouton et rend le focus au déclencheur', async () => {
    renderComponent(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Ouvrir' });
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => {
      expect(screen.getByTestId('panel-close')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('panel-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('responsive-panel')).toBeNull();
    });
    expect(document.activeElement).toBe(trigger);
  });
});
