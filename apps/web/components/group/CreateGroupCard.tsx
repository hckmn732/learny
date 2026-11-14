'use client';

import { UsersRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { AppError } from '@learny/core';
import { Button, Card, FormError } from '@learny/ui';

import { api } from '../../lib/api-client';
import { fr } from '../../messages/fr';

const t = fr.group;

/** BR-GRP-01 — the owner turns an active formation into a ten-seat shared formation. */
export function CreateGroupCard({ formationId }: Readonly<{ formationId: string }>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.formationGroupCreate({ params: { fid: formationId } });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof AppError ? cause.detail : t.createError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      className="flex flex-col items-center gap-12 rounded-24 border border-solid border-border bg-surface p-32 text-center"
      data-testid="group-empty"
    >
      <span
        aria-hidden="true"
        className="inline-flex size-64 items-center justify-center rounded-20 bg-lime-softer text-lime-ink-strong"
      >
        <UsersRound aria-hidden="true" size={28} strokeWidth={1.8} />
      </span>
      <h2 className="m-0 font-display text-22 font-600 tracking-heading">{t.noneTitle}</h2>
      <p className="m-0 max-w-[520px] text-15 leading-1.55 text-ink-muted">{t.noneDescription}</p>
      {error === null ? null : (
        <FormError data-testid="group-create-error" role="alert">
          {error}
        </FormError>
      )}
      <Button
        data-testid="group-create"
        loading={busy}
        onClick={() => void create()}
        size="lg"
        type="button"
        variant="lime"
      >
        {busy ? t.creating : t.create}
      </Button>
    </Card>
  );
}
