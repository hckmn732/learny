// Jest + RNTL [SPEC-3301] — Markdown renderer (ET-3, EF-7, CL-5).
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Markdown } from '../../src/ui/Markdown';

const SAMPLE = [
  '## Titre de section',
  '',
  'Un **gras**, une *italique*, du `code` et un [lien](https://learny.app/cours).',
  '',
  '- premier point',
  '',
  '| Clé | Sens |',
  '| --- | --- |',
  '| 40 | Débit |',
  '',
  '> **À retenir**',
  '>',
  '> La partie double.',
  '',
  '> **Question éclair**',
  '>',
  '> Que dit le principe ?',
  '>',
  '> ---',
  '>',
  '> Deux montants égaux.',
].join('\n');

describe('[SPEC-3301] rendu Markdown natif', () => {
  it('[SPEC-3301] rend les titres, le gras et les listes sans WebView (ET-3)', async () => {
    await render(<Markdown markdown={SAMPLE} testID="markdown" />);
    expect(screen.getByTestId('markdown')).toBeTruthy();
    expect(screen.getByText('Titre de section')).toBeTruthy();
    expect(screen.getByText('premier point')).toBeTruthy();
  });

  it('[SPEC-3301] un tableau défile horizontalement (ET-3)', async () => {
    await render(<Markdown markdown={SAMPLE} />);
    expect(screen.getByTestId('brick-markdown-table')).toBeTruthy();
  });

  it('[SPEC-3301] un lien est annoncé comme lien et ouvre son URL (ET-3)', async () => {
    const onLinkPress = jest.fn();
    await render(<Markdown markdown={SAMPLE} onLinkPress={onLinkPress} />);
    const link = screen.getByTestId(/^markdown-link-/);
    expect(link.props.accessibilityRole).toBe('link');
    await fireEvent.press(link);
    expect(onLinkPress).toHaveBeenCalledWith('https://learny.app/cours');
  });

  it('[SPEC-3301] les blocs de la charge sont rendus (EF-7)', async () => {
    await render(<Markdown markdown={SAMPLE} />);
    expect(screen.getByTestId('brick-callout-takeaway')).toBeTruthy();
    expect(screen.getByTestId('brick-callout-quick')).toBeTruthy();
    expect(screen.getByText('À retenir')).toBeTruthy();
  });

  it('[SPEC-3301] la réponse de la question éclair est masquée puis révélée (EF-7)', async () => {
    await render(<Markdown markdown={SAMPLE} />);
    expect(screen.queryByText('Deux montants égaux.')).toBeNull();
    await fireEvent.press(screen.getByTestId('brick-callout-reveal'));
    expect(screen.getByText('Deux montants égaux.')).toBeTruthy();
  });

  it('[SPEC-3301] le HTML brut est ignoré (CL-5)', async () => {
    await render(<Markdown markdown={'<div>caché</div>\n\nUn texte visible.'} />);
    expect(screen.getByText('Un texte visible.')).toBeTruthy();
    expect(screen.queryByText('caché')).toBeNull();
  });
});
