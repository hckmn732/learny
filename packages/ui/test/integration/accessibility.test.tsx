// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { renderComponent } from '@learny/testing/render';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  ErrorState,
  returnFocus,
} from '@learny/ui';

import { closeDb, sql } from '../../../db/src/index';
import { asUser, createTestUser, withRollback } from '../../../db/src/testing/index';

const ROOT = process.cwd();

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

afterAll(async () => {
  vi.restoreAllMocks();
  await closeDb();
});

afterEach(cleanup);

function PanelHarness() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button data-testid="panel-trigger" ref={triggerRef} type="button">
          Ouvrir le panneau
        </button>
      </DialogTrigger>
      <DialogContent data-testid="panel-dialog">
        <DialogTitle>Panneau de démonstration</DialogTitle>
        <DialogDescription>Le focus est piégé puis rendu au déclencheur.</DialogDescription>
        <button type="button">Action du panneau</button>
      </DialogContent>
    </Dialog>
  );
}

function RemovedTriggerHarness() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const archived = useRef(false);
  const [open, setOpen] = useState(false);
  const [triggerVisible, setTriggerVisible] = useState(true);
  return (
    <>
      <h1 data-page-title>Titre de la page</h1>
      <Dialog open={open} onOpenChange={setOpen}>
        {triggerVisible ? (
          <DialogTrigger asChild>
            <button data-testid="archive-trigger" ref={triggerRef} type="button">
              Supprimer le déclencheur
            </button>
          </DialogTrigger>
        ) : null}
        <DialogContent
          data-testid="archive-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus({ trigger: archived.current ? null : triggerRef.current });
          }}
        >
          <DialogTitle>Supprimer le déclencheur ?</DialogTitle>
          <DialogDescription>Le focus revient au titre de la page.</DialogDescription>
          <button
            data-testid="archive-confirm"
            onClick={() => {
              archived.current = true;
              setTriggerVisible(false);
              setOpen(false);
            }}
            type="button"
          >
            Confirmer
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface ProfileRow extends Record<string, unknown> {
  id: string;
  first_name: string | null;
}

function AuthorizedProfile({ profile }: Readonly<{ profile: ProfileRow | null }>) {
  if (profile === null) {
    return (
      <ErrorState
        data-testid="a11y-profile-error"
        description="Ces données ne sont pas accessibles avec votre session."
        title="Données indisponibles"
      />
    );
  }
  return (
    <section aria-label="Profil autorisé">
      <p data-testid="a11y-profile-name">{profile.first_name}</p>
    </section>
  );
}

describe('[SPEC-309] Socle d’accessibilité service', () => {
  it('ouvre et ferme un panneau modal en rendant le focus au déclencheur (CA-2)', async () => {
    const { user } = renderComponent(<PanelHarness />);
    const trigger = screen.getByTestId('panel-trigger');

    await user.click(trigger);
    expect(await screen.findByRole('dialog')).toBeTruthy();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(document.activeElement).toBe(trigger);
  });

  it('rend le focus au titre de la page quand le déclencheur a disparu (CL-1)', async () => {
    const { user } = renderComponent(<RemovedTriggerHarness />);
    await user.click(screen.getByTestId('archive-trigger'));
    expect(await screen.findByTestId('archive-dialog')).toBeTruthy();

    await user.click(screen.getByTestId('archive-confirm'));
    await waitFor(() => {
      expect(screen.queryByTestId('archive-dialog')).toBeNull();
    });
    expect(screen.queryByTestId('archive-trigger')).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
    });
  });

  it('applique le RLS à deux utilisateurs et n’affiche qu’une erreur sûre (CA-3)', async () => {
    const result = await withRollback(async (tx) => {
      const alice = await createTestUser(tx, { firstName: 'Alice', lastName: 'Martin' });
      const bob = await createTestUser(tx, { firstName: 'Bob', lastName: 'Durand' });

      const own = await asUser(tx, alice.id, async (scoped) => {
        return scoped.execute<ProfileRow>(sql`
          select id::text as id, first_name
          from public.profiles
          where id = ${alice.id}::uuid
        `);
      });
      const crossUser = await asUser(tx, alice.id, async (scoped) => {
        return scoped.execute<ProfileRow>(sql`
          select id::text as id, first_name
          from public.profiles
          where id = ${bob.id}::uuid
        `);
      });
      return { own, crossUser };
    });

    expect(result.own).toHaveLength(1);
    expect(result.own[0]?.first_name).toBe('Alice');
    expect(result.crossUser).toHaveLength(0);

    render(<AuthorizedProfile profile={result.own[0] ?? null} />);
    expect(screen.getByTestId('a11y-profile-name').textContent).toBe('Alice');
    cleanup();
    render(<AuthorizedProfile profile={result.crossUser[0] ?? null} />);
    expect(screen.queryByText('Alice')).toBeNull();
    expect(screen.getByTestId('a11y-profile-error').textContent).toContain(
      'Ces données ne sont pas accessibles',
    );
  });

  it('désactive les animations décoratives sous mouvement réduit (CA-4)', () => {
    const css = fs.readFileSync(
      path.join(ROOT, 'packages/ui/src/styles/accessibility.css'),
      'utf8',
    );
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toMatch(/animation-duration:\s*0\.01ms/);
    expect(css).toMatch(/transition-duration:\s*0\.01ms/);
    expect(css).toMatch(/\.learny-skip-link:focus/);
    expect(css).toMatch(/\.learny-visually-hidden/);

    const globals = fs.readFileSync(path.join(ROOT, 'apps/web/app/globals.css'), 'utf8');
    expect(globals).toContain("@import '@learny/ui/accessibility.css';");
  });
});
