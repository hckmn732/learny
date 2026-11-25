// Recherche globale (maquette Recherche.dc.html ; SPEC-212, SPEC-307).
//
// Un champ, des filtres par groupe et les résultats groupés du serveur : notions, chapitres et
// formations du lecteur, avec leur extrait. La requête part après une courte pause (CL-3), comme
// dans l'en-tête du web ; sous deux caractères, rien n'est demandé (EF-1). Un résultat ouvre le
// chemin interne du serveur dans le navigateur (ADR-3002 § 3) : l'application n'a pas de route
// native pour ces pages-là.
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import {
  normalizeSearchText,
  type SearchGroup,
  type SearchItem,
  type SearchKind,
} from '@learny/contracts';
import { fr } from '@learny/i18n';

import { openOnWeb } from '../../../lib/web';
import { theme } from '../../../theme';
import { Chip } from '../../../ui/Chip';
import { EmptyState } from '../../../ui/EmptyState';
import { ErrorState } from '../../../ui/ErrorState';
import { Icon } from '../../../ui/Icon';
import { IconButton } from '../../../ui/IconButton';
import { Skeleton } from '../../../ui/Skeleton';
import { Text } from '../../../ui/Text';

import { SEARCH_MIN_LENGTH, useGlobalSearch } from './data';
import { ExplorationScaffold } from './ExplorationScaffold';

const t = fr.mr.exploration.recherche;
const s = fr.search;

/** Pause de frappe avant la requête, celle de l'en-tête du web (CL-3). */
export const SEARCH_DEBOUNCE_MS = 150;

/** Ordre fixe des groupes du contrat (EF-2). */
const KINDS: readonly SearchKind[] = ['notion', 'chapter', 'formation'];

type Filter = SearchKind | 'all';

function totalOf(groups: readonly SearchGroup[]): number {
  return groups.reduce((sum, group) => sum + group.total, 0);
}

export interface RechercheScreenProps {
  readonly onBack: () => void;
}

/** Écran `/(app)/programme/recherche`. */
export function RechercheScreen({ onBack }: RechercheScreenProps) {
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const search = useGlobalSearch(debounced);
  const data = search.data;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(normalizeSearchText(text));
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [text]);

  const trimmed = normalizeSearchText(text);
  const eligible = Array.from(trimmed).length >= SEARCH_MIN_LENGTH;
  const groups = data === null ? [] : data.groups;
  const visible = groups.filter((group) => filter === 'all' || group.kind === filter);
  const total = totalOf(visible);

  let body: ReactNode;
  if (!eligible) {
    body = (
      <EmptyState
        title={s.page.shortTitle}
        description={s.shortHint}
        icon="search"
        testID="qf-recherche-hint"
      />
    );
  } else if (search.status === 'error') {
    body = (
      <ErrorState
        title={s.page.errorTitle}
        description={s.page.errorDescription}
        onRetry={search.refetch}
        testID="qf-recherche-error"
      />
    );
  } else if (data === null) {
    body = (
      <View style={styles.loading} testID="qf-recherche-loading" accessible accessibilityLabel={s.loading}>
        <Skeleton animated={false} height={64} />
        <Skeleton animated={false} height={64} />
      </View>
    );
  } else if (total === 0) {
    body = (
      <EmptyState
        title={s.page.emptyTitle}
        description={s.page.emptyDescription(data.query)}
        icon="search"
        testID={filter === 'all' ? 'qf-recherche-empty' : 'qf-recherche-filter-empty'}
      />
    );
  } else {
    body = (
      <View style={styles.groups} testID="qf-recherche-results">
        {visible.map((group) =>
          group.items.length === 0 ? null : (
            <View key={group.kind} style={styles.group} testID={`qf-recherche-group-${group.kind}`}>
              <View style={styles.groupHeader}>
                <Text variant="eyebrow" tone="muted">
                  {t.groups[group.kind]}
                </Text>
                <Text variant="caption" tone="muted">
                  {t.groupTotal(group.items.length, group.total)}
                </Text>
              </View>
              <View style={styles.rows}>
                {group.items.map((item: SearchItem, index) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={s.openResult(item.title)}
                    onPress={() => {
                      void openOnWeb(item.href);
                    }}
                    style={({ pressed }) => [
                      styles.row,
                      index === 0 ? null : styles.rowDivider,
                      pressed ? styles.rowPressed : null,
                    ]}
                    testID={`qf-recherche-result-${item.id}`}
                  >
                    <Text variant="rowTitle">{item.title}</Text>
                    {item.snippet === '' ? null : (
                      <Text variant="rowSubtitle" tone="muted" numberOfLines={2}>
                        {item.snippet}
                      </Text>
                    )}
                  </Pressable>
                ))}
              </View>
            </View>
          ),
        )}
      </View>
    );
  }

  return (
    <ExplorationScaffold eyebrow={t.eyebrow} title={t.title} testID="qf-recherche" onBack={onBack}>
      <View style={styles.field}>
        <Icon name="search" size={18} color={theme.colors.ink} />
        <TextInput
          testID="qf-recherche-field"
          accessibilityLabel={t.fieldLabel}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setText}
          onSubmitEditing={() => {
            setDebounced(normalizeSearchText(text));
          }}
          placeholder={s.placeholder}
          placeholderTextColor={theme.colors.inkMuted}
          returnKeyType="search"
          selectionColor={theme.colors.indigo}
          style={[theme.type.body, styles.input]}
          value={text}
        />
        {text === '' ? null : (
          <IconButton
            name="close"
            accessibilityLabel={t.cancel}
            onPress={() => {
              setText('');
            }}
            variant="plain"
            testID="qf-recherche-clear"
          />
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        accessibilityLabel={t.filtersLabel}
        testID="qf-recherche-filters"
      >
        <Chip
          label={t.filters.all}
          tone={filter === 'all' ? 'ink' : 'outline'}
          onPress={() => {
            setFilter('all');
          }}
          testID="qf-recherche-filter-all"
        />
        {KINDS.map((kind) => (
          <Chip
            key={kind}
            label={t.filters[kind]}
            tone={filter === kind ? 'ink' : 'outline'}
            onPress={() => {
              setFilter(kind);
            }}
            testID={`qf-recherche-filter-${kind}`}
          />
        ))}
      </ScrollView>
      <View accessibilityLiveRegion="polite">
        <Text variant="caption" tone="muted" testID="qf-recherche-count">
          {eligible ? s.page.total(total) : ''}
        </Text>
      </View>
      {body}
    </ExplorationScaffold>
  );
}

const styles = StyleSheet.create({
  field: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.ink,
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    minHeight: theme.controls.button.md,
    paddingHorizontal: theme.spacing.lg,
  },
  input: {
    color: theme.colors.ink,
    flex: 1,
    paddingVertical: theme.spacing.sm,
  },
  filters: { gap: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  loading: { gap: theme.spacing.md },
  groups: { gap: theme.spacing.lg },
  group: { gap: theme.spacing.xs },
  groupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xs,
  },
  rows: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.list,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: { gap: theme.spacing.xs, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
  rowDivider: { borderTopColor: theme.colors.divider, borderTopWidth: 1 },
  rowPressed: { backgroundColor: theme.colors.surfaceSubtle },
});