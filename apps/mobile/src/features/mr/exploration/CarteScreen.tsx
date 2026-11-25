// Carte des notions (maquettes Carte.dc.html et CarteCerveau.dc.html ; SPEC-616 EF-1 à EF-5).
//
// Un seul écran, deux modes : la grille par module et le réseau interactif. `?mode=cerveau` ouvre
// le réseau (la route transmet le mode initial), et le sélecteur segmenté permet de passer de
// l'un à l'autre sans quitter l'écran. Les deux modes lisent le même graphe et le même panneau de
// détail, donc une notion sélectionnée garde son détail quand on change de mode.
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { NotionGraphNode } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { openOnWeb } from '../../../lib/web';
import { theme } from '../../../theme';
import { Chip } from '../../../ui/Chip';
import type { ChipTone } from '../../../ui/Chip';
import { EmptyState } from '../../../ui/EmptyState';
import { ErrorState } from '../../../ui/ErrorState';
import { Segmented } from '../../../ui/Segmented';
import { Skeleton } from '../../../ui/Skeleton';

import { CarteBrain } from './CarteBrain';
import { CarteGrid } from './CarteGrid';
import { useNotionGraph } from './data';
import { ExplorationScaffold } from './ExplorationScaffold';
import {
  isFormationId,
  moduleGroupsOf,
  relationsOf,
  statusLabel,
  statusOfNode,
  type NotionStatus,
} from './format';
import { NotionDetailCard } from './NotionDetailCard';

const t = fr.mr.exploration.carte;
const n = fr.notionGraph;

/** Les deux modes de la carte ; `?mode=cerveau` choisit le second. */
export type CarteMode = 'grille' | 'cerveau';

const TONES: Record<NotionStatus, ChipTone> = {
  mastered: 'green',
  inProgress: 'lime',
  fragile: 'orange',
  upcoming: 'outline',
};

export interface CarteScreenProps {
  readonly formationId: string | null;
  readonly initialMode?: CarteMode;
  readonly onBack: () => void;
}

function countStatus(nodes: readonly NotionGraphNode[]): Record<NotionStatus, number> {
  const counts: Record<NotionStatus, number> = {
    mastered: 0,
    inProgress: 0,
    fragile: 0,
    upcoming: 0,
  };
  for (const node of nodes) {
    if (node.kind !== 'notion') continue;
    counts[statusOfNode(node)] += 1;
  }
  return counts;
}

/** Écran `/(app)/programme/carte/[fid]`. */
export function CarteScreen({ formationId, initialMode = 'grille', onBack }: CarteScreenProps) {
  const valid = isFormationId(formationId);
  const graph = useNotionGraph(valid ? formationId : null);
  const [mode, setMode] = useState<CarteMode>(initialMode);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const data = graph.data;
  const nodes = data === null ? [] : data.nodes;
  const links = data === null ? [] : data.links;
  const selected = nodes.find((node) => node.id === selectedId) ?? null;
  const counts = countStatus(nodes);

  const closeDetail = (): void => {
    setSelectedId(null);
  };

  const footer = ((): ReactNode => {
    if (selected === null) return undefined;
    const trainingHref = selected.trainingHref;
    const courseHref = selected.courseHref;
    const gapHref = selected.gapHref;
    return (
      <NotionDetailCard
        node={selected}
        relationCount={relationsOf(selected.id, nodes, links).length}
        onClose={closeDetail}
        onTrain={
          trainingHref === null
            ? null
            : () => {
                void openOnWeb(trainingHref);
              }
        }
        onCourse={
          courseHref === null
            ? null
            : () => {
                void openOnWeb(courseHref);
              }
        }
        onGap={
          gapHref === null
            ? null
            : () => {
                void openOnWeb(gapHref);
              }
        }
      />
    );
  })();

  let body: ReactNode;
  if (!valid) {
    body = (
      <EmptyState
        title={n.invalidId}
        description={t.eyebrow}
        icon="alert"
        testID="qf-carte-invalid"
      />
    );
  } else if (graph.status === 'error') {
    body = (
      <ErrorState
        title={n.errorTitle}
        description={n.errorDescription}
        onRetry={graph.refetch}
        testID="qf-carte-error"
      />
    );
  } else if (data === null) {
    body = (
      <View
        style={styles.loading}
        testID="qf-carte-loading"
        accessible
        accessibilityLabel={n.loading}
      >
        <Skeleton animated={false} height={120} />
        <Skeleton animated={false} height={120} />
      </View>
    );
  } else if (data.stats.notions === 0) {
    body = (
      <EmptyState
        title={n.empty.title}
        description={n.empty.description}
        icon="layers"
        testID="qf-carte-empty"
      />
    );
  } else if (mode === 'cerveau') {
    body = (
      <CarteBrain nodes={nodes} links={links} selectedId={selectedId} onSelect={setSelectedId} />
    );
  } else {
    body = (
      <CarteGrid groups={moduleGroupsOf(nodes)} selectedId={selectedId} onSelect={setSelectedId} />
    );
  }

  return (
    <ExplorationScaffold
      eyebrow={data === null ? t.eyebrow : data.formationTitle}
      title={t.title}
      testID="qf-carte"
      onBack={onBack}
      subtitle={
        data === null
          ? undefined
          : n.statsLine(data.stats.notions, data.stats.links, data.stats.modules)
      }
      footer={footer}
    >
      {valid ? (
        <Segmented
          label={t.viewLabel}
          onChange={(value) => {
            setMode(value === 'cerveau' ? 'cerveau' : 'grille');
          }}
          options={[
            { value: 'grille', label: t.views.grid },
            { value: 'cerveau', label: t.views.brain },
          ]}
          testID="qf-carte-mode"
          value={mode}
        />
      ) : null}
      {data === null || data.stats.notions === 0 ? null : (
        <View style={styles.stats} testID="qf-carte-stats">
          {(Object.keys(TONES) as readonly NotionStatus[]).map((status) => (
            <Chip
              key={status}
              label={`${String(counts[status])} ${statusLabel(status)}`}
              tone={TONES[status]}
              testID={`qf-carte-count-${status}`}
            />
          ))}
        </View>
      )}
      {body}
    </ExplorationScaffold>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  loading: { gap: theme.spacing.md },
});
