// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { cleanup, renderComponent, screen } from '@learny/testing/render';

import { LiveAnnouncer, useAnnounce } from '../../src/accessibility/announcer';

function Emitter() {
  const announce = useAnnounce();
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          announce('Apport prêt');
        }}
      >
        apport
      </button>
      <button
        type="button"
        onClick={() => {
          announce('Synchronisation terminée');
        }}
      >
        sync
      </button>
    </div>
  );
}

afterEach(cleanup);

describe('[SPEC-803] région live unique de la coquille', () => {
  it('ne monte qu’une seule région aria-live et annonce les états dans l’ordre', async () => {
    const { user } = renderComponent(
      <LiveAnnouncer>
        <Emitter />
      </LiveAnnouncer>,
    );

    const region = screen.getByTestId('shell-live-region');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-atomic')).toBe('true');
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'apport' }));
    expect(region.textContent).toBe('Apport prêt');
    expect(region.getAttribute('data-announcement-count')).toBe('1');

    await user.click(screen.getByRole('button', { name: 'sync' }));
    expect(region.textContent).toBe('Synchronisation terminée');
    expect(region.getAttribute('data-announcement-count')).toBe('2');
  });

  it('supprime une annonce identique consécutive', async () => {
    function Twice() {
      const announce = useAnnounce();
      return (
        <button
          type="button"
          onClick={() => {
            announce('Même état');
            announce('Même état');
          }}
        >
          annoncer
        </button>
      );
    }
    const { user } = renderComponent(
      <LiveAnnouncer>
        <Twice />
      </LiveAnnouncer>,
    );
    await user.click(screen.getByRole('button', { name: 'annoncer' }));
    expect(screen.getByTestId('shell-live-region').getAttribute('data-announcement-count')).toBe(
      '1',
    );
  });
});
