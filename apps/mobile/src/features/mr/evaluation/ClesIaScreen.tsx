// Clés d'IA personnelles (zone C, maquette ClesIA.dc.html).
//
// BYOK : l'apprenant ajoute la clé d'un fournisseur, la teste (découverte des modèles), l'enregistre
// puis peut la supprimer. Rien n'est inventé ici : la liste, le masque et le statut viennent de
// `me.ai.credentials.list`, le test de `me.ai.credentials.discover` et l'écriture de
// `me.ai.credentials.create` (contrats de SPEC-505). Aucune clé en clair ne reste à l'écran après
// l'enregistrement.
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import type { AiCredentialProvider, CredentialDto } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { messageFor } from '../../../api/errors';
import { Pop, Rise } from '../motion';
import { theme } from '../../../theme';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Chip } from '../../../ui/Chip';
import { ErrorState } from '../../../ui/ErrorState';
import { Skeleton } from '../../../ui/Skeleton';
import { Text } from '../../../ui/Text';
import { Toast } from '../../../ui/Toast';
import { SettingsScaffold } from '../../profil/SettingsScaffold';

import { Field } from './Field';
import {
  createCredential,
  deleteCredential,
  discoverCredential,
  useAiCredentials,
} from './use-ai-credentials';

const t = fr.mr.evaluation.clesIa;
const ia = fr.onboarding.ia;

/** Les huit fournisseurs du contrat, dans l'ordre de la règle BR-IA-02. */
const PROVIDER_ORDER: readonly AiCredentialProvider[] = [
  'anthropic',
  'openai',
  'mistral',
  'deepseek',
  'opencode',
  'opencode_go',
  'openai_compatible',
  'local',
];

/** EF-3 — libellés déjà publiés par l'onboarding, complétés du fournisseur local. */
const PROVIDER_LABELS: Record<AiCredentialProvider, string> = {
  anthropic: ia.providers.anthropic,
  openai: ia.providers.openai,
  mistral: ia.providers.mistral,
  deepseek: ia.providers.deepseek,
  opencode: ia.providers.opencode,
  opencode_go: ia.providers.opencode_go,
  openai_compatible: ia.providers.openai_compatible,
  local: t.localLabel,
};

/** BR-IA-04 — fournisseurs dont les données sortent de l'Union européenne. */
const OUTSIDE_EU: readonly AiCredentialProvider[] = [
  'anthropic',
  'openai',
  'deepseek',
  'opencode',
  'opencode_go',
];

function needsBaseUrl(provider: AiCredentialProvider): boolean {
  return provider === 'openai_compatible' || provider === 'local';
}

function isOutsideEu(provider: AiCredentialProvider): boolean {
  return OUTSIDE_EU.includes(provider);
}

function statusTone(status: CredentialDto['status']): 'green' | 'neutral' | 'orange' {
  if (status === 'qualified') return 'green';
  if (status === 'failed') return 'orange';
  return 'neutral';
}

export interface ClesIaScreenProps {
  readonly onBack: () => void;
  /** Ouvre « Modèle par tâche » (`/profil/modeles`) après l'ajout d'une clé. */
  readonly onOpenModels: () => void;
}

