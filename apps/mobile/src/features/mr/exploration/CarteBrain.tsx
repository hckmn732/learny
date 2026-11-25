// Mode « cerveau » de la carte des notions (maquette CarteCerveau.dc.html ; SPEC-616 EF-3, EF-5).
//
// Le réseau est dessiné avec `react-native-svg` (déjà installé, comme `Icon`) : les positions
// viennent de `layoutGraph` (déterministes), les couleurs de `format.ts`. Le geste est libre —
// glisser pour déplacer, pincer pour zoomer — et trois boutons de 44 pt font la même chose au
// clavier et au lecteur d'écran : la carte n'est jamais seulement un dessin. Une liste accessible
// énumère les nœuds et leurs relations, pour les lecteurs d'écran comme pour les tests.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';

import { useLoop, useStillMotion } from '../motion';

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

const CANVAS_HEIGHT = 460;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedLine = Animated.createAnimatedComponent(Line);
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

/** Ring pulsing around a fragile notion (maquette : les notions fragiles pulsent). */
function PulseRing({
  x,
  y,
  r,
  color,
}: {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly color: string;
}) {
  const loop = useLoop(900);
  const props = useAnimatedProps(() => ({
    r: r + 4 + loop.value * 6,
    opacity: 0.7 - loop.value * 0.55,
  }));
  return (
    <AnimatedCircle
      cx={x}
      cy={y}
      fill="none"
      stroke={color}
      strokeWidth={2}
      animatedProps={props}
    />
  );
}

/** Signal flowing along a link of the selected notion. */
function FlowLine({
  x1,
  y1,
  x2,
  y2,
  color,
}: {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly color: string;
}) {
  const reduced = useStillMotion();
  const offset = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    offset.value = withRepeat(withTiming(-40, { duration: 1400, easing: Easing.linear }), -1);
  }, [offset, reduced]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: offset.value }));
  return (
    <AnimatedLine
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeDasharray="3 9"
      animatedProps={props}
    />
  );
}

/** Breathing halo of a module cluster. */
function ClusterHalo({
  x,
  y,
  r,
  color,
  delay,
}: {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly color: string;
  readonly delay: number;
}) {
  const loop = useLoop(1600, delay);
  const props = useAnimatedProps(() => ({
    opacity: 0.07 + loop.value * 0.07,
    r: r + loop.value * 4,
  }));
  return <AnimatedCircle cx={x} cy={y} fill={color} animatedProps={props} />;
}

interface Cluster {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly color: string;
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
  // Clusters : chaque module et les notions qu'il contient forment un halo nommé (maquette).
  const clusters = useMemo((): readonly Cluster[] => {
    const result: Cluster[] = [];
    for (const module of nodes.filter((node) => node.kind === 'module')) {
      const memberIds = links
        .filter((link) => link.kind === 'contains' && link.from === module.id)
        .map((link) => link.to);
      const points = [module.id, ...memberIds]
        .map((id) => layout.positions.get(id))
        .filter((point): point is { x: number; y: number } => point !== undefined);
      if (points.length === 0) continue;
      const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
      const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
      const r = Math.max(34, ...points.map((point) => Math.hypot(point.x - x, point.y - y) + 18));
      const statuses = nodes.filter((node) => memberIds.includes(node.id)).map(statusOfNode);
      const color = statuses.includes('fragile')
        ? theme.colors.orange
        : statuses.length > 0 && statuses.every((status) => status === 'mastered')
          ? theme.colors.green
          : theme.colors.lime;
      result.push({
        id: module.id,
        label: module.label.toUpperCase().slice(0, 18),
        x,
        y,
        r,
        color,
      });
    }
    return result;
  }, [layout, links, nodes]);
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
            {clusters.map((cluster, index) => (
              <ClusterHalo
                key={`halo-${cluster.id}`}
                x={cluster.x}
                y={cluster.y}
                r={cluster.r}
                color={cluster.color}
                delay={index * 250}
              />
            ))}
            {links.map((link) => {
              const from = layout.positions.get(link.from);
              const to = layout.positions.get(link.to);
              if (from === undefined || to === undefined) return null;
              const touched =
                selectedId !== null && (link.from === selectedId || link.to === selectedId);
              return (
                <Line
                  key={link.id}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={linkColor(link.kind)}
                  strokeWidth={link.kind === 'confusion' ? 1.6 : 1}
                  strokeLinecap="round"
                  opacity={selectedId === null ? 0.4 : touched ? 0.7 : 0.14}
                />
              );
            })}
            {selectedId === null
              ? null
              : links
                  .filter((link) => link.from === selectedId || link.to === selectedId)
                  .map((link) => {
                    const from = layout.positions.get(link.from);
                    const to = layout.positions.get(link.to);
                    if (from === undefined || to === undefined) return null;
                    return (
                      <FlowLine
                        key={`flow-${link.id}`}
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        color={link.kind === 'confusion' ? theme.colors.orange : theme.colors.lime}
                      />
                    );
                  })}
            {clusters.map((cluster) => (
              <SvgText
                key={`label-${cluster.id}`}
                x={cluster.x}
                y={cluster.y - cluster.r - 6}
                fill={theme.colors.onDarkMuted}
                fontSize={9}
                fontWeight="600"
                letterSpacing={1.1}
                textAnchor="middle"
              >
                {cluster.label}
              </SvgText>
            ))}
            {layout.nodes.map((node) => {
              const source = nodes.find((candidate) => candidate.id === node.id);
              if (source === undefined) return null;
              const status = statusOfNode(source);
              const color = statusColor(status);
              const selected = node.id === selectedId;
              const related = links.some(
                (link) =>
                  (link.from === selectedId && link.to === node.id) ||
                  (link.to === selectedId && link.from === node.id),
              );
              const dim = selectedId !== null && !selected && !related;
              return (
                <G
                  key={node.id}
                  opacity={dim ? 0.35 : 1}
                  onPress={() => {
                    onSelect(node.id);
                  }}
                >
                  <Circle cx={node.x} cy={node.y} r={node.radius + 7} fill={color} opacity={0.12} />
                  <Circle cx={node.x} cy={node.y} r={node.radius + 3} fill={color} opacity={0.28} />
                  {status === 'fragile' ? (
                    <PulseRing x={node.x} y={node.y} r={node.radius} color={theme.colors.orange} />
                  ) : null}
                  {selected ? (
                    <Circle
                      cx={node.x}
                      cy={node.y}
                      r={node.radius + 6}
                      fill="none"
                      stroke={theme.colors.white}
                      strokeWidth={2}
                    />
                  ) : null}
                  <Circle
                    cx={node.x}
                    cy={node.y}
                    r={node.radius}
                    fill={color}
                    opacity={source.kind === 'source' ? 0.85 : 1}
                  />
                  <Circle
                    cx={node.x}
                    cy={node.y}
                    r={Math.max(12, node.radius + 6)}
                    fill="transparent"
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
    backgroundColor: theme.colors.ink,
    borderColor: theme.colors.darkSurface,
    borderRadius: theme.radius.sheet,
    borderWidth: 1,
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
