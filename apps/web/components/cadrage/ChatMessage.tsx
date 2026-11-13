import { Sparkles } from 'lucide-react';

import type { CadrageMessage } from '@learny/contracts';

import { fr } from '../../messages/fr';

const t = fr.cadrage;

export interface ChatMessageProps {
  message: Pick<CadrageMessage, 'id' | 'role' | 'content' | 'questionNumber'>;
}

/** EF-5 — tutor bubble on the left with its avatar, learner bubble in black on the right. */
export const ChatMessage = ({ message }: ChatMessageProps) => {
  if (message.role === 'learner') {
    return (
      <div
        className="max-w-[520px] self-end bg-ink px-16 py-14 text-15 leading-1.55 text-white"
        data-testid={`cadrage-message-${message.id}`}
        style={{ borderRadius: '18px 4px 18px 18px' }}
      >
        {message.content}
      </div>
    );
  }
  return (
    <div
      className="flex max-w-[640px] items-start gap-12"
      data-testid={`cadrage-message-${message.id}`}
    >
      <span
        aria-hidden="true"
        className="flex h-36 w-36 shrink-0 items-center justify-center rounded-12 bg-lime"
      >
        <Sparkles size={18} strokeWidth={2.2} />
      </span>
      <div
        className="bg-surface-muted px-16 py-14 text-15 leading-1.55"
        style={{ borderRadius: '4px 18px 18px 18px' }}
      >
        {message.questionNumber === null ? null : (
          <span className="mb-4 block text-12 font-700 text-ink-muted">
            {t.questionLabel(message.questionNumber)}
          </span>
        )}
        {message.content}
      </div>
    </div>
  );
};
