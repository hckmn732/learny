// Programme proposé par le tuteur (zone B, maquette Proposition.dc.html).
//
// La proposition vient du serveur (`GET /formations/:fid/programme`) : modules, chapitres et dates.
// « Ajuster » ouvre la feuille de demande d'ajustement (le tuteur produit une nouvelle version),
// « C'est parti » valide le programme et l'active. Un programme déjà actif n'affiche plus la
// proposition mais l'état actif, avec le lien vers l'onglet Programme.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import { Rise, Shine, Twinkle } from '../motion';
import { theme } from '../../../theme';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Chip } from '../../../ui/Chip';
import { ErrorState } from '../../../ui/ErrorState';
import { Icon } from '../../../ui/Icon';
import { IconButton } from '../../../ui/IconButton';
import { Sheet } from '../../../ui/Sheet';
import { Skeleton } from '../../../ui/Skeleton';
import { Text } from '../../../ui/Text';

import { buildPropositionView } from './proposition-view';
import { useOnboardingState } from './use-onboarding';
import { useProposition, usePropositionActions } from './use-proposition';

const t = fr.mr.creation.proposition;

function errorMessage(code: string): string {
  const errors = t.errors as Readonly<Record<string, string>>;
  return errors[code] ?? t.errors.GENERIC;
}

