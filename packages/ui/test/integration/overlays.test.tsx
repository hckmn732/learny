// @vitest-environment jsdom
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { renderComponent } from '@learny/testing/render';
import {
  Card,
  CardHeader,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  PageHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  StatCard,
  StatRow,
  ToastProvider,
  toast,
} from '@learny/ui';
import { zIndex } from '@learny/ui/tokens';

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

function ComposedPage() {
  return (
    <ToastProvider>
      <PageHeader eyebrow="SAP S/4HANA Finance" title="Mes lacunes" />
      <StatRow>
        <StatCard label="à consolider" tone="dark" value="4 notions" />
        <StatCard label="maîtrisées" value="23 notions" />
      </StatRow>
      <Card data-testid="card" labelledBy="card-title">
        <CardHeader title="Lacunes récentes" titleId="card-title" />
      </Card>
      <Dialog defaultOpen>
        <DialogContent data-testid="dialog">
          <DialogTitle>Reporter la séance</DialogTitle>
          <DialogDescription>La séance sera reportée à jeudi.</DialogDescription>
        </DialogContent>
      </Dialog>
    </ToastProvider>
  );
}

describe('[SPEC-303] superpositions', () => {
  it('ordonne les z-index, n’ouvre qu’un aria-modal et bloque puis rétablit le défilement', async () => {
    const { unmount } = renderComponent(<ComposedPage />);

    const dialog = screen.getByTestId('dialog');
    await waitFor(() => {
      expect(dialog.getAttribute('aria-modal')).toBe('true');
    });
    expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(1);
    expect(dialog.className).toContain('z-dialog');
    expect(document.body.style.overflow).toBe('hidden');

    const viewport = document.querySelector('.z-toast');
    expect(viewport).toBeTruthy();
    expect(viewport?.className).toContain('z-toast');

    act(() => {
      toast({ title: 'Révision enregistrée', tone: 'success' });
    });
    expect(await screen.findByText('Révision enregistrée')).toBeTruthy();
    expect(document.body.contains(screen.getByTestId('ui-toast-success'))).toBe(true);

    expect(zIndex.header).toBeLessThan(zIndex.popover);
    expect(zIndex.popover).toBeLessThan(zIndex.drawer);
    expect(zIndex.drawer).toBeLessThan(zIndex.dialog);
    expect(zIndex.dialog).toBeLessThan(zIndex.toast);
    expect(zIndex.toast).toBeLessThan(zIndex.skip);

    unmount();
    await waitFor(() => {
      expect(document.body.style.overflow).not.toBe('hidden');
    });
  });

  it('maintient le panneau et le menu dans le corps du document (ET-2)', () => {
    renderComponent(
      <Popover defaultOpen>
        <PopoverTrigger asChild>
          <button type="button">Ouvrir</button>
        </PopoverTrigger>
        <PopoverContent data-testid="portal-popover">
          <p>Contenu</p>
        </PopoverContent>
      </Popover>,
    );
    const popover = screen.getByTestId('portal-popover');
    expect(popover.className).toContain('z-popover');
    expect(popover.parentElement?.parentElement).toBe(document.body);
  });
});
