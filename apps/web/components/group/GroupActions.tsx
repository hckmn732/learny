'use client';

import { Copy, Link2, RefreshCw, UserMinus, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { GroupDto } from '@learny/contracts';
import { AppError } from '@learny/core';
import { AlertDialog, Button, Card, FormError } from '@learny/ui';

import { api } from '../../lib/api-client';
import { fr } from '../../messages/fr';

const t = fr.group;

function memberName(name: string | null): string {
  return name === null || name.trim() === '' ? 'Membre' : name;
}

/**
 * Shared-formation panel (SPEC-724 EF-3, EF-4, BR-GRP-03, BR-GRP-05). It renders only the four
 * public facts of each member and the invitation actions; no note, gap, resource, course or
 * discussion is ever fetched by this component.
 */
export function GroupActions({ group }: Readonly<{ group: GroupDto }>) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copyLink = async (): Promise<void> => {
    setError(null);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${group.inviteLink}`);
      setCopied(true);
    } catch {
      setError(t.copyError);
    }
  };

  const rotate = async (): Promise<void> => {
    setError(null);
    try {
      await api.groupRotateCode({ params: { gid: group.id } });
      router.refresh();
    } catch {
      setError(t.rotateError);
    }
  };

  const remove = async (userId: string): Promise<void> => {
    setError(null);
    try {
      await api.groupMemberRemove({ params: { gid: group.id, uid: userId } });
      router.refresh();
    } catch {
      setError(t.removeError);
    }
  };

  const leave = async (): Promise<void> => {
    setError(null);
    try {
      const result = await api.groupLeave({ params: { gid: group.id } });
      router.push(`/formations/${encodeURIComponent(result.formationId)}/programme`);
      router.refresh();
    } catch (cause) {
      if (cause instanceof AppError && cause.code === 'FORBIDDEN') setError(t.ownerCannotLeave);
      else setError(t.leaveError);
    }
  };

  return (
    <div className="flex flex-col gap-24">
      <Card
        className="rounded-24 border border-solid border-border bg-surface p-24"
        data-testid="group-invitation-card"
      >
        <div className="flex flex-wrap items-start justify-between gap-16">
          <div className="flex min-w-0 flex-col gap-6">
            <h2 className="m-0 font-display text-22 font-600 tracking-heading">{t.codeTitle}</h2>
            <p className="m-0 max-w-[560px] text-14 leading-1.5 text-ink-muted">{t.codeHint}</p>
          </div>
          <span className="inline-flex min-h-40 items-center rounded-full bg-lime-soft px-14 text-13 font-700 text-lime-ink-strong">
            {t.capacity(group.memberCount, group.maxMembers)}
          </span>
        </div>
        <div className="mt-18 flex flex-wrap items-center gap-10">
          <code
            className="inline-flex min-h-52 items-center rounded-14 bg-canvas px-18 font-mono text-20 font-700 tracking-wide text-ink"
            data-testid="group-code"
          >
            {group.inviteCode}
          </code>
          <Button
            data-testid="group-copy-link"
            leadingIcon={Copy}
            onClick={() => void copyLink()}
            size="lg"
            type="button"
            variant="outline"
          >
            {t.copy}
          </Button>
          {group.canManage ? (
            <AlertDialog
              cancelLabel={t.rotateCancel}
              confirmLabel={t.rotateConfirm}
              data-testid="group-rotate-dialog"
              description={t.rotateDescription}
              onConfirm={rotate}
              title={t.rotateTitle}
              trigger={
                <Button
                  data-testid="group-rotate-code"
                  leadingIcon={RefreshCw}
                  size="lg"
                  type="button"
                  variant="dark"
                >
                  {t.rotate}
                </Button>
              }
            />
          ) : null}
        </div>
        <p className="mt-12 flex items-center gap-6 text-13 text-ink-muted">
          <Link2 aria-hidden="true" size={14} strokeWidth={2} />
          <span data-testid="group-invite-link">{group.inviteLink}</span>
        </p>
        <p aria-live="polite" className="m-0 min-h-18 text-13 text-lime-ink-strong" role="status">
          {copied ? t.copied : ''}
        </p>
      </Card>

      {error === null ? null : (
        <FormError data-testid="group-error" role="alert">
          {error}
        </FormError>
      )}

      <section
        aria-labelledby="group-members-title"
        className="rounded-24 border border-solid border-border bg-surface p-24"
        data-testid="group-members-card"
      >
        <div className="flex flex-wrap items-end justify-between gap-12">
          <div className="flex flex-col gap-6">
            <h2
              className="m-0 font-display text-22 font-600 tracking-heading"
              id="group-members-title"
            >
              {t.membersTitle}
            </h2>
            <p className="m-0 max-w-[680px] text-14 leading-1.5 text-ink-muted">{t.membersHint}</p>
          </div>
          <div className="flex items-center gap-8">
            <label className="text-13 text-ink-muted" htmlFor="group-capacity">
              {t.capacityLabel}
            </label>
            <meter
              data-testid="group-capacity"
              high={group.maxMembers}
              id="group-capacity"
              low={1}
              max={group.maxMembers}
              min={0}
              optimum={group.maxMembers}
              value={group.memberCount}
            >
              {t.capacity(group.memberCount, group.maxMembers)}
            </meter>
          </div>
        </div>

        <div className="mt-16 overflow-x-auto">
          <table
            className="w-full min-w-[760px] border-collapse text-left"
            data-testid="group-members"
          >
            <caption className="sr-only">{t.membersTitle}</caption>
            <thead>
              <tr className="border-b border-solid border-border text-13 text-ink-muted">
                <th className="px-10 py-10 font-600" scope="col">
                  {t.columns.name}
                </th>
                <th className="px-10 py-10 font-600" scope="col">
                  {t.columns.module}
                </th>
                <th className="px-10 py-10 font-600" scope="col">
                  {t.columns.validated}
                </th>
                <th className="px-10 py-10 font-600" scope="col">
                  {t.columns.streak}
                </th>
                {group.canManage ? (
                  <th className="px-10 py-10 font-600" scope="col">
                    {t.columns.actions}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {group.members.map((member) => (
                <tr
                  className="border-b border-solid border-border last:border-b-0"
                  data-testid="group-member-row"
                  key={member.userId}
                >
                  <th className="px-10 py-12 font-600" scope="row">
                    <span data-testid="group-member-name">{memberName(member.firstName)}</span>
                    {member.role === 'owner' ? (
                      <span className="ml-8 rounded-full bg-ink px-8 py-2 text-11 font-700 text-white">
                        {t.ownerBadge}
                      </span>
                    ) : null}
                  </th>
                  <td className="px-10 py-12 text-14" data-testid="group-member-module">
                    {member.currentModulePosition > 0
                      ? t.module(member.currentModulePosition)
                      : t.moduleNotStarted}
                  </td>
                  <td className="px-10 py-12 text-14" data-testid="group-member-validated">
                    {member.validatedModules}
                  </td>
                  <td className="px-10 py-12 text-14" data-testid="group-member-streak">
                    {member.streakDays}
                  </td>
                  {group.canManage ? (
                    <td className="px-10 py-12">
                      {member.role === 'owner' ? null : (
                        <AlertDialog
                          cancelLabel={t.removeCancel}
                          confirmLabel={t.removeConfirm}
                          data-testid={`group-remove-dialog-${member.userId}`}
                          description={t.removeDescription}
                          destructive
                          onConfirm={() => remove(member.userId)}
                          title={t.removeTitle(memberName(member.firstName))}
                          trigger={
                            <Button
                              data-testid={`group-remove-${member.userId}`}
                              leadingIcon={UserMinus}
                              size="sm"
                              type="button"
                              variant="danger"
                            >
                              {t.remove}
                            </Button>
                          }
                        />
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {group.canLeave ? (
        <div className="flex justify-end">
          <AlertDialog
            cancelLabel={t.leaveCancel}
            confirmLabel={t.leaveConfirm}
            data-testid="group-leave-dialog"
            description={t.leaveDescription}
            destructive
            onConfirm={leave}
            title={t.leaveTitle}
            trigger={
              <Button
                data-testid="group-leave"
                leadingIcon={LogOut}
                size="lg"
                type="button"
                variant="outline"
              >
                {t.leave}
              </Button>
            }
          />
        </div>
      ) : (
        <p className="m-0 text-13 text-ink-muted" data-testid="group-owner-notice">
          {t.ownerCannotLeave}
        </p>
      )}
    </div>
  );
}
