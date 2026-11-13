import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ExamDemo } from '../../../../components/bricks-demo/exam-demo';
import { sddPagesEnabled } from '../../../../lib/sdd-pages';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function ExamReproductionPage() {
  if (!sddPagesEnabled()) notFound();
  return <ExamDemo />;
}
