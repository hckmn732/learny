import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ExerciseDemo } from '../../../../components/bricks-demo/exercise-demo';
import { sddPagesEnabled } from '../../../../lib/sdd-pages';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function ExerciseReproductionPage() {
  if (!sddPagesEnabled()) notFound();
  return <ExerciseDemo />;
}
