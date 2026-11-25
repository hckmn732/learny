// Liste « Déjà ajoutés » d'un chapitre (maquette Apports).
//
// One row per apport: its kind badge, its title, its readable meta and its processing status in
// words (BR-APP-07). A failed apport shows the reason the API returned and a « Réessayer » action.
import { StyleSheet, View } from 'react-native';

import type { ResourceListItem } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { radius, theme } from '../../../theme';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Chip } from '../../../ui/Chip';
import { Text } from '../../../ui/Text';

import { kindBadge, resourceMeta, statusLabel, statusTone } from './view-model';

const t = fr.module;

function badgeOf(kind: ResourceListItem['kind']): { background: string; ink: string } {
  if (kind === 'pdf' || kind === 'exam_guide') {
    return { background: theme.colors.indigoSoft, ink: theme.colors.indigoInk };
  }
  if (kind === 'image' || kind === 'audio' || kind === 'video') {
    return { background: theme.colors.limeSoft, ink: theme.colors.limeInk };
  }
  return { background: theme.colors.surfaceSubtle, ink: theme.colors.inkSecondary };
}

export interface ApportListProps {
  readonly resources: readonly ResourceListItem[];
  readonly onRetry: (id: string) => void;
}

/** Stack of the apports of one chapter. */
export function ApportList({ resources, onRetry }: ApportListProps) {
  return (
    <Card padded={false}>
      {resources.map((resource, index) => {
        const skin = badgeOf(resource.kind);
        return (
          <View
            key={resource.id}
            testID={`qf-apports-item-${resource.id}`}
            style={[styles.row, index === 0 ? null : styles.separator]}
          >
            <View style={[styles.badge, { backgroundColor: skin.background }]}>
              <Text variant="chip" style={{ color: skin.ink }}>
                {kindBadge(resource.kind)}
              </Text>
            </View>
            <View style={styles.grow}>
              <Text variant="title" numberOfLines={2}>
                {resource.title}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {resourceMeta(resource)}
              </Text>
              {resource.status === 'failed' && resource.errorMessage !== null ? (
                <Text variant="caption" tone="danger" numberOfLines={2}>
                  {resource.errorMessage}
                </Text>
              ) : null}
            </View>
            <View style={styles.trailing}>
              <Chip
                label={statusLabel(resource.status)}
                tone={statusTone(resource.status)}
                testID={`qf-apports-status-${resource.id}`}
              />
              {resource.status === 'failed' ? (
                <Button
                  label={t.retry}
                  variant="text"
                  size="sm"
                  onPress={() => {
                    onRetry(resource.id);
                  }}
                  testID={`qf-apports-retry-${resource.id}`}
                />
              ) : null}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  separator: { borderTopWidth: 1, borderTopColor: theme.colors.divider },
  badge: {
    width: 36,
    height: 36,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: { flex: 1, minWidth: 0, gap: 2 },
  trailing: { alignItems: 'flex-end', gap: theme.spacing.xs },
});
