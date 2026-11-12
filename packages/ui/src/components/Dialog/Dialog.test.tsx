// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './Dialog';

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
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: () => undefined,
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

afterEach(cleanup);

function RichDialog({ onOpenChange }: Readonly<{ onOpenChange?: (open: boolean) => void }>) {
  const first = useRef<HTMLButtonElement>(null);
  return (
    <Dialog onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button data-testid="trigger" type="button">
          Ouvrir
        </button>
      </DialogTrigger>
      <DialogContent data-testid="dialog" initialFocusRef={first}>
        <DialogTitle>Reporter la séance</DialogTitle>
        <DialogDescription>La séance sera reportée à jeudi.</DialogDescription>
        <button ref={first} type="button">
          Premier
        </button>
        <button type="button">Dernier</button>
      </DialogContent>
    </Dialog>
  );
}

describe('[SPEC-303] Dialog', () => {
  it('piège le focus, expose son libellé et rend le focus au déclencheur (CA-2, CL-2)', async () => {
    const onOpenChange = vi.fn();
    const { user } = renderComponent(<RichDialog onOpenChange={onOpenChange} />);
    const trigger = screen.getByTestId('trigger');
    await user.click(trigger);

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(document.activeElement?.textContent).toBe('Premier');
    });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Reporter la séance' }).className).toContain(
      'font-display',
    );

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('ferme avec le bouton Fermer et bloque le défilement du fond (EF-8)', async () => {
    const { user } = renderComponent(<RichDialog />);
    await user.click(screen.getByTestId('trigger'));
    await screen.findByRole('dialog');
    expect(document.body.style.overflow).toBe('hidden');
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
