// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ResourceListItem } from '@learny/contracts';
import { cleanup, renderComponent, screen } from '@learny/testing/render';

import { ResourceDropzone } from './ResourceDropzone';
import { ResourceList } from './ResourceList';

afterEach(cleanup);

const CHAPTER = '22222222-2222-4222-8222-222222222222';

function resource(overrides: Partial<ResourceListItem> = {}): ResourceListItem {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    kind: 'pdf',
    title: 'Guide utilisateur FI — saisie.pdf',
    status: 'ready',
    errorCode: null,
    errorMessage: null,
    sizeBytes: 1024,
    pages: 24,
    url: null,
    createdAt: '2026-11-11T12:20:00.000Z',
    updatedAt: '2026-11-11T12:20:00.000Z',
    ...overrides,
  };
}

const noop = () => undefined;

describe('[SPEC-607] liste des apports', () => {
  it('CA-2 — affiche en file, en cours, prêt et échec avec raison et « Réessayer »', () => {
    renderComponent(
      <ResourceList
        onDelete={noop}
        onRename={noop}
        onRetry={noop}
        resources={[
          resource({ id: 'r1', status: 'queued', title: 'Note en file' }),
          resource({ id: 'r2', status: 'processing', title: 'PDF en cours' }),
          resource({ id: 'r3', status: 'ready', title: 'PDF analysé' }),
          resource({
            id: 'r4',
            status: 'failed',
            title: 'PDF en échec',
            errorCode: 'PDF_EMPTY_TEXT',
            errorMessage: 'Ce PDF ne contient pas de texte exploitable.',
          }),
        ]}
      />,
    );
    expect(screen.getByText('En file')).toBeTruthy();
    expect(screen.getByText('En cours')).toBeTruthy();
    expect(screen.getByText('Analysé')).toBeTruthy();
    expect(screen.getByText('Échec')).toBeTruthy();
    expect(screen.getByText('Ce PDF ne contient pas de texte exploitable.')).toBeTruthy();
    const statuses = screen.getAllByTestId('resource-status').map((node) => node.textContent);
    expect(statuses).toEqual(['En file', 'En cours', 'Analysé', 'Échec']);
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
  });

  it('CA-2 — le bouton Réessayer appelle la relance de la bonne ligne', async () => {
    const retry = vi.fn();
    const { user } = renderComponent(
      <ResourceList
        onDelete={noop}
        onRename={noop}
        onRetry={retry}
        resources={[resource({ status: 'failed', errorMessage: 'Erreur lisible.' })]}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(retry).toHaveBeenCalledWith('44444444-4444-4444-8444-444444444444');
  });

  it('CA-1 — le dépôt propose les six types V1 et jamais les fichiers audio ou vidéo', () => {
    renderComponent(
      <ResourceDropzone
        onFile={vi.fn()}
        onNote={vi.fn()}
        onUrl={vi.fn()}
      />,
    );
    for (const label of ['PDF', 'Image', 'Page web', 'YouTube', 'Note']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect(screen.getByLabelText('Ce document est un guide d’examen')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Audio' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Vidéo' })).toBeNull();
    expect(screen.queryByText('Audio')).toBeNull();
    expect(screen.queryByText('Vidéo')).toBeNull();
    expect(CHAPTER).toBe('22222222-2222-4222-8222-222222222222');
  });
});
