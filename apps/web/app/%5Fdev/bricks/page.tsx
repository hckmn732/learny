import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BricksGallery } from '../../../components/bricks-demo/gallery';
import { sddPagesEnabled } from '../../../lib/sdd-pages';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function BricksGalleryPage({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  if (!sddPagesEnabled()) notFound();
  const params = await searchParams;
  const single = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  return (
    <BricksGallery
      filters={{
        type: single(params.type),
        variant: single(params.variant),
        state: single(params.state),
      }}
    />
  );
}
