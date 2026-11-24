// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KeyWarning } from './key-warning';
import { SimpleFileList, type SimpleFileEntry } from './simple-file-list';

afterEach(cleanup);

const PDF: SimpleFileEntry = {
  id: 'file-1',
  name: 'Manuel de comptabilité générale.pdf',
  sizeBytes: 39_845_888,
  pages: 712,
  role: 'course',
  status: 'ready',
  progress: 100,
  message: null,
};

const TD: SimpleFileEntry = {
  id: 'file-2',
  name: 'TD corrigés.pdf',
  sizeBytes: 6_291_456,
  pages: 96,
  role: 'exercises',
  status: 'failed',
  progress: 0,
  message: 'Ce format n’est pas pris en charge.',
};

function renderList(overrides: Partial<React.ComponentProps<typeof SimpleFileList>> = {}) {
  const props = {
    files: [PDF, TD],
    links: [],
    onChangeRole: vi.fn(),
    onChangeLinkRole: vi.fn(),
    onRemove: vi.fn(),
    onRetry: vi.fn(),
    onRemoveLink: vi.fn(),
    ...overrides,
  };
  render(<SimpleFileList {...props} />);
  return props;
}

describe('[SPEC-4002] liste des documents déposés', () => {
  it('CA-1 — affiche chaque fichier avec ses pages, sa taille et son rôle', () => {
    renderList();
    const row = screen.getByTestId('simple-file-0');
    expect(row.textContent).toContain('Manuel de comptabilité générale.pdf');
    expect(row.textContent).toContain('712 pages');
    expect(row.textContent).toContain('38 Mo');
    expect(screen.getByTestId<HTMLSelectElement>('simple-role-0').value).toBe('course');
    expect(screen.getByTestId<HTMLSelectElement>('simple-role-1').value).toBe('exercises');
  });

  it('EF-2 — changer le rôle d’un document appelle la mise à jour', () => {
    const props = renderList();
    fireEvent.change(screen.getByTestId('simple-role-0'), { target: { value: 'exam_papers' } });
    expect(props.onChangeRole).toHaveBeenCalledWith('file-1', 'exam_papers');
  });

  it('EF-2 — « Retirer » retire la ligne concernée', () => {
    const props = renderList();
    fireEvent.click(screen.getByTestId('simple-file-remove-1'));
    expect(props.onRemove).toHaveBeenCalledWith('file-2');
    expect(props.onRemove).not.toHaveBeenCalledWith('file-1');
  });

  it('CL-1 — un fichier refusé affiche le message de l’API et propose « Réessayer »', () => {
    const props = renderList();
    expect(screen.getByTestId('simple-file-1').textContent).toContain(
      'Ce format n’est pas pris en charge.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(props.onRetry).toHaveBeenCalledWith('file-2');
  });

  it('EF-2 — un lien déposé est une ligne avec son rôle et son retrait', () => {
    const props = renderList({
      links: [
        {
          resourceId: 'link-1',
          title: 'Comptabilité générale — cours',
          role: 'course',
          status: 'ready',
        },
      ],
    });
    expect(screen.getByTestId('simple-file-2').textContent).toContain(
      'Comptabilité générale — cours',
    );
    fireEvent.change(screen.getByTestId('simple-role-2'), { target: { value: 'other' } });
    expect(props.onChangeLinkRole).toHaveBeenCalledWith('link-1', 'other');
  });
});

describe('[SPEC-4002] état sans clé d’IA', () => {
  it('CA-2 — l’encart nomme le blocage et mène aux Paramètres avec le retour au dépôt', () => {
    render(<KeyWarning returnTo="/formations/abc/depot" />);
    const warning = screen.getByTestId('simple-key-warning');
    expect(warning.textContent).toContain('Ajoute ta clé d’IA pour continuer');
    expect(warning.textContent).toContain('Tes fichiers restent déposés ici');
    const action = screen.getByTestId('simple-key-action');
    expect(action.textContent).toContain('Ajouter ma clé');
    expect(action.getAttribute('href')).toBe(
      `/parametres?retour=${encodeURIComponent('/formations/abc/depot')}#modeles`,
    );
  });
});
