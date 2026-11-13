import { Skeleton } from '@learny/ui';

export default function Spec501Loading() {
  return (
    <main data-testid="sdd-demo" className="mx-auto max-w-4xl p-8">
      <Skeleton data-testid="brick-loading" className="h-8 w-80 max-w-full" />
      <Skeleton className="mt-3 h-10 w-full max-w-xl" />
      <Skeleton className="mt-8 h-72 w-full" />
      <Skeleton className="mt-6 h-64 w-full" />
    </main>
  );
}
