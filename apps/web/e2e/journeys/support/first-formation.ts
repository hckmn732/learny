// SPEC-807 EF-1/EF-2 — helpers of the « première formation » journey. They only drive the browser
// through roles, labels and the test ids already used by the owning specs, or run the declared
// fixture steps listed below. No helper writes a business state the product could not reach.
import { randomBytes } from 'node:crypto';

import type { Page } from '@playwright/test';

import { createLogger } from '@learny/core/server';
import { processResource } from '@learny/ingestion';
import { createFixedClock, FIXED_TIME_ISO } from '@learny/testing';
import { serviceDb, sql } from '@learny/testing/db';
import { expect } from '@learny/testing/playwright';

/** ET-2 — every run owns its learner: a unique reserved address, deleted at the end. */
export function journeyEmail(): string {
  return `j807-first-${randomBytes(5).toString('hex')}@test.learny.test`;
}

/** Answers of the SPEC-604 cadrage fixtures (`tutor/cadrage-sap-q1…q5`, `cadrage-sap-done`). */
export const CADRAGE = {
  title: 'SAP S/4HANA Finance',
  q1: 'SAP S/4HANA Finance couvre plusieurs domaines. Lesquels voulez-vous maîtriser ?',
  q2: 'Quel est votre point de départ : connaissez-vous déjà la comptabilité, ou un autre module SAP ?',
  q3: 'Noté. Quel niveau visez-vous à la fin de la formation ? Plusieurs réponses possibles.',
  q4: 'Combien de temps pouvez-vous consacrer à cette formation chaque semaine ?',
  q5: 'Quand souhaitez-vous commencer et finir cette formation ?',
  done: 'Merci, j’ai ce qu’il me faut. Générez le programme quand vous voulez.',
} as const;

/** Text of the learner's note: it becomes a real passage of the chapter. */
export const NOTE_TEXT =
  'SAP S/4HANA réunit la finance et la logistique dans une seule base en mémoire. Le journal universel enregistre chaque écriture une seule fois.';

/** Lines of the learner's PDF (page 2 carries the cited architecture passage). */
export const PDF_PAGES: readonly (readonly string[])[] = [
  ['Guide de démarrage SAP S/4HANA', 'Présentation générale du guide.'],
  [
    'Architecture de SAP S/4HANA',
    'SAP S/4HANA est un ERP qui fonctionne sur la base de données en mémoire SAP HANA.',
    'Les tables agrégées disparaissent : les analyses lisent directement les postes.',
  ],
];

/**
 * SPEC-602 — the reminders step subscribes the browser to Web Push. Like the owning spec, the
 * browser API is replaced by a deterministic subscription before the page loads (PUSH_MODE=mock).
 */
export async function installPushBrowser(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const subscription = {
      endpoint: 'https://push.mock.learny.test/e2e/success',
      expirationTime: null,
      toJSON() {
        return {
          endpoint: this.endpoint,
          expirationTime: null,
          keys: { p256dh: 'BDemoP256dhKey_simulated', auth: 'demoAuthKey' },
        };
      },
    };
    const registration = {
      pushManager: {
        getSubscription: () => Promise.resolve(null),
        subscribe: () => Promise.resolve(subscription),
      },
    };
    const fakeNotification = {
      permission: 'default',
      requestPermission: () => Promise.resolve('granted'),
    };
    try {
      Object.defineProperty(window, 'Notification', {
        value: fakeNotification,
        configurable: true,
      });
      Object.defineProperty(window, 'PushManager', { value: () => undefined, configurable: true });
      Object.defineProperty(navigator, 'serviceWorker', {
        value: {
          register: () => Promise.resolve(registration),
          ready: Promise.resolve(registration),
        },
        configurable: true,
      });
    } catch {
      // The real browser API stays in place; the reminders step still continues.
    }
  });
}

export async function userIdOf(email: string): Promise<string> {
  const rows = await serviceDb().execute<{ id: string }>(
    sql`select id::text as id from auth.users where email = ${email}`,
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`compte ${email} introuvable`);
  return id;
}

export async function deleteJourneyUser(email: string): Promise<void> {
  await serviceDb().execute(sql`delete from auth.users where email = ${email}`);
}

/**
 * EF-2 « attend leur traitement » — declared job step. The ingestion of SPEC-509 runs through the
 * jobs pipeline; exactly like `module-resources.spec.ts` (SPEC-607, « erreur et reprise »), the
 * test runs the real handler `processResource` (mock embeddings, real PDF text extraction) for the
 * learner's contributions that the inline dispatcher has not finished yet. The handler is
 * idempotent: a contribution already ready is left untouched.
 */
export async function finishIngestion(userId: string): Promise<void> {
  const pending = await serviceDb().execute<{ id: string }>(sql`
    select id::text as id from public.resources
    where owner_id = ${userId}::uuid and status <> 'ready'
    order by created_at asc
  `);
  for (const row of pending) {
    await processResource(
      {
        sdb: serviceDb(),
        clock: createFixedClock(FIXED_TIME_ISO),
        logger: createLogger({ level: 'silent' }),
        requestId: `e2e-spec-807-${row.id}`,
      },
      row.id,
    );
  }
}

export interface JourneyCitation {
  resourceId: string;
  resourceTitle: string;
  chunkText: string;
  page: number | null;
}

