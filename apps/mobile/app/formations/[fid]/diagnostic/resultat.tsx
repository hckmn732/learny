// Résultat du diagnostic et premier chapitre (SPEC-4003 ET-1, EF-8, SCR-24, étape 6).
//
// Ligne de score (absente si le diagnostic a été passé), titre du nombre de modules acquis, carte
// noire du premier chapitre et liste de préparation. Aucun score n'est recalculé : le pourcentage
// et les modules acquis viennent du serveur (EF-10 de SPEC-4001).
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { isActiveProgramme } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { useAttempt, useAttemptResult } from '../../../../src/data/attempts';
import { useModuleCourse, useProgramme } from '../../../../src/data/use-programme';
import { GenerationList } from '../../../../src/simple/GenerationList';
import { ReadyCard } from '../../../../src/simple/ReadyCard';
import { SimpleHeader } from '../../../../src/simple/SimpleHeader';
import { useSimpleState } from '../../../../src/simple/use-simple';
import { acquiredTitle, scoreLine } from '../../../../src/simple/view-model';
import { theme } from '../../../../src/theme';
import { Card } from '../../../../src/ui/Card';
import { Chip } from '../../../../src/ui/Chip';
import { Skeleton } from '../../../../src/ui/Skeleton';
import { Text } from '../../../../src/ui/Text';

const t = fr.mobile.simple.result;

export default function DiagnosticResultRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fid?: string; aid?: string; skipped?: string }>();
  const fid = typeof params.fid === 'string' ? params.fid : '';
  const aid = typeof params.aid === 'string' && params.aid !== '' ? params.aid : null;
  const skipped = params.skipped === '1';
  const result = useAttemptResult(skipped ? null : aid);
  const attempt = useAttempt(aid);
  const simple = useSimpleState(fid === '' ? null : fid);
  const programme = useProgramme(fid === '' ? null : fid);

  const proposalState =
    programme.data !== null && !isActiveProgramme(programme.data) ? programme.data : null;
  const proposal = proposalState?.proposal ?? null;
  const acquired = result.data?.acquiredModuleIds ?? [];
  const total = attempt.data?.total ?? 0;
  const score = skipped ? null : (result.data?.score ?? null);
  const line = scoreLine({ skipped, score, total });
  const first = proposal?.modules[0] ?? null;
  const generation = simple.data?.generation ?? [];
  const generationModule =
    first === null
      ? null
      : (generation.find((module) => module.position === first.position) ?? null);
  const course = useModuleCourse(generationModule?.moduleId ?? null);
  const chapter = first?.chapters[0] ?? null;
  const pages =
    first !== null &&
    first.pageFrom !== null &&
    first.pageFrom !== undefined &&
    first.pageTo !== null &&
    first.pageTo !== undefined
      ? `p. ${String(first.pageFrom)}–${String(first.pageTo)}`
      : null;
  const minutes = course.data?.course?.readingMinutes ?? null;

  const start = (): void => {
    if (generationModule === null) {
      router.push('/programme');
      return;
    }
    const selected = course.data?.selectedChapterId ?? null;
    router.push(
      selected === null
        ? `/cours/${generationModule.moduleId}`
        : `/cours/${generationModule.moduleId}?chapitre=${selected}`,
    );
  };

  return (
    <View style={styles.screen} testID="simple-result-screen">
      <SimpleHeader
        title={t.readyEyebrow}
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/aujourdhui');
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {result.status === 'loading' && !skipped ? <Skeleton animated={false} lines={3} /> : null}
        {skipped ? (
          <Chip label={t.skipped} tone="green" icon="check" testID="simple-result-skipped" />
        ) : line === null ? null : (
          <Chip label={line} tone="green" icon="check" testID="simple-result-score" />
        )}
        <Text variant="largeTitle" testID="simple-result-title">
          {acquiredTitle(acquired.length)}
        </Text>
        {first === null ? null : (
          <Text variant="bodySmall" tone="secondary">
            {t.body(proposal?.modules.length ?? 0, first.plannedEnd)}
          </Text>
        )}

        {first !== null && chapter !== null ? (
          <ReadyCard
            modulePosition={first.position}
            moduleTitle={first.title}
            chapterTitle={chapter.title}
            minutes={minutes}
            exercises={null}
            pages={pages}
            onStart={start}
            onProgramme={() => {
              router.push('/programme');
            }}
          />
        ) : (
          <Card testID="simple-ready-missing">
            <Text variant="bodySmall" tone="muted">
              {t.noneReady}
            </Text>
          </Card>
        )}

        <Card>
          <GenerationList state={simple.data} />
          {generation.length === 0 ? (
            <Text variant="caption" tone="muted">
              {t.noneReady}
            </Text>
          ) : null}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.canvas },
  content: { padding: theme.spacing.xl, paddingBottom: theme.spacing.xxxl, gap: theme.spacing.md },
});
