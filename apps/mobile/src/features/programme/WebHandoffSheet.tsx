// Web hand-off sheets of the Programme tab (SPEC-3202 EF-1, EF-3, CL-1; ADR-3002 § 3).
//
// Creation, import, programme validation, pause and completion are out of the mobile scope: a
// fiche explains where the action lives and one button opens the web page. No write route of the
// programme is ever called from the application (ET-3).
import { fr } from '@learny/i18n';

import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';

const t = fr.mobile.programme;

export type WebHandoffKind = 'create' | 'import' | 'proposal' | 'paused' | 'completed';

const CONTENT: Record<WebHandoffKind, { title: string; body: string; action: string }> = {
  // TODO(quickfix) — la feuille « create » continue désormais vers /programme/cadrage : sa copie
  // décrit encore la création sur le web, à reprendre avec la zone B. Les feuilles « import » et
  // « paused » restent de vrais renvois web.
  create: {
    title: t.web.createTitle,
    body: t.web.createBody,
    action: t.web.continue,
  },
  import: {
    title: t.web.importTitle,
    body: t.web.importBody,
    action: t.web.continue,
  },
  proposal: {
    title: t.proposal.title,
    body: t.proposal.body,
    action: t.proposal.action,
  },
  paused: {
    title: t.banner.pausedTitle,
    body: t.banner.pausedBody,
    action: t.banner.pausedAction,
  },
  completed: {
    title: t.banner.completedTitle,
    body: t.banner.completedBody,
    action: t.banner.completedAction,
  },
};

export interface WebHandoffSheetProps {
  readonly kind: WebHandoffKind;
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onContinue: () => void;
}

/** Fiche that sends the learner to the web page of an out-of-scope action. */
export function WebHandoffSheet({ kind, visible, onClose, onContinue }: WebHandoffSheetProps) {
  const content = CONTENT[kind];
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={content.title}
      testID={`programme-web-${kind}`}
    >
      <Text variant="body" tone="secondary">
        {content.body}
      </Text>
      <Button
        label={content.action}
        onPress={onContinue}
        block
        testID={`programme-web-${kind}-action`}
      />
    </Sheet>
  );
}
