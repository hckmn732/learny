// [SPEC-4003] Composants du dépôt : cartes, lignes, rôles, encart sans clé.
import { fireEvent, render, screen } from '@testing-library/react-native';

import { FileRow } from '../../src/simple/FileRow';
import { KeyWarning } from '../../src/simple/KeyWarning';
import { SimpleCards } from '../../src/simple/SimpleCards';

describe('[SPEC-4003] cartes de l’accueil', () => {
  it('présente les deux portes et ouvre le dépôt', async () => {
    const onDrop = jest.fn();
    const onTutor = jest.fn();
    await render(<SimpleCards onDrop={onDrop} onTutor={onTutor} />);
    expect(screen.getByTestId('simple-card-drop')).toBeTruthy();
    expect(screen.getByTestId('simple-card-tutor')).toBeTruthy();
    expect(screen.getByText('Dépose ton cours')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('simple-card-drop-action'));
    expect(onDrop).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('simple-card-tutor-action'));
    expect(onTutor).toHaveBeenCalledTimes(1);
  });
});

describe('[SPEC-4003] encart sans clé d’IA', () => {
  it('affiche le blocage et mène à l’ajout de la clé', async () => {
    const onAddKey = jest.fn();
    await render(<KeyWarning onAddKey={onAddKey} />);
    expect(screen.getByTestId('simple-key-warning')).toBeTruthy();
    expect(screen.getByText('Ajoute ta clé d’IA pour continuer')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('simple-key-warning-action'));
    expect(onAddKey).toHaveBeenCalledTimes(1);
  });
});

describe('[SPEC-4003] ligne de fichier', () => {
  it('affiche le rôle, permet de le corriger et de retirer le fichier', async () => {
    const onRole = jest.fn();
    const onRemove = jest.fn();
    await render(
      <FileRow
        name="Manuel.pdf"
        meta="712 pages · 38 Mo"
        resourceRole="course"
        onRole={onRole}
        onRemove={onRemove}
        testID="simple-file-0"
        roleTestID="simple-role-0"
        removeTestID="simple-file-0-remove"
      />,
    );
    expect(screen.getByText('Rôle : Cours')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('simple-role-0'));
    expect(onRole).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('simple-file-0-remove'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('propose « Réessayer » après un échec seulement', async () => {
    const onRetry = jest.fn();
    await render(
      <FileRow
        name="TD.pdf"
        resourceRole="exercises"
        statusLabel="Échec"
        failed
        onRetry={onRetry}
        testID="simple-file-1"
        retryTestID="simple-file-1-retry"
      />,
    );
    await fireEvent.press(screen.getByTestId('simple-file-1-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
