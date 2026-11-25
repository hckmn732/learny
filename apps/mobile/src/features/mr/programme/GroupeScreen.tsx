// Formation à plusieurs (maquette Groupe.dc.html, écran n° 3 de la zone A).
//
// The members the API projects (first name, current module, validated modules, streak), the
// invitation code and its share sheet, the role of each member and the privacy sentence. Joining
// another group by code is the only write that leaves this formation. No private fact of another
// member is ever read: the contract of `GroupDto` already limits it (BR-GRP-03).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { GroupDto, GroupMemberView } from '@learny/contracts';
import { isAppError } from '@learny/core';
import { fr } from '@learny/i18n';

import { requireApiClient } from '../../../api/registry';
import { webBaseUrl, webUrl } from '../../../lib/web';
import { radius, theme } from '../../../theme';
import { Avatar } from '../../../ui/Avatar';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Chip } from '../../../ui/Chip';
import { EmptyState } from '../../../ui/EmptyState';
import { ErrorState } from '../../../ui/ErrorState';
import { IconButton } from '../../../ui/IconButton';
import { Sheet } from '../../../ui/Sheet';
import { Skeleton } from '../../../ui/Skeleton';
import { Text } from '../../../ui/Text';
import { Toast } from '../../../ui/Toast';

import { mrKeys, useFormationGroup } from './data';
import { initialsOf, memberMeta, memberName, placesLeft } from './view-model';

const t = fr.mr.programme.groupe;
const g = fr.group;

/** Invitation code format of the API (`LRN-` then four unambiguous characters). */
const CODE_PATTERN = /^LRN-[A-Z2-9]{4}$/;

function memberLine(member: GroupMemberView, group: GroupDto): string {
  const name = memberName(member);
  return member.role === 'owner' && group.viewerRole !== 'owner' ? `${name} · ${t.owner}` : name;
}

export interface GroupeScreenProps {
  readonly formationId: string;
  readonly onBack: () => void;
}

