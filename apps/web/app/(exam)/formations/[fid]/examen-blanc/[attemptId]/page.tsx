import { randomUUID } from 'node:crypto';

import { notFound, redirect } from 'next/navigation';

import { createServiceContext, getExamAttempt } from '@learny/services';

import { ExamScreen } from '../../../../../../components/mock-exam/ExamScreen';
import { SIGN_IN_PATH } from '../../../../../../lib/route-guard';
import { readPageSession } from '../../../../../../lib/supabase/page';

export const dynamic = 'force-dynamic';

interface ExamAttemptPageProps {
  params: Promise<{ fid: string; attemptId: string }>;
}

/**
 * SCR-11 — help-free exam and results. The normal shell is deliberately absent: no menu, header,
 * tutor or course during the test (BR-PRA-03). The server read lazily submits an expired attempt.
 */
export default async function ExamAttemptPage({ params }: ExamAttemptPageProps) {
  const { fid, attemptId } = await params;
  const session = await readPageSession();
  if (session === null) redirect(SIGN_IN_PATH);
  const ctx = createServiceContext({ userId: session.userId, requestId: randomUUID() });
  const attempt = await getExamAttempt(ctx, attemptId);
  if (!attempt.ok) {
    if (attempt.error.code === 'NOT_FOUND') notFound();
    throw attempt.error;
  }

  return (
    <ExamScreen
      initialAttempt={attempt.value}
      programmeHref={`/formations/${encodeURIComponent(fid)}/programme`}
    />
  );
}
