// Écran « À propos » (SPEC-3502 EF-6 ; publication, BR-PLA-05).
//
// La version, le numéro de build et la version de runtime viennent du manifeste d'Expo
// (`expo-constants`), les licences du fichier **généré** `store/licenses.json`
// (`scripts/generate-licenses.mjs`), et les liens légaux du web (SPEC-806). Aucun texte de licence
// n'est recopié ici : l'écran affiche ce que le fichier versionné contient, ce qui rend une montée de
// version visible à l'écran après régénération.
import Constants from 'expo-constants';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import licenses from '../../../store/licenses.json';
import { openOnWeb } from '../../lib/web';
import { theme } from '../../theme';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { ListRow } from '../../ui/ListRow';
import { Text } from '../../ui/Text';

const t = fr.mobile.profile.about;

interface LicensesFile {
  readonly fonts: readonly { readonly name: string; readonly version: string; readonly license: string }[];
  readonly packages: readonly {
    readonly name: string;
    readonly version: string;
    readonly license: string;
  }[];
}

/** Le fichier généré est typé ici : une entrée manquante casse la compilation, pas l'écran. */
const file = licenses as unknown as LicensesFile;

/** `1.0.0` et `482` du manifeste, sans dépendre de la plateforme (EF-6). */
export function versionLabels(config: ExpoConfigLike | null): {
  version: string;
  build: string;
  runtime: string;
} {
  const androidCode = config?.android?.versionCode;
  const iosBuild = config?.ios?.buildNumber;
  const build =
    Platform.OS === 'ios'
      ? iosBuild === undefined
        ? '1'
        : String(iosBuild)
      : androidCode === undefined
        ? '1'
        : String(androidCode);
  return {
    version: typeof config?.version === 'string' ? config.version : '1.0.0',
    build,
    runtime: typeof config?.runtimeVersion === 'string' ? config.runtimeVersion : '—',
  };
}

interface ExpoConfigLike {
  readonly version?: unknown;
  readonly runtimeVersion?: unknown;
  readonly android?: { readonly versionCode?: number | string };
  readonly ios?: { readonly buildNumber?: number | string };
}

export interface AboutScreenProps {
  /** Manifeste lu par défaut dans `expo-constants` : injecté par les tests. */
  readonly manifest?: ExpoConfigLike | null;
  readonly onBack?: () => void;
  readonly onOpenWeb?: (path: string) => void;
}

/** Route `/profil/a-propos`. */
export function AboutScreen({ manifest, onBack, onOpenWeb }: AboutScreenProps = {}) {
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const config =
    manifest === undefined
      ? ((Constants.expoConfig ?? null) as ExpoConfigLike | null)
      : manifest;
  const labels = versionLabels(config);
  const open = onOpenWeb ?? ((path: string) => void openOnWeb(path));
  const entries = [...file.fonts, ...file.packages];
  const count = entries.length;

  return (
    <View style={styles.screen} testID="about-screen">
      <View style={[styles.nav, { paddingTop: insets.top + theme.spacing.sm }]}>
        <IconButton
          name="chevronLeft"
          accessibilityLabel={fr.mobile.profile.back}
          onPress={() => {
            onBack?.();
          }}
          testID="about-back"
        />
        <Text variant="eyebrow" tone="muted">
          {t.title}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        testID="about-scroll"
      >
        <View style={styles.card} testID="about-identity">
          <Text variant="sectionTitle">Learny</Text>
          <Text variant="rowSubtitle" tone="muted">
            {t.tagline}
          </Text>
          <View style={styles.values}>
            <Text variant="body" testID="about-version">
              {t.version(labels.version)}
            </Text>
            <Text variant="body" testID="about-build">
              {t.build(labels.build)}
            </Text>
            <Text variant="caption" tone="muted" testID="about-runtime">
              {t.runtime(labels.runtime)}
            </Text>
            <Text variant="caption" tone="muted" testID="about-platform">
              {t.platform(Platform.OS === 'ios' ? 'iOS' : 'Android')}
            </Text>
          </View>
        </View>

        <View style={styles.card} testID="about-licenses">
          <Text variant="sectionTitle">{t.licensesTitle}</Text>
          <Text variant="rowSubtitle" tone="muted">
            {t.licensesHint}
          </Text>
          <Text variant="body" testID="about-licenses-count">
            {t.licensesCount(count)}
          </Text>
          <Button
            label={expanded ? t.licensesHide : t.licensesShow}
            variant="outline"
            onPress={() => {
              setExpanded((value) => !value);
            }}
            testID="about-licenses-toggle"
            accessibilityLabel={expanded ? t.licensesHide : t.licensesShow}
          />
          {expanded ? (
            <View style={styles.licenses} testID="about-licenses-list">
              {entries.map((entry) => (
                <View key={`${entry.name}@${entry.version}`} style={styles.licenseRow}>
                  <Text variant="rowTitle" numberOfLines={1}>
                    {entry.name}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {`${entry.version} · ${entry.license}`}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.list} testID="about-legal">
          <ListRow
            testID="about-row-privacy"
            icon="shield"
            title={t.privacy}
            separator={false}
            onPress={() => {
              open('/legal/confidentialite');
            }}
          />
          <ListRow
            testID="about-row-terms"
            icon="book"
            title={t.terms}
            onPress={() => {
              open('/legal/cgu');
            }}
          />
          <ListRow
            testID="about-row-support"
            icon="help"
            title={t.support}
            onPress={() => {
              open('/parametres');
            }}
          />
        </View>

        <Text variant="caption" tone="muted" align="center" testID="about-copyright">
          {t.copyright}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.canvas },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
  },
  content: {
    gap: theme.spacing.lg,
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing.xxxl,
  },
  card: {
    gap: theme.spacing.xs,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surface,
  },
  values: { gap: theme.spacing.xs, paddingTop: theme.spacing.sm },
  licenses: { gap: theme.spacing.sm, paddingTop: theme.spacing.sm },
  licenseRow: { gap: 2 },
  list: { borderRadius: theme.radius.list, overflow: 'hidden' },
});