/** Screen « Formations à plusieurs ». */
export function GroupeScreen({ formationId, onBack }: GroupeScreenProps) {
  const queryClient = useQueryClient();
  const state = useFormationGroup(formationId);
  const group = state.data?.group ?? null;
  const canCreate = state.data?.canCreate ?? false;
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: mrKeys.groupe(formationId) });
  };

  const create = useMutation({
    mutationFn: () => requireApiClient().api.formationGroupCreate({ params: { fid: formationId } }),
    onSuccess: (next) => {
      queryClient.setQueryData(mrKeys.groupe(formationId), next);
    },
    onError: () => {
      setToast(g.createError);
    },
  });

  const rotate = useMutation({
    mutationFn: (gid: string) => requireApiClient().api.groupRotateCode({ params: { gid } }),
    onSuccess: (next) => {
      queryClient.setQueryData(mrKeys.groupe(formationId), next);
      setToast(t.rotateDone);
    },
    onError: () => {
      setToast(t.rotateError);
    },
  });

  const join = useMutation({
    mutationFn: (value: string) =>
      requireApiClient().api.invitationAccept({ params: { code: value } }),
    onSuccess: (accepted) => {
      setJoinOpen(false);
      setCode('');
      setJoinError(null);
      refresh();
      setToast(t.joined(accepted.formationTitle));
    },
    onError: (cause) => {
      if (isAppError(cause)) {
        if (cause.status === 404) {
          setJoinError(g.invitePage.notFoundText);
          return;
        }
        if (cause.code === 'GROUP_FULL' || cause.code === 'CONFLICT') {
          setJoinError(g.invitePage.fullText);
          return;
        }
        if (cause.code === 'FORMATION_LIMIT_REACHED') {
          setJoinError(g.invitePage.limitText);
          return;
        }
        if (cause.code === 'VALIDATION_FAILED') {
          setJoinError(t.joinInvalid);
          return;
        }
      }
      setJoinError(g.invitePage.joinError);
    },
  });

  const share = async (): Promise<void> => {
    if (group === null) return;
    try {
      await Share.share({
        title: t.shareTitle,
        message: t.shareMessage(group.formationTitle, group.inviteCode, webUrl(group.inviteLink, webBaseUrl())),
      });
    } catch {
      setToast(t.shareError);
    }
  };

  const submitCode = (): void => {
    const value = code.trim().toUpperCase();
    if (!CODE_PATTERN.test(value)) {
      setJoinError(t.joinInvalid);
      return;
    }
    join.mutate(value);
  };

  const body = (): ReactNode => {
    if (state.status === 'loading') {
      return (
        <View style={styles.loading} testID="qf-groupe-loading">
          <Skeleton animated={false} height={120} />
          <Skeleton animated={false} height={120} />
        </View>
      );
    }
    if (state.status === 'error' || state.data === null) {
      return (
        <ErrorState
          title={t.errorTitle}
          description={t.errorBody}
          onRetry={state.retry}
          testID="qf-groupe-error"
        />
      );
    }
    if (group === null) {
      return (
        <EmptyState
          icon="user"
          title={t.noneTitle}
          description={g.noneDescription}
          {...(canCreate
            ? {
                action: {
                  label: create.isPending ? t.creating : t.create,
                  onPress: () => {
                    create.mutate();
                  },
                },
              }
            : {})}
          testID="qf-groupe-empty"
        />
      );
    }
    const places = placesLeft(group);
    return (
      <>
        <Text variant="body" tone="secondary">
          {t.intro}
        </Text>

        <Card padded={false} testID="qf-groupe-members">
          <View style={styles.cardHead}>
            <Text variant="sectionTitle">{t.membersTitle}</Text>
            <Chip label={t.membersCount(group.memberCount, group.maxMembers)} tone="green" />
          </View>
          {group.members.map((member, index) => (
            <View
              key={member.userId}
              style={[styles.member, index === 0 ? null : styles.separator]}
              testID={`qf-groupe-member-${member.userId}`}
            >
              <Avatar initials={initialsOf(memberName(member))} />
              <View style={styles.grow}>
                <Text variant="rowTitle" numberOfLines={1}>
                  {memberLine(member, group)}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {memberMeta(member)}
                </Text>
              </View>
              {member.role === 'owner' ? <Chip label={t.owner} tone="lime" /> : null}
            </View>
          ))}
        </Card>

        <View style={styles.invite} testID="qf-groupe-invite">
          <Text variant="label" tone="onDarkMuted">
            {t.inviteLabel(places)}
          </Text>
          <Text variant="figure" tone="inverse" testID="qf-groupe-code">
            {group.inviteCode}
          </Text>
          <Text variant="caption" tone="onDarkSecondary">
            {g.codeHint}
          </Text>
          <Button
            label={t.shareLink}
            block
            onPress={() => {
              void share();
            }}
            testID="qf-groupe-share"
          />
        </View>

        {group.canManage ? (
          <Button
            label={t.rotate}
            variant="outline"
            block
            loading={rotate.isPending}
            onPress={() => {
              rotate.mutate(group.id);
            }}
            testID="qf-groupe-rotate"
          />
        ) : null}

        <Button
          label={t.joinAction}
          variant="outline"
          block
          onPress={() => {
            setJoinOpen(true);
          }}
          testID="qf-groupe-join-open"
        />
      </>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']} testID="qf-groupe">
      <View style={styles.nav}>
        <IconButton
          name="chevronLeft"
          accessibilityLabel={t.back}
          onPress={onBack}
          testID="qf-groupe-back"
        />
        <Text variant="eyebrow" tone="muted" numberOfLines={1} style={styles.grow}>
          {state.data?.formationTitle ?? t.heading}
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="heroTitle">{t.title}</Text>
        {body()}
      </ScrollView>

      <Sheet
        visible={joinOpen}
        onClose={() => {
          setJoinOpen(false);
        }}
        title={t.joinTitle}
        testID="qf-groupe-join-sheet"
      >
        <View style={styles.sheet}>
          <Text variant="label" tone="muted">
            {t.joinLabel}
          </Text>
          <TextInput
            accessibilityLabel={t.joinLabel}
            autoCapitalize="characters"
            autoCorrect={false}
            onChangeText={(value) => {
              setCode(value);
              setJoinError(null);
            }}
            placeholder={t.joinPlaceholder}
            placeholderTextColor={theme.colors.inkMuted}
            style={styles.input}
            testID="qf-groupe-join-code"
            value={code}
          />
          {joinError === null ? null : (
            <Text variant="caption" tone="danger" testID="qf-groupe-join-error">
              {joinError}
            </Text>
          )}
          <Button
            label={join.isPending ? t.joining : t.joinSubmit}
            block
            loading={join.isPending}
            onPress={submitCode}
            testID="qf-groupe-join-submit"
          />
          <Button
            label={g.rotateCancel}
            variant="text"
            onPress={() => {
              setJoinOpen(false);
            }}
          />
        </View>
      </Sheet>

      <Toast
        visible={toast !== null}
        message={toast ?? ''}
        onHide={() => {
          setToast(null);
        }}
        testID="qf-groupe-toast"
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
  grow: { flex: 1, minWidth: 0 },
  content: {
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  loading: { gap: theme.spacing.sm },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  separator: { borderTopWidth: 1, borderTopColor: theme.colors.divider },
  invite: {
    gap: theme.spacing.sm,
    borderRadius: radius.card,
    backgroundColor: theme.colors.ink,
    padding: theme.spacing.lg,
  },
  sheet: { gap: theme.spacing.sm },
  input: {
    minHeight: theme.controls.button.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.control,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.ink,
    backgroundColor: theme.colors.surface,
    ...theme.type.body,
  },
});