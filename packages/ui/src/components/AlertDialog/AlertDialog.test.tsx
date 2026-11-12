// @vitest-environment jsdom
import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { renderComponent } from '@learny/testing/render';

import { Button } from '../Button';

import { AlertDialog } from './AlertDialog';

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

function DestructiveAlert({ onConfirm }: Readonly<{ onConfirm: () => void | Promise<void> }>) {
  return (
    <AlertDialog
      data-testid="alert"
      trigger={
        <Button data-testid="alert-trigger" variant="danger">
          Archiver
        </Button>
      }
      title="Archiver cette formation ?"
      description="Cette action est réversible."
      confirmLabel="Archiver"
      destructive
      onConfirm={onConfirm}
    />
  );
}

describe('[SPEC-303] AlertDialog', () => {
  it('place le focus sur Annuler et ferme sans confirmer (EF-9)', async () => {
    const onConfirm = vi.fn();
    const { user } = renderComponent(<DestructiveAlert onConfirm={onConfirm} />);
    const trigger = screen.getByTestId('alert-trigger');
    await user.click(trigger);
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId('ui-alert-dialog-cancel'));
    });
    expect(screen.queryByRole('button', { name: 'Fermer' })).toBeNull();
    expect(screen.getByText('Archiver cette formation ?')).toBeTruthy();
    const dot = dialog.querySelector('span[aria-hidden="true"].bg-orange');
    expect(dot).toBeTruthy();
    const confirm = screen.getByTestId('ui-alert-dialog-confirm');
    expect(confirm.className).toContain('bg-ink');
    expect(confirm.querySelector('svg')).toBeTruthy();

    await user.click(screen.getByTestId('ui-alert-dialog-cancel'));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    expect(onConfirm).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('montre le chargement pendant une confirmation asynchrone (EF-9)', async () => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    const onConfirm = vi.fn(() => promise);
    const { user } = renderComponent(<DestructiveAlert onConfirm={onConfirm} />);
    await user.click(screen.getByTestId('alert-trigger'));
    await screen.findByRole('alertdialog');
    const confirm = screen.getByTestId('ui-alert-dialog-confirm');
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(confirm.getAttribute('aria-busy')).toBe('true');
    expect(confirm.textContent).toContain('Chargement…');
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    resolve();
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
  });
});
