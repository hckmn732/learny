// Bilan final d'une formation terminée (maquette Bilan.dc.html, écran n° 2 de la zone A).
//
// One read (`GET /formations/:fid/final-review`) supplies everything: the result, the figures, the
// strong modules, the fragile notions and the memory interview. The two actions are native — the
// share sheet of the system, and the notion map of the programme — except the certificate, whose
// route does not exist yet: the button says so instead of inventing a file.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { FinalReviewDto, FinalReviewMode } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { requireApiClient } from '../../../api/registry';
import { radius, theme } from '../../../theme';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Chip } from '../../../ui/Chip';
import { ErrorState } from '../../../ui/ErrorState';
import { IconButton } from '../../../ui/IconButton';
import { Skeleton } from '../../../ui/Skeleton';
import { StatCard } from '../../../ui/StatCard';
import { Text } from '../../../ui/Text';
import { Toast } from '../../../ui/Toast';

import { mrKeys, useFinalReview } from './data';
import { hoursLabel } from './view-model';

const t = fr.mr.programme.bilan;
const f = fr.finalReview;

const MAX_STRENGTHS = 3;
const MAX_GAPS = 4;

export interface BilanScreenProps {
  readonly formationId: string;
  readonly onBack: () => void;
  /** Opens the frozen notion map of the formation. */
  readonly onOpenMap: () => void;
}

