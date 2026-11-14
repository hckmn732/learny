'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AutomationActionItem } from '@learny/contracts';
import { Button, Card, SkeletonGroup, toast } from '@learny/ui';

import { api } from '../../lib/api-client';
import { fr } from '../../messages/fr';

const t = fr.settings.automations;

const STATUS_LABEL: Record<AutomationActionItem['status'], string> = {
  pending_consent: t.statuses.pending,
  applied: t.statuses.applied,
  declined: t.statuses.declined,
  undone: t.statuses.undone,
  expired: t.statuses.expired,
  consumed: t.statuses.consumed,
};

/** BR-AUT-12, ADR-0191 §2 — the weekly journal of the `reprise` automation, with « Annuler ». */
export function AutomationJournal() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['automation-actions', 'reprise', 'journal'],
    queryFn: () => api.meAutomationActionsList({ query: { automation: 'reprise', limit: 20 } }),
    retry: false,
  });
  const undo = useMutation({
    mutationFn: (actionId: string) => api.meAutomationActionUndo({ params: { id: actionId } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['automation-actions'] }),
        queryClient.invalidateQueries({ queryKey: ['home'] }),
        queryClient.invalidateQueries({ queryKey: ['agenda'] }),
      ]);
    },
    onError: () => {
      toast({ title: t.undoError, tone: 'error' });
    },
  });

  return (
    <Card as="section" data-testid="settings-panel-automatismes">
      <h2 className="m-0 text-16 font-600">{t.title}</h2>
      <p className="mt-4 mb-12 text-13 text-ink-muted">{t.description}</p>
      {query.isPending ? (
        <SkeletonGroup label={t.loading}>
          <div className="h-20" />
          <div className="h-20" />
        </SkeletonGroup>
      ) : (query.data?.items.length ?? 0) === 0 ? (
        <p className="m-0 text-14 text-ink-muted" data-testid="automation-journal-empty">
          {t.empty}
        </p>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-y-6 text-14">
            <thead>
              <tr className="text-left text-12 text-ink-muted">
                <th scope="col" className="px-12 py-6 font-600">
                  {t.columns.when}
                </th>
                <th scope="col" className="px-12 py-6 font-600">
                  {t.columns.status}
                </th>
                <th scope="col" className="px-12 py-6 font-600">
                  {t.columns.action}
                </th>
                <th scope="col" className="px-12 py-6 text-right font-600">
                  <span className="sr-only">{t.columns.buttons}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {query.data?.items.map((row) => (
                <tr key={row.id} data-testid="automation-journal-row" className="bg-surface-subtle">
                  <td className="rounded-l-12 px-12 py-10 text-13 tabular-nums">
                    {new Intl.DateTimeFormat('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(row.createdAt))}
                  </td>
                  <td
                    data-testid="automation-journal-status"
                    className="px-12 py-10 text-13 font-600"
                  >
                    {STATUS_LABEL[row.status]}
                  </td>
                  <td data-testid="automation-journal-summary" className="px-12 py-10 text-14">
                    {row.summary}
                  </td>
                  <td className="rounded-r-12 px-12 py-10 text-right">
                    {row.status === 'applied' && row.undoPayload !== null ? (
                      <Button
                        data-testid="automation-journal-undo"
                        disabled={undo.isPending}
                        onClick={() => {
                          undo.mutate(row.id);
                        }}
                        size="sm"
                        variant="outline"
                      >
                        {t.undo}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
