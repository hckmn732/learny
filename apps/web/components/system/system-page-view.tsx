import { SearchX, ShieldX, WifiOff, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  Button,
  Card,
  EmptyState,
  Link,
  PageHeader,
  Skeleton,
  SkeletonGroup,
  SkeletonText,
} from '@learny/ui';

import { fr } from '../../messages/fr';

const t = fr.system;

export type SystemPageViewProps = {
  testId: string;
  title: string;
  subtitle: string;
  description?: string;
  icon: LucideIcon;
  tone?: 'lime' | 'indigo' | 'neutral';
  actions: ReactNode;
  children?: ReactNode;
};

/**
 * Shared frame of the system pages (SPEC-308 EF-1): one h1, one short explanation, one useful
 * action. The card is composed with the SPEC-303 design-system parts and never receives an
 * internal error detail.
 */
export function SystemPageView({
  testId,
  title,
  subtitle,
  description,
  icon,
  tone = 'neutral',
  actions,
  children,
}: Readonly<SystemPageViewProps>) {
  return (
    <main
      className="mx-auto flex min-h-[70vh] w-full max-w-[52rem] flex-col justify-center gap-24 px-24 py-56"
      data-testid={testId}
    >
      <PageHeader eyebrow={t.eyebrow} title={title} />
      <Card className="w-full" data-testid={`${testId}-card`}>
        <EmptyState
          action={actions}
          description={description}
          icon={icon}
          title={subtitle}
          tone={tone}
        />
        {children}
      </Card>
    </main>
  );
}

/** Loading state of the root segment: a heading, a skeleton and a way out if it hangs. */
export function SystemLoadingView() {
  return (
    <main
      aria-busy="true"
      className="mx-auto flex min-h-[70vh] w-full max-w-[52rem] flex-col justify-center gap-24 px-24 py-56"
      data-testid="system-loading"
    >
      <PageHeader eyebrow={t.eyebrow} title={t.loadingPage.title} />
      <Card className="w-full">
        <p className="m-0 sr-only" role="status" aria-live="polite">
          {t.loading}
        </p>
        <SkeletonGroup label={t.loading}>
          <Skeleton className="h-18 w-2/5" radius={8} />
          <div className="mt-16">
            <SkeletonText lines={3} />
          </div>
          <div className="mt-24 flex flex-wrap gap-8">
            <Skeleton className="h-50 w-180" radius={14} />
            <Skeleton className="h-50 w-140" radius={14} />
          </div>
        </SkeletonGroup>
        <p className="mt-24 text-14 text-ink-muted">{t.loadingPage.body}</p>
        <p className="mt-8">
          <Link href="/" variant="subtle" weight="semibold">
            {t.loadingPage.home}
          </Link>
        </p>
      </Card>
    </main>
  );
}

export function HomeAction({
  label = t.notFound.home,
  variant = 'dark',
}: Readonly<{ label?: string; variant?: 'dark' | 'outline' }>) {
  return (
    <Button asChild variant={variant} size="lg">
      <Link href="/">{label}</Link>
    </Button>
  );
}

export function SignInAction({
  label = t.notFound.signIn,
  variant = 'outline',
}: Readonly<{ label?: string; variant?: 'dark' | 'outline' }>) {
  return (
    <Button asChild variant={variant} size="lg">
      <Link href="/connexion">{label}</Link>
    </Button>
  );
}

/** 404 body without session lookup, unit-testable (SPEC-308 EF-1, CL-2). */
export function NotFoundView({ signedIn }: Readonly<{ signedIn: boolean }>) {
  return (
    <SystemPageView
      actions={
        <>
          <SignInAction variant={signedIn ? 'outline' : 'dark'} />
          <HomeAction variant={signedIn ? 'dark' : 'outline'} />
        </>
      }
      description={t.notFound.hint}
      icon={SearchX}
      testId="system-not-found"
      title={t.notFound.title}
      subtitle={t.notFound.body}
    />
  );
}

/** Access-denied body without session lookup (SPEC-308 EF-1). */
export function AccessDeniedView({ signedIn }: Readonly<{ signedIn: boolean }>) {
  return (
    <SystemPageView
      actions={
        <>
          <HomeAction variant={signedIn ? 'dark' : 'outline'} />
          {signedIn ? null : <SignInAction variant="dark" />}
        </>
      }
      description={t.accessDenied.hint}
      icon={ShieldX}
      testId="system-access-denied"
      title={t.accessDenied.title}
      subtitle={t.accessDenied.body}
    />
  );
}

/** Offline body: no client state is needed, so the text and the link work without JavaScript. */
export function OfflineView() {
  return (
    <SystemPageView
      actions={
        <>
          <Button asChild size="lg" variant="dark">
            <a href="/hors-ligne">{t.offline.retry}</a>
          </Button>
          <HomeAction variant="outline" />
        </>
      }
      description={t.offline.hint}
      icon={WifiOff}
      testId="system-offline"
      title={t.offline.title}
      subtitle={t.offline.body}
    />
  );
}