/** Screen « Bilan de la formation ». */
export function BilanScreen({ formationId, onBack, onOpenMap }: BilanScreenProps) {
  const queryClient = useQueryClient();
  const bilan = useFinalReview(formationId);
  const data = bilan.data;
  const [toast, setToast] = useState<string | null>(null);

  const maintenance = useMutation({
    mutationFn: (mode: FinalReviewMode) =>
      requireApiClient().api.setMaintenance({
        params: { fid: formationId },
        body: { mode, expectedUpdatedAt: data?.updatedAt ?? '' },
      }),
    onSuccess: (updated: FinalReviewDto) => {
      queryClient.setQueryData(mrKeys.bilan(formationId), updated);
      setToast(
        updated.maintenance.mode === 'stopped'
          ? f.maintenance.currentStopped
          : f.maintenance.currentLight,
      );
    },
    onError: () => {
      setToast(f.maintenance.error);
    },
  });

  const share = async (): Promise<void> => {
    if (data === null) return;
    try {
      await Share.share({
        title: t.shareTitle,
        message: t.shareMessage(data.formationTitle, data.stats.resultPercent),
      });
    } catch {
      setToast(t.shareError);
    }
  };

  const strengths = (data?.modules ?? [])
    .filter((module) => module.masteredCount > 0)
    .sort((left, right) => right.masteredCount - left.masteredCount)
    .slice(0, MAX_STRENGTHS);

  const body = (): ReactNode => {
    if (bilan.status === 'loading') {
      return (
        <View style={styles.loading} testID="qf-bilan-loading">
          <Skeleton animated={false} height={148} />
          <Skeleton animated={false} height={76} />
          <Skeleton animated={false} height={120} />
        </View>
      );
    }
    if (bilan.status === 'error' || data === null) {
      return (
        <ErrorState
          title={t.errorTitle}
          description={t.errorBody}
          onRetry={bilan.retry}
          testID="qf-bilan-error"
        />
      );
    }

    return (
      <>
        <View style={styles.hero} testID="qf-bilan-hero">
          <Text variant="label" tone="limeInk">
            {t.eyebrow}
          </Text>
          <Text variant="heroTitle">{data.formationTitle}</Text>
          <View style={styles.resultRow}>
            <Text variant="figure">
              {data.stats.resultPercent === null
                ? f.result(null)
                : t.mastery(data.stats.resultPercent)}
            </Text>
            {data.stats.resultPercent === null ? null : (
              <Text variant="bodySmall" tone="limeInk">
                {t.masteryLabel}
              </Text>
            )}
            {data.weeks === null ? null : (
              <Text variant="bodySmall" tone="limeInk">
                {t.weeks(data.weeks)}
              </Text>
            )}
          </View>
          <Text variant="caption" tone="limeInk">
            {f.completed(data.completedOn, data.weeks)}
          </Text>
        </View>

        <View style={styles.stats} testID="qf-bilan-stats">
          <View style={styles.stat}>
            <StatCard
              label={t.stats.notions}
              value={String(data.stats.totalNotions)}
              testID="qf-bilan-stat-notions"
            />
          </View>
          <View style={styles.stat}>
            <StatCard
              label={t.stats.hours}
              value={hoursLabel(data.stats.completedMinutes)}
              testID="qf-bilan-stat-hours"
            />
          </View>
          <View style={styles.stat}>
            <StatCard
              label={t.stats.fragile}
              value={String(data.stats.fragileNotions)}
              testID="qf-bilan-stat-fragile"
            />
          </View>
        </View>
        <Text variant="caption" tone="muted" testID="qf-bilan-retention">
          {`${f.stats.retention(data.retention.oneMonth)} · ${f.stats.retentionLabel}`}
        </Text>

        <Card testID="qf-bilan-strengths">
          <Text variant="sectionTitle">{t.strengthsTitle}</Text>
          {strengths.length === 0 ? (
            <Text variant="bodySmall" tone="muted">
              {t.strengthsEmpty}
            </Text>
          ) : (
            strengths.map((module) => (
              <View key={module.moduleId} style={styles.line}>
                <Text variant="bodySmall" tone="success">
                  ✓
                </Text>
                <Text variant="bodySmall" tone="secondary" style={styles.grow}>
                  {t.strengthsLine(module.masteredCount, module.title)}
                </Text>
              </View>
            ))
          )}
        </Card>

        <Card testID="qf-bilan-watch">
          <Text variant="sectionTitle">{t.watchTitle}</Text>
          {data.gaps.length === 0 ? (
            <Text variant="bodySmall" tone="muted">
              {t.watchEmpty}
            </Text>
          ) : (
            data.gaps.slice(0, MAX_GAPS).map((gap) => (
              <View key={gap.notionId} style={styles.line}>
                <View style={styles.grow}>
                  <Text variant="bodySmall" tone="secondary">
                    {gap.label}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {`${gap.natureLabel} · ${f.fragile.module(gap.modulePosition)}`}
                  </Text>
                </View>
                <Chip
                  label={f.fragile.mastery(gap.mastery)}
                  tone="orange"
                  testID={`qf-bilan-gap-${gap.notionId}`}
                />
              </View>
            ))
          )}
        </Card>

        <Card testID="qf-bilan-maintenance">
          <Text variant="sectionTitle">{t.maintenanceTitle}</Text>
          <Text variant="bodySmall" tone="muted">
            {t.maintenanceHint}
          </Text>
          <Text variant="caption" tone="secondary" testID="qf-bilan-due">
            {t.due(data.dueCount)}
          </Text>
          <Button
            label={f.maintenance.light}
            variant={data.maintenance.mode === 'light' ? 'primary' : 'outline'}
            disabled={maintenance.isPending}
            onPress={() => {
              maintenance.mutate('light');
            }}
            testID="qf-bilan-maintenance-light"
          />
          <Button
            label={f.maintenance.stopped}
            variant={data.maintenance.mode === 'stopped' ? 'primary' : 'outline'}
            disabled={maintenance.isPending}
            onPress={() => {
              maintenance.mutate('stopped');
            }}
            testID="qf-bilan-maintenance-stopped"
          />
          <Text variant="caption" tone="muted">
            {f.maintenance.effects[data.maintenance.mode ?? 'none']}
          </Text>
          <Button label={t.mapAction} variant="text" onPress={onOpenMap} testID="qf-bilan-map" />
        </Card>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']} testID="qf-bilan">
      <View style={styles.nav}>
        <IconButton
          name="chevronLeft"
          accessibilityLabel={f.title}
          onPress={onBack}
          testID="qf-bilan-back"
        />
        <Text variant="eyebrow" tone="muted">
          {f.title}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {body()}
      </ScrollView>

      {data === null ? null : (
        <View style={styles.footer}>
          <Button
            label={t.share}
            variant="ink"
            block
            onPress={() => {
              void share();
            }}
            testID="qf-bilan-share"
          />
          <Button
            label={t.attestation}
            variant="outline"
            block
            // TODO(quickfix) : aucune route d'attestation dans le contrat (api/openapi.yaml) ;
            // le bouton annonce l'indisponibilité au lieu d'inventer un fichier.
            onPress={() => {
              setToast(t.attestationUnavailable);
            }}
            testID="qf-bilan-attestation"
          />
        </View>
      )}

      <Toast
        visible={toast !== null}
        message={toast ?? ''}
        onHide={() => {
          setToast(null);
        }}
        testID="qf-bilan-toast"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.canvas },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  content: {
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  loading: { gap: theme.spacing.sm },
  hero: {
    gap: theme.spacing.xs,
    borderRadius: radius.card,
    backgroundColor: theme.colors.lime,
    padding: theme.spacing.lg,
  },
  resultRow: { flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm },
  stats: { flexDirection: 'row', gap: theme.spacing.sm },
  stat: { flex: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  grow: { flex: 1, minWidth: 0 },
  footer: {
    gap: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
});