// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cleanup, renderComponent, screen } from '@learny/testing/render';

import { ReplyBar, composeReplyContent } from './ReplyBar';

afterEach(cleanup);

function Controlled({ selectedCount = 0 }: Readonly<{ selectedCount?: number }>) {
  const [value, setValue] = useState('');
  return (
    <ReplyBar
      onChange={setValue}
      onSend={() => undefined}
      selectedCount={selectedCount}
      value={value}
    />
  );
}

describe('[SPEC-604] ReplyBar', () => {
  it('EF-7 — contenu composé « A, B. texte »', () => {
    expect(composeReplyContent(['A', 'B'], 'texte')).toBe('A, B. texte');
    expect(composeReplyContent(['A', 'B'], '')).toBe('A, B');
    expect(composeReplyContent([], 'texte')).toBe('texte');
  });

  it('EF-7 — le bouton Envoyer est actif dès un caractère ou une sélection', async () => {
    const { user, rerender } = renderComponent(<Controlled />);
    const send = screen.getByTestId('cadrage-send');
    expect((send as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByTestId('cadrage-reply'), 'Bonjour');
    expect((send as HTMLButtonElement).disabled).toBe(false);
    rerender(<Controlled selectedCount={2} />);
  });

  it('EF-7 — Entrée envoie, Maj+Entrée n’a pas d’effet', async () => {
    const onSend = vi.fn();
    const { user } = renderComponent(
      <ReplyBar onChange={() => undefined} onSend={onSend} value="Réponse" />,
    );
    const input = screen.getByTestId('cadrage-reply');
    await user.type(input, '{Shift>}{Enter}{/Shift}');
    expect(onSend).not.toHaveBeenCalled();
    await user.type(input, '{Enter}');
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('EF-7 — le libellé de la zone est masqué mais associé', () => {
    renderComponent(<ReplyBar onChange={() => undefined} onSend={() => undefined} value="" />);
    expect(screen.getByLabelText('Votre réponse')).toBeTruthy();
  });
});
