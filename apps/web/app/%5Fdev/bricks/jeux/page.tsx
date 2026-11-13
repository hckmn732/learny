import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { GamesDemo } from '../../../../components/bricks-demo/games-demo';
import { sddPagesEnabled } from '../../../../lib/sdd-pages';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function GamesReproductionPage({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  if (!sddPagesEnabled()) notFound();
  const params = await searchParams;
  const raw = Array.isArray(params.jeu) ? params.jeu[0] : params.jeu;
  const parsed = Number(raw ?? '1');
  const game = Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : 1;
  return <GamesDemo game={game} />;
}
