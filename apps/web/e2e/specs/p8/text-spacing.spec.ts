// SPEC-803 CL-4, CL-5, 1.4.4 and 1.4.12 — 200 % text zoom and the WCAG text-spacing bookmark must
// not hide content or create horizontal scrolling on the home, the course and the quiz.
import { closeDb, serviceDb, sql } from '@learny/db';
import {
  DEMO_USERS,
  demoChapterId,
  demoFormationId,
  demoModuleId,
  demoUserId,
} from '@learny/db/seed/fixtures';
import { restoreDemoData, test } from '@learny/testing/playwright';
import { createDemoSession, type TestSession } from '@learny/testing/supabase';
import { expectNoClippedContent, expectNoHorizontalScroll } from '@learny/testing/touch-targets';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const SAP = demoFormationId('sap');
const MODULE1 = demoModuleId('sap', 1);
const CHAPTER = demoChapterId('sap', 1, 1);
const MODULE3 = demoModuleId('sap', 3);

let session: TestSession;

const TEXT_SPACING = `
  * { line-height: 1.5 !important; }
  p { margin-bottom: 2em !important; }
  * { letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
`;

test.setTimeout(120_000);

test.beforeAll(async () => {
  await restoreDemoData();
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  session = await createDemoSession(demoUserId('alex'), ALEX.email);
});

test.afterAll(async () => {
  await serviceDb().execute(sql`
    delete from public.attempts
    where user_id = ${demoUserId('alex')}::uuid
      and status = 'in_progress'::public.attempt_status
  `);
  await restoreDemoData();
  await closeDb();
});

test('zoom 200 % et espacement du texte @SPEC-803', async ({ page, context, baseURL }) => {
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );

  for (const route of [
    '/accueil',
    `/formations/${SAP}/modules/${MODULE1}/cours?chapitre=${CHAPTER}`,
    `/formations/${SAP}/modules/${MODULE3}/quiz`,
  ]) {
    await page.goto(route);
    await page.locator('main, [data-testid="quiz-page"]').first().waitFor({ state: 'visible', timeout: 20_000 });
    await page.addStyleTag({ content: TEXT_SPACING });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '180%';
    });
    await page.waitForTimeout(150);
    await expectNoHorizontalScroll(page);
    await expectNoClippedContent(page);
  }
});
