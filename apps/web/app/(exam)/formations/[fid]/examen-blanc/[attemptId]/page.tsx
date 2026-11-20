import { notFound, redirect } from 'next/navigation';

import { ExamScreen } from '../../../../../../components/mock-exam/ExamScreen';
import { isApiError, serverApi } from '../../../../../../lib/api/server-client';
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
  const client = await serverApi();
  let attempt;
  try {
    attempt = await client.api.getExamAttempt({ params: { aid: attemptId } });
  } catch (error) {
    if (isApiError(error, 'NOT_FOUND')) notFound();
    if (isApiError(error, 'UNAUTHENTICATED')) redirect(SIGN_IN_PATH);
    throw error;
  }

  return (
    <ExamScreen
      initialAttempt={attempt}
      programmeHref={`/formations/${encodeURIComponent(fid)}/programme`}
    />
  );
}
