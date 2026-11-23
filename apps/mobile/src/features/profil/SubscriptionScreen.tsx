// Écran Abonnement (SPEC-3401 EF-2, BR-SET-06 ; ADR-3006).
//
// Status of the entitlement and the end of the current period, and nothing else: the stores forbid
// selling or managing a subscription outside their purchase flow, so this screen shows no purchase
// button and no portal button (ET-3, CA-5). The status comes from `GET /billing/subscription`.
import { useRouter } from 'expo-router';

import { fr } from '@learny/i18n';

import { useSubscription } from '../../data/subscription';
import { formatUserDate } from '../../lib/dates';
import { Chip } from '../../ui/Chip';
import { ErrorState } from '../../ui/ErrorState';
import { Skeleton } from '../../ui/Skeleton';
import { Text } from '../../ui/Text';

import { SettingsScaffold, SettingsSection } from './SettingsScaffold';

const t = fr.mobile.profile.subscription;
const st = fr.settings.subscriptionTab;

/** Route body of `/profil/abonnement`. */
export function SubscriptionScreen() {
  const router = useRouter();
  const subscription = useSubscription();

  const close = (): void => {
    router.back();
  };

  if (subscription.status === 'error') {
    return (
      <SettingsScaffold title={t.title} testID="subscription-screen" onBack={close}>
        <ErrorState
          title={t.errorTitle}
          onRetry={subscription.refetch}
          testID="subscription-error"
        />
      </SettingsScaffold>
    );
  }

  if (subscription.data === null) {
    return (
      <SettingsScaffold title={t.title} testID="subscription-screen" onBack={close}>
        <Skeleton animated={false} />
        <Skeleton animated={false} width="60%" />
      </SettingsScaffold>
    );
  }

  const free = subscription.data.status === 'none';

  return (
    <SettingsScaffold
      title={t.title}
      testID="subscription-screen"
      onBack={close}
      subtitle={t.description}
    >
      <SettingsSection title={t.status} testID="subscription-status-section">
        <Chip
          label={st.statuses[subscription.data.status]}
          tone={free ? 'neutral' : 'green'}
          testID="subscription-status"
        />
        <Text variant="rowSubtitle" tone="secondary" testID="subscription-summary">
          {free ? t.freeSummary : t.paidSummary}
        </Text>
        {subscription.data.currentPeriodEnd === null ? null : (
          <Text variant="rowSubtitle" tone="muted" testID="subscription-period-end">
            {t.periodEnd(formatUserDate(subscription.data.currentPeriodEnd, null))}
          </Text>
        )}
      </SettingsSection>

      <Text variant="caption" tone="muted" testID="subscription-store-note">
        {t.storeNote}
      </Text>
    </SettingsScaffold>
  );
}
