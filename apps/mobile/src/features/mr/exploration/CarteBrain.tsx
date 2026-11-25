// Mode « cerveau » de la carte des notions (maquette CarteCerveau.dc.html ; SPEC-616 EF-3, EF-5).
//
// Le réseau est dessiné avec `react-native-svg` (déjà installé, comme `Icon`) : les positions
// viennent de `layoutGraph` (déterministes), les couleurs de `format.ts`. Le geste est libre —
// glisser pour déplacer, pincer pour zoomer — et trois boutons de 44 pt font la même chose au
// clavier et au lecteur d'écran : la carte n'est jamais seulement un dessin. Une liste accessible
// énumère les nœuds et leurs relations, pour les lecteurs d'écran comme pour les tests.
import { useCallback, useMemo, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import Svg, { Circle, G, Line } from 'react-native-svg';

import type { NotionGraphLink, NotionGraphNode } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { theme } from '../../../theme';
import { Icon } from '../../../ui/Icon';
import { Text } from '../../../ui/Text';

import {
  linkColor,
  relationsOf,
  relationText,
  statusColor,
  statusLabel,
  statusOfNode,
} from './format';
import { layoutGraph } from './graph-layout';

const t = fr.mr.exploration.carte;

const CANVAS_HEIGHT = 380;
const MIN_SCALE = 0.6;
const MAX_SCALE = 2.6;

interface ViewState {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

interface Touch {
  readonly pageX: number;
  readonly pageY: number;
}

interface Interaction {
  readonly view: ViewState;
  readonly start: ViewState & { readonly distance: number };
}

const INITIAL: Interaction = {
  view: { x: 0, y: 0, scale: 1 },
  start: { x: 0, y: 0, scale: 1, distance: 0 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function touchesOf(event: GestureResponderEvent): readonly Touch[] {
  return event.nativeEvent.touches;
}

function touchDistance(touches: readonly Touch[]): number {
  const first = touches[0];
  const second = touches[1];
  if (first === undefined || second === undefined) return 0;
  return Math.hypot(second.pageX - first.pageX, second.pageY - first.pageY);
}

interface ZoomButtonProps {
  readonly label: string;
  readonly text: string;
  readonly onPress: () => void;
  readonly testID: string;
}

/** Bouton de zoom texte : « + » et « − » restent lisibles sans icône dédiée. */
function ZoomButton({ label, text, onPress, testID }: ZoomButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.zoomButton}
      testID={testID}
    >
      <Text variant="sectionTitle">{text}</Text>
    </Pressable>
  );
}

export interface CarteBrainProps {
  readonly nodes: readonly NotionGraphNode[];
  readonly links: readonly NotionGraphLink[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}

/** Réseau des notions, zoomable et déplaçable, avec sa liste accessible. */
export function CarteBrain({ nodes, links, selectedId, onSelect }: CarteBrainProps) {
  const { width } = useWindowDimensions();
  const canvasWidth = Math.max(260, width - theme.spacing.xl * 2);
  const layout = useMemo(
    () => layoutGraph({ nodes, links }, canvasWidth, CANVAS_HEIGHT),
    [nodes, links, canvasWidth],
  );
  const [interaction, setInteraction] = useState<Interaction>(INITIAL);
  const view = interaction.view;
  const [listOpen, setListOpen] = useState(false);

  const onGrant = useCallback((event: GestureResponderEvent) => {
    const touches = touchesOf(event);
    setInteraction((previous) => ({
      ...previous,
      start: {
        ...previous.view,
        distance: touches.length >= 2 ? touchDistance(touches) : 0,
      },
    }));
  }, []);

  const onMove = useCallback(
    (event: GestureResponderEvent, gesture: PanResponderGestureState) => {
      const touches = touchesOf(event);
      setInteraction((previous) => {
        if (touches.length >= 2) {
          const distance = touchDistance(touches);
          if (previous.start.distance <= 0 || distance <= 0) return previous;
          return {
            ...previous,
            view: {
              x: previous.view.x,
              y: previous.view.y,
              scale: clamp(
                previous.start.scale * (distance / previous.start.distance),
                MIN_SCALE,
                MAX_SCALE,
              ),
            },
          };
        }
        return {
          ...previous,
          view: {
            x: clamp(previous.start.x + gesture.dx, -canvasWidth, canvasWidth),
            y: clamp(previous.start.y + gesture.dy, -CANVAS_HEIGHT, CANVAS_HEIGHT),
            scale: previous.view.scale,
          },
        };
      });
    },
    [canvasWidth],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: onGrant,
        onPanResponderMove: onMove,
      }),
    [onGrant, onMove],
  );

  const zoomBy = useCallback((factor: number) => {
    setInteraction((previous) => ({
      ...previous,
      view: {
        ...previous.view,
        scale: clamp(previous.view.scale * factor, MIN_SCALE, MAX_SCALE),
      },
    }));
  }, []);

  const reset = useCallback(() => {
    setInteraction((previous) => ({ ...previous, view: { x: 0, y: 0, scale: 1 } }));
  }, []);

  const sections = (['module', 'notion', 'source', 'formation'] as const)
    .map((kind) => ({ kind, items: nodes.filter((node) => node.kind === kind) }))
    .filter((section) => section.items.length > 0);

  const viewBox = `0 0 ${String(canvasWidth)} ${String(CANVAS_HEIGHT)}`;
  const transform = `translate(${String(view.x)} ${String(view.y)}) scale(${String(view.scale)})`;

  return (
    <View style={styles.base} testID="qf-carte-brain">
      <View style={styles.toolbar}>
        <Text variant="caption" tone="muted" style={styles.hint}>
          {t.brain.hint}
        </Text>
        <View style={styles.zoom}>
          <ZoomButton
            label={t.brain.zoomIn}
            text="+"
            onPress={() => {
              zoomBy(1.25);
            }}
            testID="qf-carte-zoom-in"
          />
          <ZoomButton
            label={t.brain.zoomOut}
            text="−"
            onPress={() => {
              zoomBy(0.8);
            }}
            testID="qf-carte-zoom-out"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.brain.reset}
            onPress={reset}
            style={styles.zoomButton}
            testID="qf-carte-zoom-reset"
          >
            <Icon name="refresh" size={20} color={theme.colors.ink} />
          </Pressable>
        </View>
      </View>
      <View
        style={styles.canvas}
        {...responder.panHandlers}
        testID="qf-carte-canvas"
        accessible
        accessibilityLabel={t.brain.label}
      >
        <Svg width={canvasWidth} height={CANVAS_HEIGHT} viewBox={viewBox}>
          <G transform={transform}>
            {links.map((link) => {
              const from = layout.positions.get(link.from);
              const to = layout.positions.get(link.to);
              if (from === undefined || to === undefined) return null;
              return (
                <Line
                  key={link.id}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={linkColor(link.kind)}
                  strokeWidth={link.kind === 'confusion' ? 1.8 : 1}
                  strokeLinecap="round"
                  opacity={0.55}
                />
              );
            })}
            {layout.nodes.map((node) => {
              const source = nodes.find((candidate) => candidate.id === node.id);
              if (source === undefined) return null;
              const status = statusOfNode(source);
              const selected = node.id === selectedId;
              return (
                <G
                  key={node.id}
                  onPress={() => {
                    onSelect(node.id);
                  }}
                >
                  {selected ? (
                    <Circle
                      cx={node.x}
                      cy={node.y}
                      r={node.radius + 6}
                      fill="none"
                      stroke={theme.colors.ink}
                      strokeWidth={2}
                    />
                  ) : null}
                  <Circle
                    cx={node.x}
                    cy={node.y}
                    r={node.radius}
                    fill={statusColor(status)}
                    opacity={source.kind === 'source' ? 0.85 : 1}
                  />
                </G>
              );
            })}
          </G>
        </Svg>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={listOpen ? t.brain.hideList : t.brain.showList}
        accessibilityState={{ expanded: listOpen }}
        onPress={() => {
          setListOpen((previous) => !previous);
        }}
        style={styles.toggle}
        testID="qf-carte-list-toggle"
      >
        <Text variant="buttonSmall">{listOpen ? t.brain.hideList : t.brain.showList}</Text>
      </Pressable>
      {listOpen ? (
        <View style={styles.list} accessibilityLabel={t.brain.listLabel} testID="qf-carte-list">
          <Text variant="caption" tone="muted">
            {t.brain.listHint}
          </Text>
          {sections.map((section) => (
            <View key={section.kind} style={styles.section}>
              <Text variant="eyebrow" tone="muted">
                {t.detail.kind[section.kind]}
              </Text>
              {section.items.map((node) => {
                const relations = relationsOf(node.id, nodes, links);
                return (
                  <Pressable
                    key={node.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${node.label}. ${statusLabel(statusOfNode(node))}. ${t.detail.relationCount(relations.length)}`}
                    accessibilityState={{ selected: node.id === selectedId }}
                    onPress={() => {
                      onSelect(node.id);
                    }}
                    style={styles.item}
                    testID={`qf-carte-list-item-${node.id}`}
                  >
                    <Text variant="rowTitle">{node.label}</Text>
                    <Text variant="caption" tone="muted">
                      {statusLabel(statusOfNode(node))}
                    </Text>
                    {relations.length === 0 ? (
                      <Text variant="caption" tone="muted">
                        {t.brain.noRelations}
                      </Text>
                    ) : (
                      relations.map((relation) => (
                        <Text key={relation.id} variant="caption" tone="secondary">
                          {relationText(relation)}
                        </Text>
                      ))
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { gap: theme.spacing.md },
  toolbar: { alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm },
  hint: { flex: 1 },
  zoom: { flexDirection: 'row', gap: theme.spacing.xs },
  zoomButton: {
    alignItems: 'center',
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    height: theme.minTouchTarget.height,
    justifyContent: 'center',
    width: theme.minTouchTarget.height,
  },
  canvas: {
    backgroundColor: theme.colors.darkSurface,
    borderRadius: theme.radius.card,
    overflow: 'hidden',
  },
  toggle: {
    alignItems: 'center',
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: theme.minTouchTarget.height,
    paddingHorizontal: theme.spacing.lg,
  },
  list: { gap: theme.spacing.sm },
  section: { gap: theme.spacing.xs },
  item: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
  },
});