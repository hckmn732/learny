
import { createClient } from '@supabase/supabase-js';

import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, supabaseLocalEnv } from '@learny/testing/supabase';

test('le proxy garde les pages et l’onboarding @SPEC-202', async ({ page, context, baseURL }) => {
  const origin = baseURL ?? 'http://127.0.0.1:3100';
  // Anonymous visitor: a protected page leads to the sign-in page, with the way back.
  await page.goto('/agenda?semaine=2');
  await expect(page).toHaveURL(`${origin}/connexion?suite=%2Fagenda%3Fsemaine%3D2`);

  const session = await createTestSession();
  try {
    await context.addCookies(
      session.cookies.map((cookie) => ({ ...cookie, url: origin })),
    );
    // CL-5 — onboarding interrupted at the « rythme » step: the app stays closed.
    const { url, serviceRoleKey } = supabaseLocalEnv();
    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    await admin.from('profiles').update({ onboarding_step: 'rythme' }).eq('id', session.userId);
    await page.goto('/agenda');
    await expect(page).toHaveURL(`${origin}/premiers-pas/rythme`);
    await page.goto('/connexion');
    await expect(page).toHaveURL(`${origin}/premiers-pas/rythme`);

    // Once the AI step is behind, the application opens (CL-2) even before Rappels is finished.
    // The stale ticket must be dropped: the profile is the source of truth after the PATCH.
    await admin.from('profiles').update({ onboarding_step: 'rappels' }).eq('id', session.userId);
    await context.clearCookies({ name: 'learny_ob' });
    await page.goto('/agenda');
    await expect(page).toHaveURL(`${origin}/agenda`);
    expect((await context.cookies()).some((cookie) => cookie.name === 'learny_ob')).toBe(true);
    // A later sign-in returns to the step recorded in the profile (EF-1, CL-2).
    await page.goto('/connexion');
    await expect(page).toHaveURL(`${origin}/premiers-pas/rappels`);
  } finally {
    await deleteTestSession(session);
  }
});

