// Feuille de mise en pause du compte (SPEC-3401 EF-5, BR-AUT-10 ; SPEC-721 ; canevas § 3).
//
// Opened from the account sheet (SPEC-3102) and from the Rythme screen. The end date is chosen among
// bounded proposals (tomorrow at the earliest, CL-3 of SPEC-721) because the application embeds no
// native date picker (ADR-3024) ; the resume action is offered as soon as the pause is active.
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { addCivilDays } from '@learny/core';
import { fr } from '@learny/i18n';

import { usePause, usePauseActions, isPauseActive } from '../../data/pause';
import { clock } from '../../lib/clock';
import { civilDayLong, formatIsoDay } from '../../lib/dates';
import { theme } from '../../theme';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { Sheet } from '../../ui/Sheet';
import { Switch } from '../../ui/Switch';
import { Text } from '../../ui/Text';

const t = fr.mobile.profile;

/** Offsets proposed by the sheet, in days from today: tomorrow is the earliest end date. */
export const PAUSE_OFFSETS = [1, 3, 7, 14, 30] as const;

export interface PauseSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  /** Called with the confirmation sentence once the server answered. */
  readonly onDone: (message: string) => void;
  /** Zone of the learner, for the civil days of the proposals (BR-ACC-07). */
  readonly timeZone: string;
  /** Instant of the proposals; the application clock, never the system one (ADR-0047). */
  readonly now?: Date;
}

/** « Mettre en pause » sheet. */
export function PauseSheet({ visible, onClose, onDone, timeZone, now }: PauseSheetProps) {
  const pause = usePause();
  const actions = usePauseActions();
  const [offset, setOffset] = useState<number>(PAUSE_OFFSETS[0]);
  const [diagnostic, setDiagnostic] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(() => {
    const today = formatIsoDay(now ?? clock.now(), timeZone);
    return PAUSE_OFFSETS.map((value) => ({ offset: value, day: addCivilDays(today, value) }));
  }, [timeZone, now]);

  const active = isPauseActive(pause.data);
  const selected = days.find((day) => day.offset === offset) ?? days[0];

  const start = (): void => {
    if (selected === undefined) return;
    setError(null);
    void actions
      .start(selected.day, diagnostic)
      .then((state) => {
        onDone(t.pause.scheduled(civilDayLong(state.endsOn ?? selected.day)));
        onClose();
      })
      .catch(() => {
        setError(t.pauseError);
      });
  };

  const resume = (): void => {
    setError(null);
    void actions
      .end()
      .then(() => {
        onDone(t.pauseResumed);
        onClose();
      })
      .catch(() => {
        setError(t.pauseError);
      });
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t.pause.title} testID="pause-sheet">
      <Text variant="rowSubtitle" tone="muted">
        {t.pause.body}
      </Text>

      {active ? (
        <View style={styles.activeBlock}>
          <Chip label={t.rows.rhythm} tone="lime" icon="pause" />
          <Text variant="title" testID="pause-active">
            {t.pause.active(civilDayLong(pause.data?.endsOn ?? ''))}
          </Text>
          <Button
            label={t.pauseResume}
            onPress={resume}
            loading={actions.pending}
            testID="pause-resume"
          />
        </View>
      ) : null}

      <Text variant="label" tone="muted">
        {t.pause.dateLabel}
      </Text>
      <View style={styles.options} testID="pause-date">
        {days.map((day) => (
          <Chip
            key={day.offset}
            label={civilDayLong(day.day)}
            tone={day.offset === offset ? 'ink' : 'outline'}
            onPress={() => {
              setOffset(day.offset);
            }}
            testID={`pause-date-${String(day.offset)}`}
          />
        ))}
      </View>

      <Switch
        label={t.pause.diagnostic}
        description={t.pause.diagnosticHint}
        value={diagnostic}
        onValueChange={setDiagnostic}
        testID="pause-diagnostic"
      />

      {error === null ? null : (
        <Text variant="caption" tone="danger" testID="pause-error">
          {error}
        </Text>
      )}

      <View style={styles.actions}>
        <Button
          label={t.pause.confirm}
          onPress={start}
          loading={actions.pending}
          disabled={active}
          testID="pause-confirm"
        />
        <Button label={t.pause.cancel} variant="text" onPress={onClose} testID="pause-cancel" />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  activeBlock: { gap: theme.spacing.sm, paddingVertical: theme.spacing.md },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  actions: { gap: theme.spacing.sm, paddingTop: theme.spacing.md },
});
