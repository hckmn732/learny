// « Changer de formation » (SPEC-3202 EF-1, BR-FOR-11, CL-3, CL-4; SPEC-304).
//
// Lists the active and paused formations of the learner with their server percentage; the current
// one is checked, a paused one can only be resumed on the web. The switch itself is a single
// `PATCH /me/current-formation` (CA-3); offline it is disabled and the cached programme is shown.
import { Pressable, StyleSheet, View } from 'react-native';

import type { SidebarFormation } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { theme } from '../../theme';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';

const t = fr.mobile.programme;

export interface FormationSwitcherSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly formations: readonly SidebarFormation[];
  readonly currentFormationId: string | null;
  readonly offline: boolean;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onSelect: (formationId: string) => void;
  readonly onResumeOnWeb: (formationId: string) => void;
}

/** Bottom sheet of the formation switcher. */
export function FormationSwitcherSheet({
  visible,
  onClose,
  formations,
  currentFormationId,
  offline,
  pending,
  error,
  onSelect,
  onResumeOnWeb,
}: FormationSwitcherSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title={t.switcher.title} testID="formation-switcher">
      {offline ? (
        <Text variant="rowSubtitle" tone="muted" testID="formation-switcher-offline">
          {t.switcher.offline}
        </Text>
      ) : null}
      {error === null ? null : (
        <Text variant="rowSubtitle" tone="danger" testID="formation-switcher-error">
          {error}
        </Text>
      )}
      {formations.length === 0 ? (
        <Text variant="rowSubtitle" tone="muted">
          {t.switcher.empty}
        </Text>
      ) : null}
      {formations.map((formation) => {
        const current = formation.id === currentFormationId;
        const paused = formation.status === 'paused';
        return (
          <View key={formation.id} style={styles.row}>
            <Pressable
              testID={`formation-option-${formation.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${formation.title}, ${String(formation.progressPercent)} %`}
              accessibilityState={{ selected: current, disabled: offline || paused || pending }}
              disabled={offline || paused || pending}
              onPress={() => {
                if (offline || paused) return;
                onSelect(formation.id);
              }}
              style={({ pressed }) => [styles.option, { opacity: pressed ? 0.75 : 1 }]}
            >
              <View style={styles.sigil}>
                <Text variant="chip" tone="indigoInk">
                  {formation.monogram}
                </Text>
              </View>
              <View style={styles.grow}>
                <View style={styles.line}>
                  <Text variant="body" numberOfLines={2} style={styles.grow}>
                    {formation.title}
                  </Text>
                  <Chip
                    label={paused ? t.switcher.paused : t.switcher.active}
                    tone={paused ? 'orange' : 'green'}
                  />
                </View>
                <Text variant="caption" tone="muted">
                  {String(formation.progressPercent)} %{current ? ` · ${t.switcher.current}` : ''}
                </Text>
              </View>
              {current ? <Icon name="check" size={18} color={theme.colors.greenInk} /> : null}
            </Pressable>
            {paused ? (
              <Button
                label={t.switcher.resumeOnWeb}
                variant="outline"
                size="sm"
                onPress={() => {
                  onResumeOnWeb(formation.id);
                }}
              />
            ) : null}
          </View>
        );
      })}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  option: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  sigil: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.indigoSoft,
  },
  grow: { flex: 1, minWidth: 0 },
  line: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
});
