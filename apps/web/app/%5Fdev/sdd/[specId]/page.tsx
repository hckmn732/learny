import { notFound } from 'next/navigation';

import { DemoShell } from '../../../../components/sdd/demo-shell';
import { sddPagesEnabled } from '../../../../lib/sdd-pages';
import { sddDemos } from '../registry';

export const dynamic = 'force-dynamic';

export default async function SddDemoPage({
  params,
}: Readonly<{ params: Promise<{ specId: string }> }>) {
  const { specId } = await params;
  const demo = Object.hasOwn(sddDemos, specId) ? sddDemos[specId] : undefined;
  if (!sddPagesEnabled() || demo === undefined) notFound();

  const { default: Demo } = await demo.load();
  return (
    <DemoShell specId={specId} title={demo.title}>
      <Demo />
    </DemoShell>
  );
}
