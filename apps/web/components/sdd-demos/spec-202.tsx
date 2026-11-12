import { resolvePostAuthDestination } from '@learny/services/destination';

import { readPageSession } from '../../lib/supabase/page';
import { fr } from '../../messages/fr';
import { BaseCard, BaseTokenStyle } from '../sdd/base-tokens';

import { MagicLinkCard, PasswordCard, SignOutCard } from './spec-202-forms';

const t = fr.sdd.spec202;

const DONE = { onboardingStep: 'done', deletionScheduledFor: null } as const;

// Cases of `resolvePostAuthDestination`, computed on the server with the real function (EF-8).
const CASES = [
  {
    id: 'profil',
    label: t.destinations.rows.profil,
    profile: { ...DONE, onboardingStep: 'profil' },
  },
  {
    id: 'rythme',
    label: t.destinations.rows.rythme,
    profile: { ...DONE, onboardingStep: 'rythme' },
  },
  { id: 'ia', label: t.destinations.rows.ia, profile: { ...DONE, onboardingStep: 'ia' } },
  { id: 'done', label: t.destinations.rows.done, profile: DONE },
  { id: 'next', label: t.destinations.rows.next, profile: DONE, next: '/agenda' },
  { id: 'external', label: t.destinations.rows.external, profile: DONE, next: '//evil.example' },
  {
    id: 'deletion',
    label: t.destinations.rows.deletion,
    profile: { ...DONE, deletionScheduledFor: '2026-12-01T00:00:00Z' },
  },
] as const;

export default async function Spec202Demo() {
  const session = await readPageSession();
  return (
    <>
      <BaseTokenStyle />
      <BaseCard testId="auth-session" title={t.session.title}>
        <p role="status" data-testid="auth-session-state">
          {session === null
            ? t.session.anonymous
            : t.session.signedIn(session.userId, session.onboardingStep)}
        </p>
      </BaseCard>
      <MagicLinkCard />
      <PasswordCard />
      <BaseCard testId="auth-destinations-card" title={t.destinations.title}>
        <p className="mb-3 text-sm">{t.destinations.intro}</p>
        <div>
          <table data-testid="auth-destinations" className="w-full text-left text-sm">
            <thead>
              <tr>
                <th scope="col" className="py-1 pr-4">
                  {t.destinations.caseHeader}
                </th>
                <th scope="col" className="py-1">
                  {t.destinations.destinationHeader}
                </th>
              </tr>
            </thead>
            <tbody>
              {CASES.map((entry) => (
                <tr key={entry.id} data-testid="auth-destination-row">
                  <td className="py-1 pr-4">{entry.label}</td>
                  <td className="py-1 font-mono">
                    {resolvePostAuthDestination(
                      entry.profile,
                      'next' in entry ? entry.next : undefined,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </BaseCard>
      <SignOutCard />
    </>
  );
}