/** Écran « Clés d'IA personnelles » : mes clés, puis ajout et test d'une clé. */
export function ClesIaScreen({ onBack, onOpenModels }: ClesIaScreenProps) {
  const credentials = useAiCredentials();
  const [provider, setProvider] = useState<AiCredentialProvider>('mistral');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [discovered, setDiscovered] = useState<readonly string[] | null>(null);
  const [busy, setBusy] = useState<'test' | 'save' | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const items = credentials.data?.items ?? [];

  function selectProvider(next: AiCredentialProvider): void {
    setProvider(next);
    setDiscovered(null);
    setError(null);
    setApiKey('');
    setBaseUrl('');
  }

  async function test(): Promise<void> {
    if (busy !== null) return;
    setError(null);
    setDiscovered(null);
    if (provider !== 'local' && apiKey.trim() === '') {
      setError(t.keyRequired);
      return;
    }
    if (needsBaseUrl(provider) && baseUrl.trim() === '') {
      setError(t.baseUrlRequired);
      return;
    }
    setBusy('test');
    try {
      const result = await discoverCredential({
        provider,
        ...(provider === 'local' ? {} : { apiKey: apiKey.trim() }),
        ...(needsBaseUrl(provider) ? { baseUrl: baseUrl.trim() } : {}),
      });
      if (result.modelIds.length === 0) {
        setError(t.testFailed);
        return;
      }
      setDiscovered(result.modelIds);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(null);
    }
  }

  async function save(): Promise<void> {
    if (busy !== null) return;
    if (discovered === null) {
      setError(t.testFirst);
      return;
    }
    setBusy('save');
    setError(null);
    try {
      await createCredential({
        provider,
        modelIds: [...discovered],
        ...(provider === 'local' ? {} : { apiKey: apiKey.trim() }),
        ...(needsBaseUrl(provider) ? { baseUrl: baseUrl.trim() } : {}),
      });
      setApiKey('');
      setBaseUrl('');
      setDiscovered(null);
      setToast(t.saved);
      await credentials.refetch();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string): Promise<void> {
    setDeletingId(id);
    setError(null);
    try {
      await deleteCredential(id);
      setToast(t.deleted);
      await credentials.refetch();
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setDeletingId(null);
    }
  }

  function confirmDelete(credential: CredentialDto): void {
    Alert.alert(t.deleteTitle, t.deleteBody, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.deleteConfirm,
        style: 'destructive',
        onPress: () => {
          void remove(credential.id);
        },
      },
    ]);
  }

  return (
    <SettingsScaffold
      title={t.eyebrow}
      testID="qf-cles-ia"
      onBack={onBack}
      toast={
        <Toast
          visible={toast !== null}
          message={toast ?? ''}
          onHide={() => {
            setToast(null);
          }}
          testID="qf-cles-ia-toast"
        />
      }
      footer={
        <Button
          label={busy === 'save' ? t.saving : t.save}
          block
          loading={busy === 'save'}
          disabled={discovered === null || busy !== null}
          onPress={() => {
            void save();
          }}
          testID="qf-cles-ia-save"
        />
      }
    >
      <Text variant="largeTitle">{t.title}</Text>
      <Text variant="body" tone="secondary">
        {t.intro}
      </Text>

      <Card testID="qf-cles-ia-byok">
        <Text variant="bodySmall" tone="secondary">
          {t.byok}
        </Text>
        <Text variant="caption" tone="muted">
          {t.cost}
        </Text>
      </Card>

      <View style={styles.section} testID="qf-cles-ia-keys">
        <Text variant="sectionTitle">{t.keysTitle}</Text>
        {credentials.status === 'loading' ? <Skeleton animated={false} /> : null}
        {credentials.status === 'error' ? (
          <ErrorState
            title={t.keysError}
            onRetry={() => {
              void credentials.refetch();
            }}
            testID="qf-cles-ia-keys-error"
          />
        ) : null}
        {credentials.status === 'ready' && items.length === 0 ? (
          <Text variant="bodySmall" tone="muted" testID="qf-cles-ia-keys-empty">
            {t.keysEmpty}
          </Text>
        ) : null}
        {items.map((credential, index) => (
          <Rise key={credential.id} index={index}>
            <Card testID={`qf-cles-ia-key-${credential.id}`}>
              <View style={styles.keyHead}>
                <View style={styles.grow}>
                  <Text variant="title">{credential.providerLabel}</Text>
                  <Text variant="caption" tone="muted">
                    {credential.keyMasked === null ? t.noKey : t.yourKey(credential.keyMasked)}
                  </Text>
                </View>
                <Chip
                  label={t.status[credential.status]}
                  tone={statusTone(credential.status)}
                  testID={`qf-cles-ia-status-${credential.id}`}
                />
              </View>
              <View style={styles.row}>
                <Text variant="caption" tone="secondary">
                  {t.modelsCount(credential.modelIds.length)}
                </Text>
                {credential.outsideEu ? <Chip label={t.outsideEu} tone="orange" /> : null}
              </View>
              {credential.outsideEu ? (
                <Text variant="caption" tone="danger">
                  {t.regionWarning}
                </Text>
              ) : null}
              <Button
                label={deletingId === credential.id ? t.deleting : t.deleteKey}
                variant="outline"
                size="sm"
                loading={deletingId === credential.id}
                onPress={() => {
                  confirmDelete(credential);
                }}
                testID={`qf-cles-ia-delete-${credential.id}`}
              />
            </Card>
          </Rise>
        ))}
        {items.length === 0 ? null : (
          <Button
            label={t.chooseModels}
            variant="text"
            onPress={onOpenModels}
            testID="qf-cles-ia-models-link"
          />
        )}
      </View>

      <View style={styles.section} testID="qf-cles-ia-form">
        <Text variant="sectionTitle">{t.formTitle}</Text>
        <Text variant="label" tone="secondary">
          {t.providersTitle}
        </Text>
        <View style={styles.grid}>
          {PROVIDER_ORDER.map((id) => {
            const selected = id === provider;
            return (
              <Pressable
                key={id}
                testID={`qf-cles-ia-provider-${id}`}
                accessibilityRole="button"
                accessibilityLabel={PROVIDER_LABELS[id]}
                accessibilityState={{ selected }}
                onPress={() => {
                  selectProvider(id);
                }}
                style={[styles.provider, selected ? styles.providerOn : styles.providerOff]}
              >
                <Text variant="chip" tone={selected ? 'inverse' : 'primary'} numberOfLines={1}>
                  {PROVIDER_LABELS[id]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {needsBaseUrl(provider) ? (
          <Field
            label={t.formUrl}
            value={baseUrl}
            onChangeText={setBaseUrl}
            placeholder={t.formUrlPlaceholder}
            keyboardType="url"
            autoCapitalize="none"
            testID="qf-cles-ia-url"
          />
        ) : null}

        {provider === 'local' ? (
          <Text variant="caption" tone="muted">
            {t.noKey}
          </Text>
        ) : (
          <Field
            label={t.formKey}
            value={apiKey}
            onChangeText={setApiKey}
            placeholder={t.formKeyPlaceholder}
            secureTextEntry
            autoCapitalize="none"
            testID="qf-cles-ia-key"
          />
        )}

        {isOutsideEu(provider) ? (
          <Text variant="caption" tone="danger" testID="qf-cles-ia-region">
            {t.regionWarning}
          </Text>
        ) : null}

        <Button
          label={busy === 'test' ? t.testing : t.test}
          variant="outline"
          loading={busy === 'test'}
          disabled={busy !== null}
          onPress={() => {
            void test();
          }}
          testID="qf-cles-ia-test"
        />

        {discovered === null ? null : (
          <Pop>
            <View style={styles.discovered} testID="qf-cles-ia-models">
              <Text variant="bodySmall" tone="success" testID="qf-cles-ia-test-ok">
                {t.tested(discovered.length)}
              </Text>
              <Text variant="label" tone="secondary">
                {t.modelsTitle}
              </Text>
              <View style={styles.chips}>
                {discovered.slice(0, 6).map((modelId) => (
                  <Chip key={modelId} label={modelId} />
                ))}
              </View>
            </View>
          </Pop>
        )}

        {error === null ? null : (
          <Text variant="caption" tone="danger" testID="qf-cles-ia-error">
            {error}
          </Text>
        )}
      </View>
    </SettingsScaffold>
  );
}

const styles = StyleSheet.create({
  section: { gap: theme.spacing.md },
  grow: { flex: 1 },
  keyHead: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  provider: {
    minHeight: theme.minTouchTarget.height,
    flexBasis: '30%',
    flexGrow: 1,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  providerOn: { backgroundColor: theme.colors.ink, borderColor: theme.colors.ink },
  providerOff: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
  discovered: { gap: theme.spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
});
