import type { BrowserContext, Page } from '@playwright/test';

import { INVITE_CODE_ALPHABET, createGroup, joinGroup, serviceDb, sql } from '@learny/db';
import { createTestProgramme } from '@learny/db/testing';
import { expect, test } from '@learny/testing/playwright';
import {
  createTestSession,
  deleteTestSession,
  type TestSession,
} from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const NOW = new Date('2026-11-11T12:20:00Z');
const TITLE = 'Promotion SAP 2026';

let owner: TestSession | null = null;
let member: TestSession | null = null;

function deterministicCode(code: string) {
  const suffix = code.slice(4);
  let cursor = 0;
  return () => {
    const character = suffix[cursor] ?? 'A';
    cursor += 1;
    return INVITE_CODE_ALPHABET.indexOf(character);
  };
}

async function prepareUser(session: TestSession, firstName: string): Promise<void> {
  await serviceDb().execute(sql`
    update public.profiles
    set first_name = ${firstName}, onboarding_step = 'done', timezone = 'Europe/Paris',
        streak_days = ${firstName === 'Alice' ? 12 : 7}
    where id = ${session.userId}::uuid
  `);
}

async function useSession(
  context: BrowserContext,
  baseURL: string | undefined,
  session: TestSession,
  page: Page,
): Promise<void> {
  await context.clearCookies();
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
  await page.clock.setFixedTime(NOW);
}

interface Seeded {
  formationId: string;
  moduleIds: string[];
}

async function seedFormation(userId: string): Promise<Seeded> {
  return serviceDb().transaction(async (tx) => {
    const programme = await createTestProgramme(tx, userId, {
      modules: 2,
      chaptersPerModule: 1,
      notionsPerChapter: 1,
      title: TITLE,
    });
    await tx.execute(sql`
      update public.profiles
      set current_formation_id = ${programme.formationId}::uuid
      where id = ${userId}::uuid
    `);
    await tx.execute(sql`
      update public.formations
      set start_date = '2026-10-01', end_date = '2026-11-30', volume_hours = 20
      where id = ${programme.formationId}::uuid
    `);
    await tx.execute(sql`
      update public.modules
      set planned_start = '2026-10-01', planned_end = '2026-10-31'
      where id = ${programme.moduleIds[0] ?? ''}::uuid
    `);
    await tx.execute(sql`
      update public.modules
      set planned_start = '2026-11-01', planned_end = '2026-11-30'
      where id = ${programme.moduleIds[1] ?? ''}::uuid
    `);
    await tx.execute(sql`
      insert into public.module_progress (user_id, module_id, status, validated_at)
      values (
        ${userId}::uuid, ${programme.moduleIds[0] ?? ''}::uuid, 'validated',
        ${NOW.toISOString()}::timestamptz
      ), (
        ${userId}::uuid, ${programme.moduleIds[1] ?? ''}::uuid, 'open', null
      )
    `);
    return { formationId: programme.formationId, moduleIds: programme.moduleIds };
  });
}

/** Deterministic group `LRN-AB23` with the owner and the member, for the pixel baselines. */
async function seedVisualGroup(ownerId: string, memberId: string): Promise<Seeded> {
  const seeded = await seedFormation(ownerId);
  await serviceDb().transaction(async (tx) => {
    const group = await createGroup(tx, {
      formationId: seeded.formationId,
      ownerId,
      now: NOW,
      random: deterministicCode('LRN-AB23'),
    });
    await joinGroup(tx, { inviteCode: group.inviteCode, userId: memberId, now: NOW });
    await tx.execute(sql`
      insert into public.module_progress (user_id, module_id, status)
      values (${memberId}::uuid, ${seeded.moduleIds[0] ?? ''}::uuid, 'open')
    `);
  });
  return seeded;
}

test.beforeEach(async () => {
  owner = await createTestSession();
  member = await createTestSession();
  await prepareUser(owner, 'Alice');
  await prepareUser(member, 'Bob');
});

async function cleanupSession(session: TestSession | null): Promise<void> {
  if (session === null) return;
  // SPEC-111 CL-4 — the parent group must disappear before the owner membership; otherwise the
  // trigger refuses the cascade and the deterministic `LRN-AB23` of the visual test would collide.
  await serviceDb().execute(sql`delete from public.groups where owner_id = ${session.userId}::uuid`);
  await serviceDb().execute(
    sql`delete from public.formations where owner_id = ${session.userId}::uuid`,
  );
  await deleteTestSession(session);
}

test.afterEach(async () => {
  const currentOwner = owner;
  const currentMember = member;
  owner = null;
  member = null;
  await cleanupSession(currentMember);
  await cleanupSession(currentOwner);
});

test.afterAll(async () => {
  const { closeDb } = await import('@learny/db');
  await closeDb();
});

