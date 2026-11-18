'use client';

import { useEffect, useRef, useState } from 'react';

import type { CourseStarter, CourseView } from '@learny/contracts';

import { SelectionBar } from './SelectionBar';
import { TutorAskCard } from './TutorAskCard';
import { TutorPanel } from './TutorPanel';
import { useTextSelection } from './use-text-selection';
import { useTutorChat } from './use-tutor-chat';

export function TutorChat({
  course,
  formationTitle,
  chapterTitle,
  chapterPosition,
  onOpenChange,
}: {
  course: CourseView;
  formationTitle: string;
  chapterTitle: string;
  chapterPosition: number;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const state = useTutorChat({
    courseId: course.id,
    courseTitle: formationTitle,
    chapterId: course.chapter.id,
    chapterTitle,
    chapterPosition,
  });
  const [draft, setDraft] = useState('');
  const selection = useTextSelection(!state.open);

  useEffect(() => {
    onOpenChange(state.open);
  }, [onOpenChange, state.open]);

  // The card (and its « Ouvrir la discussion » button) is unmounted while the floating panel is
  // open; closing it puts the focus back on the entry point, as the fixed panel did before.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !state.open) {
      document.querySelector<HTMLElement>('[data-testid="tutor-open"]')?.focus();
    }
    wasOpen.current = state.open;
  }, [state.open]);

  useEffect(() => {
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<{ text: string; sectionId: string; label: string }>)
        .detail;
      void state.askPassage(detail.text);
    };
    window.addEventListener('tutor:ask-passage', handler);
    return () => {
      window.removeEventListener('tutor:ask-passage', handler);
    };
  }, [state]);

  const onStarter = (starter: CourseStarter): void => {
    state.openPanel();
    void state.send(starter.prompt);
  };

  const onSend = (): void => {
    const text = draft.trim();
    if (text === '') return;
    setDraft('');
    void state.send(text);
  };

  return (
    <>
      {state.open ? null : (
        <TutorAskCard
          chapterLabel={chapterPosition}
          chapterTitle={chapterTitle}
          course={course}
          onOpen={state.openPanel}
          onStarter={onStarter}
          open={state.open}
        />
      )}
      {selection.selection !== null && !state.open ? (
        <SelectionBar
          onAsk={() => {
            if (selection.selection === null) return;
            void state.askPassage(selection.selection.text);
            selection.dismiss();
          }}
          onDismiss={selection.dismiss}
          selection={selection.selection}
        />
      ) : null}
      {state.open ? (
        <TutorPanel
          chapterTitle={chapterTitle}
          draft={draft}
          onClose={state.closePanel}
          onDraft={setDraft}
          onFollowUp={(followUp) => {
            void state.send(followUp.label, followUp.key);
          }}
          onNewDiscussion={() => {
            void state.newDiscussion();
          }}
          onSend={onSend}
          state={state}
        />
      ) : null}
    </>
  );
}
