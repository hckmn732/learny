// Mes lacunes (maquette Lacunes.dc.html ; SPEC-615 EF-1 à EF-4, ET-4, ET-5).
//
// L'écran reprend la page web `/formations/:fid/lacunes` : les lacunes ouvertes de la formation
// courante, le filtre par nature et, sur chaque carte, la révision ciblée et le passage du cours.
// La formation vient du sélecteur du shell (`/me/sidebar`), comme dans l'onglet Programme ; les
// liens d'action sont ceux du serveur, jamais reconstruits ici (ET-4, ET-5).
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { GapNature } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { messageFor } from '../../../api/errors';
import { useFormationOptions } from '../../../data/use-programme';
import { formatDateTime } from '../../../lib/dates';
import { openOnWeb } from '../../../lib/web';
import { theme } from '../../../theme';
import { Chip } from '../../../ui/Chip';
import { EmptyState } from '../../../ui/EmptyState';
import { ErrorState } from '../../../ui/ErrorState';
import { Skeleton } from '../../../ui/Skeleton';
import { Text } from '../../../ui/Text';

import { useLacunes } from './data';
import { ExplorationScaffold } from './ExplorationScaffold';
import { natureLabel } from './format';
import { LacunesCard } from './LacunesCard';

const t = fr.mr.exploration.lacunes;
const g = fr.gaps;

/** Les quatre natures du contrat, dans l'ordre de la maquette (SPEC-615 EF-2). */
const NATURES: readonly GapNature[] = [
  'forgetting',
  'confusion',
  'misunderstanding',
  'application',
];

/** « M1, M3 » : les positions de module d'une statistique du serveur. */
function modulesLabel(positions: readonly number[]): string | null {
  if (positions.length === 0) return null;
  return positions.map((position) => `M${String(position)}`).join(', ');
}

export interface LacunesScreenProps {
  readonly onBack: () => void;
}

/** Écran `/(app)/aujourdhui/lacunes`. */
export function LacunesScreen({ onBack }: LacunesScreenProps) {
  const options = useFormationOptions();
  const formationId =
    options.current?.id ??
    options.formations.find((formation) => formation.status === 'active')?.id ??
    null;
  const [nature, setNature] = useState<GapNature | null>(null);
  const gaps = useLacunes(formationId, nature);
  const [refreshing, setRefreshing] = useState(false);
  const data = gaps.data;

  const refresh = (): void => {
    setRefreshing(true);
    void options.refresh().finally(() => {
      setRefreshing(false);
    });
    gaps.refetch();
  };

  const loading = (
    <View style={styles.loading} testID="qf-lacunes-loading" accessible accessibilityLabel={g.loading}>
      <Skeleton animated={false} height={96} />
      <Skeleton animated={false} height={96} />
      <Skeleton animated={false} height={96} />
    </View>
  );

  let body: ReactNode;
  if (options.status === 'loading') {
    body = loading;
  } else if (formationId === null) {
    body = (
      <EmptyState
        title={t.noFormationTitle}
        description={t.noFormationDescription}
        icon="target"
        testID="qf-lacunes-empty"
      />
    );
  } else if (gaps.status === 'error' && data === null) {
    body = (
      <ErrorState
        title={g.errorTitle}
        description={g.errorDescription}
        onRetry={gaps.refetch}
        testID="qf-lacunes-error"
      />
    );
  } else if (data === null) {
    body = loading;
  } else if (data.items.length === 0) {
    body = (
      <EmptyState
        title={g.empty.title}
        description={g.empty.description}
        icon="cards"
        testID="qf-lacunes-empty"
      />
    );
  } else {
    body = (
      <View style={styles.list} testID="qf-lacunes-list">
        {data.items.map((gap) => {
          const courseHref = gap.course === null ? null : gap.course.href;
          return (
            <LacunesCard
              key={gap.notionId}
              gap={gap}
              timeZone={data.timezone}
              onTrain={() => {
                void openOnWeb(gap.training.href);
              }}
              onCourse={
                courseHref === null
                  ? null
                  : () => {
                      void openOnWeb(courseHref);
                    }
              }
            />
          );
        })}
      </View>
    );
  }

  return (
    <ExplorationScaffold
      eyebrow={t.eyebrow}
      title={t.title}
      testID="qf-lacunes"
      onBack={onBack}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      {data === null ? null : (
        <View style={styles.stats}>
          <Text variant="bodySmall" tone="secondary" testID="qf-lacunes-stats">
            {`${g.stats.notionCount(data.items.length)} · ${g.stats.masteredLabel(
              modulesLabel(data.summary.masteredModules),
            )}`}
          </Text>
          <Text variant="caption" tone="muted" testID="qf-lacunes-next-review">
            {data.nextReviewAt === null
              ? g.stats.nextNone
              : `${g.stats.nextLabel} ${formatDateTime(data.nextReviewAt, data.timezone)}`}
          </Text>
        </View>
      )}
      {data === null ? null : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
          accessibilityLabel={g.filters.label}
          testID="qf-lacunes-filters"
        >
          <Chip
            label={`${g.filters.all} · ${String(data.summary.openGaps)}`}
            tone={nature === null ? 'ink' : 'outline'}
            onPress={() => {
              setNature(null);
            }}
            testID="qf-lacunes-filter-all"
          />
          {NATURES.map((value) => (
            <Chip
              key={value}
              label={`${natureLabel(value)} · ${String(data.countsByNature[value])}`}
              tone={nature === value ? 'ink' : 'outline'}
              onPress={() => {
                setNature(value);
              }}
              testID={`qf-lacunes-filter-${value}`}
            />
          ))}
        </ScrollView>
      )}
      {gaps.status === 'error' && data !== null ? (
        <Text variant="caption" tone="danger" testID="qf-lacunes-error-hint">
          {messageFor(gaps.error)}
        </Text>
      ) : null}
      {body}
    </ExplorationScaffold>
  );
}

const styles = StyleSheet.create({
  stats: { gap: theme.spacing.xs },
  filters: { gap: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  loading: { gap: theme.spacing.md },
  list: { gap: theme.spacing.md },
});