/** Écran du programme proposé. */
export function PropositionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ fid?: string }>();
  const fid = typeof params.fid === 'string' && params.fid !== '' ? params.fid : null;
  const proposition = useProposition(fid);
  const actions = usePropositionActions(fid);
  const onboarding = useOnboardingState();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [localCode, setLocalCode] = useState<string | null>(null);

  const model = proposition.proposal?.proposal ?? null;
  const view = model === null ? null : buildPropositionView(model);
  const weekly =
    onboarding.state === null
      ? null
      : onboarding.state.preferences.hoursPerDay * onboarding.state.preferences.studyDays.length;

  const back = (): void => {
    if (router.canGoBack()) router.back();
    else router.replace('/programme');
  };

  const openAdjust = (): void => {
    setLocalCode(null);
    setMessage('');
    setAdjustOpen(true);
  };

  const generate = async (): Promise<void> => {
    setLocalCode(null);
    await actions.generate();
  };

  const validate = async (): Promise<void> => {
    if (model === null) return;
    const outcome = await actions.validate(model.version);
    if (outcome.ok) router.replace('/programme');
  };

  const submitAdjust = async (): Promise<void> => {
    if (model === null) return;
    const trimmed = message.trim();
    if (trimmed === '') {
      setLocalCode('ADJUST_EMPTY');
      return;
    }
    setLocalCode(null);
    const outcome = await actions.adjust(trimmed, model.version);
    if (outcome.ok) {
      setAdjustOpen(false);
      setMessage('');
    }
  };

  const code = localCode ?? actions.errorCode;
  const visibleCode = code === 'ADJUST_EMPTY' ? null : code;
  const adjusting = actions.adjusting;

  return (
    <View
      testID="qf-proposition"
      style={[styles.screen, { paddingTop: insets.top + theme.spacing.sm }]}
    >
      <View style={styles.header}>
        <Button
          label={t.back}
          variant="text"
          size="sm"
          onPress={back}
          testID="qf-proposition-back"
        />
        {model === null ? null : (
          <>
            <Text variant="eyebrow" tone="muted">
              {t.eyebrow}
            </Text>
            <Text variant="heroTitle">{t.heading(model.title)}</Text>
            <View style={styles.chips}>
              <Chip label={t.modules(view?.modules.length ?? model.modules.length)} />
              {weekly === null ? null : <Chip label={t.weeklyHours(weekly)} />}
              <Chip
                tone="lime"
                label={view?.endDate == null ? t.noEndDate : t.endDate(view.endDate)}
              />
            </View>
          </>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {proposition.status === 'loading' ? (
          <View style={styles.state} testID="qf-proposition-loading">
            <Skeleton animated={false} />
            <Skeleton animated={false} width="80%" />
            <Skeleton animated={false} width="60%" />
          </View>
        ) : null}

        {proposition.status === 'error' ? (
          <ErrorState
            title={t.errorTitle}
            onRetry={proposition.retry}
            testID="qf-proposition-error"
          />
        ) : null}

        {proposition.active && proposition.state !== null ? (
          <Card testID="qf-proposition-active">
            <Text variant="sectionTitle">{t.activeTitle}</Text>
            <Text variant="bodySmall" tone="secondary">
              {t.activeBody}
            </Text>
            <Button
              label={t.openProgramme}
              variant="ink"
              onPress={() => {
                router.replace('/programme');
              }}
              testID="qf-proposition-open"
            />
          </Card>
        ) : null}

        {proposition.status === 'ready' && model === null && !proposition.active ? (
          <Card testID="qf-proposition-empty">
            <Text variant="sectionTitle">{t.emptyTitle}</Text>
            <Text variant="bodySmall" tone="secondary">
              {t.emptyBody}
            </Text>
            <Button
              label={actions.generating ? t.generating : t.generate}
              loading={actions.generating}
              onPress={() => {
                void generate();
              }}
              testID="qf-proposition-generate"
            />
            {actions.generating ? (
              <Text variant="caption" tone="muted">
                {t.generatingHint}
              </Text>
            ) : null}
          </Card>
        ) : null}

        {visibleCode === null ? null : (
          <View style={styles.error} testID="qf-proposition-error-banner">
            <Text variant="caption" tone="danger">
              {errorMessage(visibleCode)}
            </Text>
          </View>
        )}

        {model !== null && view !== null ? (
          <View style={styles.modules}>
            {view.modules.map((module, index) => (
              <Rise key={module.position} index={index} step={70}>
                <View
                  style={styles.module}
                  testID={`qf-proposition-module-${String(module.position)}`}
                >
                  <View style={styles.badge}>
                    <Text variant="caption">{module.position}</Text>
                  </View>
                  <View style={styles.moduleText}>
                    <Text variant="title">{module.title}</Text>
                    <Text variant="caption" tone="muted">
                      {t.moduleMeta(module.notions, module.hours)}
                    </Text>
                  </View>
                  <IconButton
                    name="list"
                    accessibilityLabel={t.reorder}
                    onPress={() => {
                      setLocalCode(null);
                      setMessage(t.reorderHint.replace('{title}', module.title));
                      setAdjustOpen(true);
                    }}
                    testID={`qf-proposition-reorder-${String(module.position)}`}
                  />
                </View>
              </Rise>
            ))}

            <View style={styles.hint} testID="qf-proposition-hint">
              <Twinkle>
                <Icon name="sparkles" size={20} color={theme.colors.indigo} />
              </Twinkle>
              <Text variant="caption" tone="indigoInk" style={styles.hintText}>
                {t.adjustHint}
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {model === null ? null : (
        <View style={[styles.footer, { paddingBottom: insets.bottom + theme.spacing.md }]}>
          <View style={styles.adjustAction}>
            <Button
              label={t.adjust}
              variant="outline"
              block
              onPress={openAdjust}
              testID="qf-proposition-adjust"
            />
          </View>
          <View style={styles.startAction}>
            <Shine>
              <Button
                label={actions.validating ? t.validating : t.start}
                loading={actions.validating}
                block
                onPress={() => {
                  void validate();
                }}
                testID="qf-proposition-start"
              />
            </Shine>
          </View>
        </View>
      )}

      <Sheet
        visible={adjustOpen}
        onClose={() => {
          setAdjustOpen(false);
        }}
        title={t.adjustTitle}
        testID="qf-proposition-adjust-sheet"
      >
        <Text variant="bodySmall" tone="secondary">
          {t.adjustDescription}
        </Text>
        <Text variant="title">{t.adjustLabel}</Text>
        <TextInput
          testID="qf-proposition-adjust-input"
          accessibilityLabel={t.adjustLabel}
          placeholder={t.adjustPlaceholder}
          placeholderTextColor={theme.colors.inkMuted}
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={500}
          style={styles.adjustInput}
        />
        {code === 'ADJUST_EMPTY' ? (
          <Text variant="caption" tone="danger" testID="qf-proposition-adjust-error">
            {t.adjustPlaceholder}
          </Text>
        ) : null}
        {visibleCode === null ? null : (
          <Text variant="caption" tone="danger">
            {errorMessage(visibleCode)}
          </Text>
        )}
        <Button
          label={adjusting ? t.adjusting : t.adjustSubmit}
          loading={adjusting}
          onPress={() => {
            void submitAdjust();
          }}
          testID="qf-proposition-adjust-submit"
        />
        <Button
          label={t.adjustCancel}
          variant="text"
          onPress={() => {
            setAdjustOpen(false);
          }}
          testID="qf-proposition-adjust-cancel"
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.canvas },
  header: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  content: {
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.md,
  },
  state: { gap: theme.spacing.sm },
  modules: { gap: theme.spacing.sm },
  module: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.option,
    backgroundColor: theme.colors.surface,
  },
  badge: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.badge,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  moduleText: { flex: 1, gap: theme.spacing.xs },
  hint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
    padding: theme.spacing.md,
    borderRadius: theme.radius.option,
    backgroundColor: theme.colors.indigoSoft,
  },
  hintText: { flex: 1 },
  error: {
    gap: theme.spacing.sm,
    alignItems: 'flex-start',
    padding: theme.spacing.lg,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    borderColor: theme.colors.orange,
    backgroundColor: theme.colors.orangeSoft,
  },
  footer: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    backgroundColor: theme.colors.surface,
  },
  adjustAction: { flex: 1 },
  startAction: { flex: 1.4 },
  adjustInput: {
    ...theme.type.bodySmall,
    minHeight: 96,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.surface,
    color: theme.colors.ink,
    textAlignVertical: 'top',
  },
});
