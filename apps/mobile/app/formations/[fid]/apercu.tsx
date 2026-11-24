// Aperçu du programme proposé (SPEC-4003 ET-1, EF-6, SCR-23, étape 4).
//
// Le serveur fournit les modules, les pages et les dates ; l'écran affiche quatre modules, les
// indicateurs, l'échéance native et les deux actions. « C'est parti » valide la proposition puis
// ouvre le diagnostic ; « Ajuster avec le tuteur » garde la transition du mode tuteur (web).
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isActiveProgramme } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { messageFor } from '../../../src/api/errors';
import { useProgramme } from '../../../src/data/use-programme';
import { clock } from '../../../src/lib/clock';
import { formatIsoDay } from '../../../src/lib/dates';
import { openOnWeb } from '../../../src/lib/web';
import { DeadlineBlock, KpiGrid, ModuleList } from '../../../src/simple/PreviewBlocks';
import { SimpleHeader } from '../../../src/simple/SimpleHeader';
import {
  useCreateDiagnostic,
  useDeadline,
  useSimpleState,
  useValidateProgramme,
} from '../../../src/simple/use-simple';
import { theme } from '../../../src/theme';
import { Button } from '../../../src/ui/Button';
import { Card } from '../../../src/ui/Card';
import { Chip } from '../../../src/ui/Chip';
import { Skeleton } from '../../../src/ui/Skeleton';
import { Text } from '../../../src/ui/Text';
import { Toast } from '../../../src/ui/Toast';

const t = fr.mobile.simple.preview;

function codeOf(error: unknown): string {
  return error !== null && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';
}

export default function PreviewRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ fid?: string }>();
  const fid = typeof params.fid === 'string' ? params.fid : '';
  const simple = useSimpleState(fid === '' ? null : fid);
  const programme = useProgramme(fid === '' ? null : fid);
  const validator = useValidateProgramme(fid === '' ? null : fid);
  const diagnostic = useCreateDiagnostic(fid === '' ? null : fid);
  const deadline = useDeadline(fid === '' ? null : fid);
  const [toast, setToast] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [hasDeadline, setHasDeadline] = useState(false);
  const [busy, setBusy] = useState(false);

  const proposal =
    programme.data !== null && !isActiveProgramme(programme.data) ? programme.data.proposal : null;
  const title =
    programme.data === null
      ? (simple.data?.title ?? '')
      : isActiveProgramme(programme.data)
        ? programme.data.formation.title
        : programme.data.title;
  const sources = simple.data?.sources ?? [];
  const fromLabel = sources.map((source) => source.title).join(', ');
  const deadlineLabel = hasDeadline
    ? formatIsoDay(new Date(clock.now().getTime() + 15 * 86_400_000))
    : null;

  const saveDeadline = async (endDate: string | null): Promise<void> => {
    try {
      await deadline.save(endDate);
      setHasDeadline(endDate !== null);
      await programme.refresh();
      await simple.refetch();
    } catch (error) {
      setToast(messageFor(error));
    }
  };

  const start = async (): Promise<void> => {
    if (proposal === null) {
      setToast(t.noProposal);
      return;
    }
    setBusy(true);
    try {
      await validator.validate(proposal.version);
      const attemptId = await diagnostic.create();
      router.replace({ pathname: '/formations/[fid]/diagnostic', params: { fid, aid: attemptId } });
    } catch (error) {
      if (codeOf(error) === 'DIAGNOSTIC_ALREADY_DONE') {
        router.push(`/formations/${fid}/resultat?skipped=0`);
        return;
      }
      if (codeOf(error) === 'FORMATION_LIMIT_REACHED') {
        setToast(t.limitReached);
        return;
      }
      setToast(error instanceof Error && 'code' in error ? messageFor(error) : t.validateFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen} testID="simple-preview-screen">
      <SimpleHeader
        title={title}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/aujourdhui');
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {programme.status === 'loading' || simple.status === 'loading' ? (
          <Skeleton animated={false} lines={5} />
        ) : null}
        <Chip label={t.ready} tone="lime" icon="check" />
        <Text variant="bodySmall" tone="secondary">
          {`D’après ${fromLabel}`}
        </Text>
        <KpiGrid proposal={proposal} />
        <DeadlineBlock
          hasDeadline={hasDeadline}
          deadlineLabel={deadlineLabel}
          onNoDeadline={() => void saveDeadline(null)}
          onPickDeadline={() => {
            setPickerVisible(true);
          }}
          showPicker={pickerVisible}
          picker={
            <DateTimePicker
              value={new Date(clock.now().getTime() + 15 * 86_400_000)}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              minimumDate={new Date(clock.now().getTime() + 15 * 86_400_000)}
              onValueChange={(_event, date) => {
                if (Platform.OS !== 'ios') setPickerVisible(false);
                void saveDeadline(formatIsoDay(date));
              }}
              onDismiss={() => {
                setPickerVisible(false);
              }}
            />
          }
        />
        <ModuleList proposal={proposal} />
        {proposal === null ? (
          <Card>
            <Text variant="bodySmall" tone="muted">
              {t.noProposal}
            </Text>
          </Card>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.md }]}>
        <Button
          label={t.start}
          block
          loading={busy || validator.pending || diagnostic.pending}
          disabled={proposal === null}
          onPress={() => void start()}
          testID="simple-start"
        />
        <Button
          label={t.adjust}
          variant="outline"
          block
          icon="chat"
          onPress={() => {
            void openOnWeb(`/formations/${fid}/programme`);
          }}
          testID="simple-adjust"
        />
        <Text variant="caption" tone="muted" align="center">
          {t.generationHint}
        </Text>
      </View>

      <Toast
        visible={toast !== null}
        message={toast ?? ''}
        onHide={() => {
          setToast(null);
        }}
        testID="simple-preview-toast"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.canvas },
  content: { padding: theme.spacing.xl, paddingBottom: theme.spacing.xxxl, gap: theme.spacing.md },
  footer: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.canvas,
    gap: theme.spacing.sm,
  },
});
