// Ligne d'un document déposé (SPEC-4003 EF-2, CL-1, CL-2).
//
// The row shows the name, its pages and size, the role (a pressable chip that opens the role
// sheet) and the upload state. A failed upload offers « Réessayer »; a confirmed one never does.
import { Pressable, StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { theme } from '../theme';
import { Chip } from '../ui/Chip';
import { Icon } from '../ui/Icon';
import { ProgressBar } from '../ui/ProgressBar';
import { Text } from '../ui/Text';

import { roleLabel, type SimpleRole } from './view-model';

const t = fr.mobile.simple.deposit;

export interface FileRowProps {
  readonly name: string;
  readonly meta?: string | undefined;
  readonly resourceRole: SimpleRole;
  readonly statusLabel?: string;
  readonly progress?: number;
  readonly failed?: boolean;
  readonly onRole?: () => void;
  readonly onRemove?: () => void;
  readonly onRetry?: () => void;
  readonly testID: string;
  readonly roleTestID?: string;
  readonly retryTestID?: string;
  readonly removeTestID?: string;
}

/** Une ligne de la liste des documents. */
export function FileRow({
  name,
  meta,
  resourceRole,
  statusLabel,
  progress,
  failed = false,
  onRole,
  onRemove,
  onRetry,
  testID,
  roleTestID,
  retryTestID,
  removeTestID,
}: FileRowProps) {
  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.icon}>
        <Icon name="file" size={18} color={theme.colors.indigoInk} />
      </View>
      <View style={styles.body}>
        <Text variant="rowTitle" numberOfLines={1} testID={`${testID}-name`}>
          {name}
        </Text>
        {meta === undefined || meta === '' ? null : (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {meta}
          </Text>
        )}
        <View style={styles.tags}>
          <Chip
            label={`${t.rolePrefix}${roleLabel(resourceRole)}`}
            tone="outline"
            {...(onRole === undefined ? {} : { onPress: onRole })}
            {...(roleTestID === undefined ? {} : { testID: roleTestID })}
          />
          {statusLabel === undefined ? null : (
            <Text
              variant="caption"
              tone={failed ? 'danger' : statusLabel === t.statuses.uploaded ? 'success' : 'muted'}
              testID={`${testID}-status`}
            >
              {statusLabel}
            </Text>
          )}
        </View>
        {progress === undefined ? null : (
          <ProgressBar
            value={Math.min(1, Math.max(0, progress / 100))}
            label={name}
            testID={`${testID}-progress`}
          />
        )}
        {failed && onRetry !== undefined ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t.retry} ${name}`}
            onPress={onRetry}
            hitSlop={theme.spacing.sm}
            testID={retryTestID}
          >
            <Text variant="caption" tone="indigo">
              {t.retry}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {onRemove === undefined ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t.remove} ${name}`}
          onPress={onRemove}
          hitSlop={theme.spacing.md}
          testID={removeTestID}
          style={styles.remove}
        >
          <Icon name="close" size={16} color={theme.colors.inkMuted} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  icon: {
    width: 38,
    height: 44,
    borderRadius: theme.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.indigoSoft,
  },
  body: { flex: 1, minWidth: 0, gap: theme.spacing.xs },
  tags: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap' },
  remove: { padding: theme.spacing.xs },
});
