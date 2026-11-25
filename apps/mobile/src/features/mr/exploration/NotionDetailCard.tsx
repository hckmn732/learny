// Détail du nœud sélectionné de la carte des notions (maquettes Carte et CarteCerveau).
//
// Le panneau reste en pied d'écran : il ne masque jamais la grille ni le réseau, et il porte les
// trois actions du serveur (`courseHref`, `trainingHref`, `gapHref`). Un lien absent n'est jamais
// dessiné : le bouton disparaît au lieu de mener à une page vide (ET-5).
import { StyleSheet, View } from 'react-native';

import type { NotionGraphNode } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { theme } from '../../../theme';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { IconButton } from '../../../ui/IconButton';
import { ProgressBar } from '../../../ui/ProgressBar';
import { Text } from '../../../ui/Text';

import { statusLabel, statusOfNode } from './format';

const t = fr.mr.exploration.carte;

export interface NotionDetailCardProps {
  readonly node: NotionGraphNode;
  readonly relationCount: number;
  readonly onClose: () => void;
  readonly onTrain: (() => void) | null;
  readonly onCourse: (() => void) | null;
  readonly onGap: (() => void) | null;
}

/** Panneau de détail d'une notion, d'un module, d'un apport ou de la formation. */
export function NotionDetailCard({
  node,
  relationCount,
  onClose,
  onTrain,
  onCourse,
  onGap,
}: NotionDetailCardProps) {
  const status = statusOfNode(node);
  const actions = [
    onTrain === null
      ? null
      : { key: 'train', label: t.detail.train, onPress: onTrain, variant: 'primary' as const },
    onCourse === null
      ? null
      : { key: 'course', label: t.detail.course, onPress: onCourse, variant: 'outline' as const },
    onGap === null
      ? null
      : { key: 'gap', label: t.detail.gap, onPress: onGap, variant: 'outline' as const },
  ].filter((action): action is NonNullable<typeof action> => action !== null);

  return (
    <Card style={styles.card} testID="qf-carte-detail">
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text variant="eyebrow" tone="muted">
            {`${t.detail.kind[node.kind]} · ${statusLabel(status)}`}
          </Text>
          <Text variant="sheetTitle" numberOfLines={2} testID="qf-carte-detail-title">
            {node.label}
          </Text>
          {node.modulePosition === null || node.moduleTitle === null ? null : (
            <Text variant="caption" tone="muted">
              {t.detail.moduleLine(node.modulePosition, node.moduleTitle)}
            </Text>
          )}
        </View>
        <IconButton
          name="close"
          accessibilityLabel={t.detail.close}
          onPress={onClose}
          variant="plain"
          testID="qf-carte-detail-close"
        />
      </View>
      {node.mastery === null ? (
        <Text variant="caption" tone="muted">
          {t.detail.notSeen}
        </Text>
      ) : (
        <View style={styles.mastery}>
          <ProgressBar
            value={node.mastery / 100}
            label={t.detail.mastery(node.mastery)}
            testID="qf-carte-detail-mastery"
          />
          <Text variant="caption" tone="muted">
            {t.detail.mastery(node.mastery)}
          </Text>
        </View>
      )}
      <Text variant="caption" tone="muted">
        {t.detail.relationCount(relationCount)}
      </Text>
      {actions.length === 0 ? null : (
        <View style={styles.actions}>
          {actions.map((action) => (
            <Button
              key={action.key}
              label={action.label}
              onPress={action.onPress}
              size="sm"
              variant={action.variant}
              testID={`qf-carte-detail-${action.key}`}
            />
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: theme.spacing.sm },
  header: { alignItems: 'flex-start', flexDirection: 'row', gap: theme.spacing.sm },
  titleBlock: { flex: 1, gap: theme.spacing.xs },
  mastery: { gap: theme.spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
});