/** Citations persisted for the learner's course, joined to the passage they quote. */
export async function courseCitations(
  userId: string,
  chapterId: string,
): Promise<JourneyCitation[]> {
  return serviceDb().execute<JourneyCitation & Record<string, unknown>>(sql`
    select r.id::text as "resourceId", r.title as "resourceTitle", rc.text as "chunkText",
           (rc.location ->> 'page')::int as page
    from public.citations c
    join public.course_sections s on s.id = c.section_id
    join public.courses co on co.id = s.course_id and co.is_current
    join public.resource_chunks rc on rc.id = c.chunk_id
    join public.resources r on r.id = rc.resource_id and r.id = c.resource_id
    where c.owner_id = ${userId}::uuid and s.chapter_id = ${chapterId}::uuid
    order by s.position asc, c.created_at asc
  `);
}

/** Whitespace-insensitive form used to compare an extracted passage with the deposited text. */
export function normalised(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export type AnswerMode = 'right' | 'wrong';

/**
 * Answers the question on screen. The bank payloads are those of `makeModuleWithBank` (SPEC-611):
 * option `a` is the right choice, the cloze expects « universel » / « ACDOCA » and the matching
 * pairs « Clé 40 → Débit », « Clé 50 → Crédit ». Open questions are graded by the versioned
 * `tutor/grade-open-good` fixture whatever the mode.
 */
export async function answerQuestion(page: Page, mode: AnswerMode): Promise<void> {
  const question = page.getByTestId('quiz-question');
  await expect(question).toBeVisible({ timeout: 20_000 });
  const open = page.getByTestId('quiz-open-answer');
  const gap = page.getByTestId('quiz-gap-1');
  const match = page.getByTestId('quiz-match-p1');
  if ((await open.count()) > 0) {
    await open.fill(
      'La règle essentielle de la notion, illustrée par un exemple concret de pièce comptable.',
    );
  } else if ((await gap.count()) > 0) {
    await gap.fill(mode === 'right' ? 'universel' : 'local');
    await page.getByTestId('quiz-gap-2').fill(mode === 'right' ? 'ACDOCA' : 'BKPF');
  } else if ((await match.count()) > 0) {
    await match.selectOption({
      label: mode === 'right' ? 'Débit sur un compte général' : 'Crédit sur un compte général',
    });
    await page.getByTestId('quiz-match-p2').selectOption({
      label: mode === 'right' ? 'Crédit sur un compte général' : 'Débit sur un compte général',
    });
  } else {
    await page.getByTestId(mode === 'right' ? 'quiz-option-a' : 'quiz-option-b').click();
  }
  await page.getByRole('button', { name: 'Vérifier' }).click();
  await expect(page.getByTestId('quiz-feedback')).toBeVisible({ timeout: 20_000 });
}

/** Answers every question of the attempt in progress, then waits for the graded result. */
export async function completeAttempt(page: Page, mode: AnswerMode): Promise<void> {
  const counter = page.getByTestId('quiz-question-counter');
  await expect(counter).toHaveText(/^Question 1 sur \d+$/, { timeout: 30_000 });
  const total = Number(/sur (\d+)/.exec((await counter.textContent()) ?? '')?.[1] ?? '0');
  expect(total, 'nombre de questions tirées').toBeGreaterThan(0);
  for (let position = 1; position <= total; position += 1) {
    await expect(counter).toHaveText(`Question ${String(position)} sur ${String(total)}`);
    await answerQuestion(page, mode);
    await page.getByTestId('quiz-next').click();
  }
  // The submission commits the answers and runs the `quiz/submitted` pipeline in the process
  // (`JOBS_MODE=inline`, ADR-0122): grading, learning result, unlock and notifications all happen
  // before the 202 leaves, so a passing attempt takes far longer than a single request.
  await expect(page.getByTestId('quiz-result')).toBeVisible({ timeout: 180_000 });
  await expect(page.getByTestId('quiz-result-graded')).toBeVisible({ timeout: 180_000 });
}

/**
 * EF-2 « repasse après la condition de délai » — declared time fixture (ADR-0047). The test server
 * runs on the injectable clock pinned by `CLOCK_FIXED_AT` for the whole campaign and exposes no
 * runtime control, so the system time is never touched. Letting the retry delay elapse is done the
 * other way round: the persisted instants of the failed attempt and of its remediation action
 * (`retryAvailableAt`, BR-QUI-06) move back by the delay, which is exactly what the gate of
 * SPEC-612/SPEC-715 compares to the frozen « now ». Nothing else is written: the product guards
 * then decide alone.
 */
export async function elapseRetryDelay(
  userId: string,
  moduleId: string,
  availableAtIso: string,
): Promise<void> {
  const shiftSeconds = Math.ceil(
    (Date.parse(availableAtIso) - Date.parse(FIXED_TIME_ISO)) / 1000 + 60,
  );
  expect(shiftSeconds, 'délai à écouler').toBeGreaterThan(0);
  await serviceDb().transaction(async (tx) => {
    await tx.execute(sql`
      update public.attempts at
      set started_at = at.started_at - make_interval(secs => ${shiftSeconds}),
          submitted_at = at.submitted_at - make_interval(secs => ${shiftSeconds})
      from public.activities act
      where act.id = at.activity_id
        and act.module_id = ${moduleId}::uuid
        and act.kind = 'validation_quiz'
        and at.user_id = ${userId}::uuid
        and at.status = 'graded'
    `);
    await tx.execute(sql`
      update public.automation_actions
      set payload = jsonb_set(
        payload,
        '{retryAvailableAt}',
        to_jsonb(to_char(
          ((payload ->> 'retryAvailableAt')::timestamptz - make_interval(secs => ${shiftSeconds}))
            at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ))
      )
      where user_id = ${userId}::uuid
        and automation = 'remediation'
        and (payload ->> 'moduleId') = ${moduleId}
        and (payload ->> 'retryAvailableAt') is not null
    `);
  });
}
