import { closeDb, serviceDb, sql } from '@learny/db';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';

// QA regression of SCR-15 (BR-SET-01): every tab opens from its hash on a full page load and on a
// later `hashchange`, so the Stripe portal return (`/parametres#abonnement`) lands on « Abonnement ».

const NOW = new Date('2026-11-11T12:20:00Z');
const TABS = [
  { id: 'profil', title: 'Profil' },
  { id: 'notifications', title: 'Notifications' },
  { id: 'automatismes', title: 'Automatismes' },
  { id: 'modeles', title: 'Modèles d’IA' },
  { id: 'abonnement', title: 'Abonnement' },
] as const;

let session: TestSession | null = null;

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession();
  await serviceDb().execute(sql`
    update public.profiles set onboarding_step = 'done' where id = ${session.userId}::uuid
  `);
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
});

test.afterEach(async () => {
  const current = session;
  if (current !== null) await deleteTestSession(current);
  session = null;
});

test.afterAll(async () => {
  await closeDb();
});

test('ouvre chaque onglet depuis le hash @SPEC-707 @parametres-hash', async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  for (const tab of TABS) {
    // Full document load, never a same-document hash navigation.
    await page.goto('about:blank');
    await page.goto(`/parametres#${tab.id}`);
    await expect(page.getByTestId(`settings-tab-${tab.id}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('settings-title')).toHaveText(tab.title);
    await expect(page).toHaveURL(new RegExp(`#${tab.id}$`));
    // The selection survives a reload of the same address.
    await page.reload();
    await expect(page.getByTestId(`settings-tab-${tab.id}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page).toHaveURL(new RegExp(`#${tab.id}$`));
  }

  // A later hash change (link, back button) selects the tab too.
  await page.goto('about:blank');
  await page.goto('/parametres#profil');
  await expect(page.getByTestId('settings-tab-profil')).toHaveAttribute('aria-selected', 'true');
  for (const tab of [...TABS].reverse()) {
    await page.evaluate((id) => {
      window.location.hash = id;
    }, tab.id);
    await expect(page.getByTestId(`settings-tab-${tab.id}`)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('settings-title')).toHaveText(tab.title);
  }

  // The former `#ia` of SPEC-210 opens « Modèles d’IA » and the URL is normalised to `#modeles`.
  await page.goto('about:blank');
  await page.goto('/parametres#ia');
  await expect(page.getByTestId('settings-tab-modeles')).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/\/parametres#modeles$/);

  // « Retour » of the simulated customer portal lands on « Abonnement » (SPEC-210 EF-2, ADR-0340).
  await page.goto('/_dev/stripe/portal');
  await page.getByRole('button', { name: 'Retour' }).click();
  await expect(page).toHaveURL(/\/parametres#abonnement$/);
  await expect(page.getByTestId('settings-tab-abonnement')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByTestId('settings-title')).toHaveText('Abonnement');
});
