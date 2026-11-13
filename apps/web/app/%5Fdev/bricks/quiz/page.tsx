import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { QuizDemo } from '../../../../components/bricks-demo/quiz-demo';
import { sddPagesEnabled } from '../../../../lib/sdd-pages';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function QuizReproductionPage() {
  if (!sddPagesEnabled()) notFound();
  return <QuizDemo />;
}
