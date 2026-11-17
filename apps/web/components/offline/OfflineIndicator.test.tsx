// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cleanup, renderComponent, screen, waitFor } from '@learny/testing/render';

import { OfflineIndicator } from './OfflineIndicator';

let online = true;
let pending = 0;

vi.mock('../../lib/offline/use-online-status', () => ({
  useOnlineStatus: () => online,
}));
vi.mock('../../lib/offline/queue', () => ({
  pendingCount: () => Promise.resolve(pending),
}));

beforeEach(() => {
  online = true;
  pending = 0;
});

afterEach(cleanup);

describe('[SPEC-801] indicateur hors ligne', () => {
  it('est absent en ligne sans file d’attente (EF-9)', async () => {
    renderComponent(<OfflineIndicator />);
    await waitFor(() => {
      expect(screen.queryByTestId('offline-indicator')).toBeNull();
    });
  });

  it('affiche « Hors ligne » hors réseau (EF-9)', async () => {
    online = false;
    renderComponent(<OfflineIndicator />);
    const indicator = await screen.findByTestId('offline-indicator');
    expect(indicator.getAttribute('role')).toBe('status');
    expect(indicator.textContent).toContain('Hors ligne');
  });

  it('affiche « n en attente » quand la file contient une entrée (EF-9)', async () => {
    pending = 2;
    renderComponent(<OfflineIndicator />);
    const count = await screen.findByTestId('offline-pending-count');
    expect(count.textContent).toBe('2 en attente');
    expect(screen.getByTestId('offline-indicator').getAttribute('role')).toBe('status');
  });
});
