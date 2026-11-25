// Mode « grille » de la carte des notions (maquette Carte.dc.html ; SPEC-616 EF-2, BR-CAR-02).
//
// La légende, puis un bloc par module : son titre, son score et une case par notion, colorée selon
// la maîtrise. Les cases sont de vraies cibles tactiles (44 pt de haut) : la maquette dessine des
// carrés de 22 px, trop petits pour un doigt, donc la grille passe à six colonnes lisibles.
import { Pressable, StyleSheet, View } from 'react-native';

import type { NotionGraphNode } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { theme } from '../../../theme';
import { Card } from '../../../ui/Card';
import { Text } from '../../../ui/Text';

import { statusColor, statusLabel, statusOfNode, type ModuleGroup, type NotionStatus } from './format';

const t = fr.mr.exploration.carte;

/** Colonnes de la grille : six cases de 44 pt sur la largeur utile d'un téléphone. */
const COLUMNS = 6;

/** Les quatre états de la légende, dans l'ordre de la maquette. */
const LEGEND: readonly NotionStatus[] = ['mastered', 'inProgress', 'fragile', 'upcoming'];

function chunk<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

export interface CarteGridProps {
  readonly groups: readonly ModuleGroup[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}

/** Carte des notions en grille, module par module. */
export function CarteGrid({ groups, selectedId, onSelect }: CarteGridProps) {
  return (
    <View style={styles.base} testID="qf-carte-grid">
      <View style={styles.legend} accessibilityLabel={t.legendLabel} testID="qf-carte-legend">
        {LEGEND.map((status) => (
          <View key={status} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: statusColor(status) }]} />
            <Text variant="caption" tone="secondary">
              {statusLabel(status)}
            </Text>
          </View>
        ))}
      </View>
      <View accessibilityLabel={t.gridLabel} style={styles.modules}>
        {groups.map((group) => (
          <Card key={group.module.id} style={styles.module} testID={`qf-carte-module-${group.module.id}`}>
            <View style={styles.moduleHeader}>
              <Text variant="title" numberOfLines={1} style={styles.moduleTitle}>
                {group.module.label}
              </Text>
              <Text variant="caption" tone="muted" testID={`qf-carte-score-${group.module.id}`}>
                {t.moduleScore(group.mastered, group.notions.length)}
              </Text>
            </View>
            <View style={styles.cells}>
              {chunk(group.notions, COLUMNS).map((row, rowIndex) => (
                <View key={rowIndex} style={styles.row}>
                  {row.map((notion: NotionGraphNode) => {
                    const status = statusOfNode(notion);
                    const selected = notion.id === selectedId;
                    return (
                      <Pressable
                        key={notion.id}
                        accessibilityLabel={t.cellLabel(notion.label, statusLabel(status))}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => {
                          onSelect(notion.id);
                        }}
                        style={[
                          styles.cell,
                          { backgroundColor: statusColor(status) },
                          selected ? styles.cellSelected : null,
                        ]}
                        testID={`qf-carte-cell-${notion.id}`}
                      />
                    );
                  })}
                </View>
              ))}
            </View>
          </Card>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { gap: theme.spacing.lg },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: theme.spacing.xs },
  legendDot: { borderRadius: theme.radius.badge, height: 12, width: 12 },
  modules: { gap: theme.spacing.md },
  module: { gap: theme.spacing.sm },
  moduleHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
    justifyContent: 'space-between',
  },
  moduleTitle: { flex: 1 },
  cells: { gap: theme.spacing.sm },
  row: { flexDirection: 'row', gap: theme.spacing.sm },
  cell: {
    borderRadius: theme.radius.badge,
    flexGrow: 1,
    flexShrink: 1,
    height: theme.minTouchTarget.height,
  },
  cellSelected: {
    borderColor: theme.colors.ink,
    borderWidth: 2,
  },
});