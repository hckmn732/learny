// Section « Le tuteur a agi » (SPEC-3201 EF-5, BR-AUT-12/13, CL-3; ADR-0190).
//
// Two groups of the same journal: the proposals waiting for consent (« À faire »), with
// « Accepter », « Autre créneau » and « Pas maintenant », and the recent actions (« Fait »), with
// « Annuler » while their effect is not consumed. The card keeps the server summary as is; only the
// pill of the kind and the buttons are the mobile's own words (ADR-3002 § 3).
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { AutomationActionItem } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { formatShortDay, formatTime } from '../../lib/dates';
import { controls, theme, verticalHitSlop } from '../../theme';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Chip } from '../../ui/Chip';
import { Text } from '../../ui/Text';

const t = fr.mobile.today.tutor;
const sections = fr.mobile.today.sections;

export interface TutorActionSlot {
  readonly startsAt: string;
  readonly endsAt: string;
}

/** Alternatives carried by the payload of a `reprise` proposal (`payload.alternatives`). */
export function alternativesOf(item: AutomationActionItem): TutorActionSlot[] {
  const payload = item.payload as { readonly alternatives?: unknown };
  if (!Array.isArray(payload.alternatives)) return [];
  return payload.alternatives.filter((entry): entry is TutorActionSlot => {
    const candidate = entry as { readonly startsAt?: unknown; readonly endsAt?: unknown };
    return typeof candidate.startsAt === 'string' && typeof candidate.endsAt === 'string';
  });
}

/** Pill of an action: the mobile label of its kind, else the neutral wording. */
export function kindLabelOf(item: AutomationActionItem): string {
  const labels = t.kinds as unknown as Readonly<Record<string, string | undefined>>;
  return labels[item.kind] ?? t.kindFallback;
}

export interface TutorActionsSectionProps {
  readonly pending: readonly AutomationActionItem[];
  readonly recent: readonly AutomationActionItem[];
  readonly online: boolean;
  readonly busy: boolean;
  readonly timeZone: string;
  readonly onSeeAll: () => void;
  readonly onAccept: (item: AutomationActionItem) => void;
  readonly onDecline: (item: AutomationActionItem) => void;
  readonly onUndo: (item: AutomationActionItem) => void;
  readonly onChooseSlot: (item: AutomationActionItem, startsAt: string) => void;
}

/** EF-5 — the actions of the tutor, pending first. */
export function TutorActionsSection({
  pending,
  recent,
  online,
  busy,
  timeZone,
  onSeeAll,
  onAccept,
  onDecline,
  onUndo,
  onChooseSlot,
}: TutorActionsSectionProps) {
  const [openAlternatives, setOpenAlternatives] = useState<string | null>(null);
  const shown = recent.slice(0, 2);

  return (
    <View style={styles.section} testID="tutor-actions">
      <View style={styles.head}>
        <Text variant="sectionTitle" testID="tutor-actions-title">
          {sections.tutor}
        </Text>
        <Pressable
          testID="tutor-see-all"
          accessibilityRole="link"
          accessibilityLabel={sections.seeAll}
          onPress={onSeeAll}
          hitSlop={theme.spacing.md}
        >
          <Text variant="bodySmall" tone="indigoInk">
            {sections.seeAll}
          </Text>
        </Pressable>
      </View>

      {pending.length === 0 && shown.length === 0 ? (
        <Text variant="bodySmall" tone="muted" testID="tutor-actions-empty">
          {t.empty}
        </Text>
      ) : null}

      {pending.map((item, index) => {
        const alternatives = alternativesOf(item);
        const open = openAlternatives === item.id;
        return (
          <Card key={item.id} testID={`tutor-action-${item.id}`} padded={false} style={styles.card}>
            <View style={styles.kindRow}>
              <View style={styles.dot} />
              <Text variant="label" tone="muted">
                {kindLabelOf(item)}
              </Text>
              <Text variant="caption" tone="muted">
                {t.pending}
              </Text>
            </View>
            <Text variant="bodySmall" tone="secondary" testID={`tutor-summary-${item.id}`}>
              {item.summary}
            </Text>
            <View style={styles.actions}>
              <Button
                label={t.accept}
                size="sm"
                variant="ink"
                testID={`tutor-accept-${String(index)}`}
                disabled={!online || busy}
                onPress={() => {
                  onAccept(item);
                }}
              />
              {alternatives.length === 0 ? null : (
                <Button
                  label={t.other}
                  size="sm"
                  variant="outline"
                  testID={`tutor-other-slot-${String(index)}`}
                  disabled={!online || busy}
                  onPress={() => {
                    setOpenAlternatives(open ? null : item.id);
                  }}
                />
              )}
              <Pressable
                testID={`tutor-decline-${String(index)}`}
                accessibilityRole="button"
                accessibilityLabel={t.decline}
                accessibilityState={{ disabled: !online || busy }}
                disabled={!online || busy}
                onPress={() => {
                  onDecline(item);
                }}
                hitSlop={verticalHitSlop(controls.chip)}
              >
                <Text variant="chip" tone="muted">
                  {t.decline}
                </Text>
              </Pressable>
            </View>
            {open ? (
              <View style={styles.alternatives} accessibilityLabel={t.alternatives}>
                {alternatives.map((slot, slotIndex) => (
                  <Chip
                    key={slot.startsAt}
                    tone="outline"
                    label={`${formatShortDay(slot.startsAt, timeZone)} ${formatTime(slot.startsAt, timeZone)}`}
                    testID={`tutor-slot-${String(index)}-${String(slotIndex)}`}
                    onPress={() => {
                      setOpenAlternatives(null);
                      onChooseSlot(item, slot.startsAt);
                    }}
                  />
                ))}
              </View>
            ) : null}
          </Card>
        );
      })}

      {shown.map((item, index) => {
        const undoable = item.status === 'applied';
        return (
          <Card key={item.id} testID={`tutor-action-${item.id}`} padded={false} style={styles.card}>
            <View style={styles.kindRow}>
              <View style={[styles.dot, styles.dotIndigo]} />
              <Text variant="label" tone="muted">
                {kindLabelOf(item)}
              </Text>
              <Text variant="caption" tone="muted">
                {t.recent}
              </Text>
            </View>
            <Text variant="bodySmall" tone="secondary">
              {item.summary}
            </Text>
            {undoable ? (
              <Pressable
                testID={`tutor-undo-${String(pending.length + index)}`}
                accessibilityRole="button"
                accessibilityLabel={t.undoLabel(item.summary)}
                accessibilityState={{ disabled: !online || busy }}
                disabled={!online || busy}
                onPress={() => {
                  onUndo(item);
                }}
                hitSlop={verticalHitSlop(controls.chip)}
              >
                <Text variant="chip" tone="indigoInk">
                  {t.undo}
                </Text>
              </Pressable>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  // `app.css` `.tutor-card` : padding 14, gap 8, rayon 18.
  card: { padding: 14, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  dot: {
    width: 8,
    height: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.green,
  },
  dotIndigo: { backgroundColor: theme.colors.indigo },
  actions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap' },
  alternatives: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
});