test('parcours SPEC-724 @SPEC-724', async ({ page, context, baseURL, axeCheck }) => {
  const currentOwner = owner;
  const currentMember = member;
  if (currentOwner === null || currentMember === null) throw new Error('sessions absentes');
  const seeded = await seedFormation(currentOwner.userId);

  await useSession(context, baseURL, currentOwner, page);
  await page.goto(`/formations/${seeded.formationId}/groupe`);
  await expect(page.getByTestId('group-empty')).toBeVisible();
  await page.getByTestId('group-create').click();
  const code = (await page.getByTestId('group-code').textContent())?.trim() ?? '';
  expect(code).toMatch(/^LRN-[A-Z2-9]{4}$/);
  await expect(page.getByTestId('group-member-row')).toHaveCount(1);
  await expect(page.getByTestId('group-member-name')).toHaveText('Alice');
  await expect(page.getByTestId('group-rotate-code')).toBeVisible();

  // EF-2 — the invited member joins from the public link.
  await useSession(context, baseURL, currentMember, page);
  await page.goto(`/invitation/${code}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLE);
  await expect(page.getByTestId('group-join')).toBeVisible();
  await page.getByTestId('group-join').click();
  await expect(page.getByTestId('group-joined')).toBeVisible();
  await expect(page.getByTestId('group-joined')).toContainText(TITLE);

  await page.goto(`/formations/${seeded.formationId}/groupe`);
  await expect(page.getByTestId('group-member-row')).toHaveCount(2);
  await expect(page.getByTestId('group-rotate-code')).toHaveCount(0);
  await expect(page.getByTestId('group-leave')).toBeVisible();
  const body = await page.getByTestId('group-page').innerText();
  expect(body).not.toMatch(/@test\.learny/i);
  expect(body).not.toMatch(/note privée|apport privé|contenu privé/i);

  // CA-3 — the owner rotates the code; the previous link no longer resolves.
  await useSession(context, baseURL, currentOwner, page);
  await page.goto(`/formations/${seeded.formationId}/groupe`);
  await page.getByTestId('group-rotate-code').click();
  await page.getByRole('button', { name: 'Régénérer' }).click();
  await expect(page.getByTestId('group-code')).not.toHaveText(code);
  const rotated = (await page.getByTestId('group-code').textContent())?.trim() ?? '';
  expect(rotated).not.toBe(code);

  await context.clearCookies();
  await page.goto(`/invitation/${code}`);
  await expect(page.getByTestId('group-invitation-not-found')).toBeVisible();

  // CA-3 — the member leaves: an individual copy is opened and the owner sees one member left.
  await useSession(context, baseURL, currentMember, page);
  await page.goto(`/formations/${seeded.formationId}/groupe`);
  await page.getByTestId('group-leave').click();
  await page.getByRole('button', { name: 'Quitter' }).click();
  await expect(page).toHaveURL(/\/formations\/[0-9a-f-]+\/programme$/);

  await useSession(context, baseURL, currentOwner, page);
  await page.goto(`/formations/${seeded.formationId}/groupe`);
  await expect(page.getByTestId('group-member-row')).toHaveCount(1);

  // CL-3 — invalid code keeps a neutral, accessible state.
  await page.goto('/invitation/LRN-AB1O');
  await expect(page.getByTestId('group-invitation-invalid')).toBeVisible();

  await axeCheck();
});

test('conformité SCR-17 groupe desktop @SPEC-724 @visual', async ({
  page,
  context,
  baseURL,
  axeCheck,
  captureEvidence,
}) => {
  const currentOwner = owner;
  const currentMember = member;
  if (currentOwner === null || currentMember === null) throw new Error('sessions absentes');
  const seeded = await seedVisualGroup(currentOwner.userId, currentMember.userId);
  await useSession(context, baseURL, currentOwner, page);
  await page.goto(`/formations/${seeded.formationId}/groupe`);

  await expect(page.getByTestId('group-code')).toHaveText('LRN-AB23');
  await expect(page.getByTestId('group-capacity')).toHaveAttribute('value', '2');
  await expect(
    page.getByTestId('group-page').getByRole('heading', { level: 2, name: 'Code d’invitation' }),
  ).toBeVisible();
  await expect(
    page.getByTestId('group-page').getByRole('heading', { level: 2, name: 'Membres' }),
  ).toBeVisible();
  const headers = await page
    .getByTestId('group-members')
    .locator('thead th')
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
  expect(headers).toEqual(['Prénom', 'Module en cours', 'Modules validés', 'Série (jours)', 'Actions']);
  expect(await page.getByTestId('group-member-name').allTextContents()).toEqual(['Alice', 'Bob']);

  await expectTokens(page, {
    '[data-testid="group-code"]': { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="group-invitation-card"]': {
      'background-color': '#FFFFFF',
      'border-radius': '21.6px',
      'border-color': '#E7E6E1',
    },
    '[data-testid="group-members-card"]': {
      'background-color': '#FFFFFF',
      'border-radius': '21.6px',
    },
  });

  const body = await page.getByTestId('group-page').innerText();
  expect(body).not.toMatch(/@test\.learny/i);
  expect(body).not.toMatch(/note privée|apport privé|contenu privé|lacune :/i);

  await expectScreenshotBaseline(page, 'spec-724-groupe-desktop.png', { fullPage: true });
  await captureEvidence('visual-spec-724-groupe-desktop');
  await axeCheck();
});

test('conformité SCR-17 groupe mobile @SPEC-724 @visual @mobile', async ({
  page,
  context,
  baseURL,
  axeCheck,
  captureEvidence,
}) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  const currentOwner = owner;
  const currentMember = member;
  if (currentOwner === null || currentMember === null) throw new Error('sessions absentes');
  const seeded = await seedVisualGroup(currentOwner.userId, currentMember.userId);
  await useSession(context, baseURL, currentOwner, page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/formations/${seeded.formationId}/groupe`);
  await expect(page.getByTestId('group-code')).toHaveText('LRN-AB23');
  await expect(page.getByTestId('group-member-row')).toHaveCount(2);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  });
  await expectScreenshotBaseline(page, 'spec-724-groupe-mobile.png', { fullPage: true });
  await captureEvidence('visual-spec-724-groupe-mobile');
  await axeCheck();
});
