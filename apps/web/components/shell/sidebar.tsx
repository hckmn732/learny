'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import NextLink from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';

import type { FormationManagementState, SidebarDto, SidebarFormation } from '@learny/contracts';
import {
  AlertDialog,
  Button,
  CountBadge,
  Icon,
  IconButton,
  ProgressBar,
  Skeleton,
  SkeletonGroup,
  cn,
  iconRegistry,
  toast,
  type IconName,
} from '@learny/ui';

import { api, ApiError } from '../../lib/api-client';
import { fr } from '../../messages/fr';
import { ActiveLimitDialog } from '../formations/ActiveLimitDialog';

import { FormationSwitcher } from './FormationSwitcher';
import { StreakBlock } from './StreakBlock';

const t = fr.shell.sidebar;

/** ADR-0162 — accent of the sigil, shared by the switcher and the current-formation card. */
const FORMATION_ACCENT_CLASS = {
  indigo: 'bg-indigo-soft text-indigo-ink',
  green: 'bg-green-soft text-green-ink-alt',
  orange: 'bg-orange-soft text-orange-ink-strong',
  violet: 'bg-violet-soft text-violet-ink',
  teal: 'bg-green-soft text-green-ink',
} as const;

export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'learny.sidebar.collapsed';
const SIDEBAR_QUERY_KEY = ['sidebar'] as const;
const SHELL_BREAKPOINT_QUERY = '(max-width: 899px)';

function isCompactViewport(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(SHELL_BREAKPOINT_QUERY).matches
  );
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/accueil') return pathname === '/accueil' || pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface SidebarLinkProps {
  href: string;
  label: string;
  icon: IconName;
  active: boolean;
  testId: string;
  badge?: ReactNode;
  onNavigate?: ((event: MouseEvent<HTMLAnchorElement>) => void) | undefined;
}

const SidebarLink = ({
  href,
  label,
  icon,
  active,
  testId,
  badge,
  onNavigate,
}: SidebarLinkProps) => (
  <NextLink
    href={href}
    aria-current={active ? 'page' : undefined}
    data-testid={testId}
    prefetch={false}
    {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
    className={cn(
      'flex min-h-36 items-center gap-12 rounded-11 px-10 text-14 no-underline transition-colors',
      active
        ? 'bg-dark-750 font-600 text-white'
        : 'font-500 text-on-dark-muted hover:bg-dark-800 hover:text-white',
    )}
  >
    <Icon name={icon} size={18} strokeWidth={1.8} className={active ? 'text-lime' : undefined} />
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {badge}
  </NextLink>
);

function formationModuleLabel(formation: SidebarFormation): string {
  if (formation.currentModulePosition !== null && formation.moduleCount > 0) {
    return t.moduleOf(formation.currentModulePosition, formation.moduleCount);
  }
  return formation.moduleCount === 0 ? t.programmeToValidate : t.noOpenModule;
}

export interface SidebarViewProps {
  data: SidebarDto | null;
  status: 'loading' | 'error' | 'ready';
  collapsed: boolean;
  overlayOpen: boolean;
  pathname: string;
  onHide: () => void;
  onShow: () => void;
  onCloseOverlay: () => void;
  onRetry?: () => void;
  onSelectFormation?: (formation: SidebarFormation) => void;
  onPauseFormation?: (formation: SidebarFormation) => void;
  onResumeFormation?: (formation: SidebarFormation) => void;
  onArchiveFormation?: (formation: SidebarFormation) => void;
  pendingFormationId?: string | null;
  onNavigate?: ((event: MouseEvent<HTMLAnchorElement>) => void) | undefined;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  showTriggerRef?: RefObject<HTMLButtonElement | null>;
  asideRef?: RefObject<HTMLElement | null>;
  /** `external` lets the fixed header own the “Afficher le menu” trigger (SPEC-305 EF-1). */
  showTrigger?: 'internal' | 'external';
}

/** Presentational sidebar: also used by the component tests and the state demonstrations. */
export const SidebarView = ({
  data,
  status,
  collapsed,
  overlayOpen,
  pathname,
  onHide,
  onShow,
  onCloseOverlay,
  onRetry,
  onSelectFormation,
  onPauseFormation,
  onResumeFormation,
  onArchiveFormation,
  pendingFormationId = null,
  onNavigate,
  onKeyDown,
  showTriggerRef,
  asideRef,
  showTrigger = 'internal',
}: SidebarViewProps) => {
  const currentFormation = data?.currentFormation ?? null;
  const formations = data?.formations ?? [];
  const generalLinks = [
    { href: '/accueil', label: t.home, icon: 'home' as const, testId: 'sidebar-home' },
    { href: '/agenda', label: t.agenda, icon: 'calendar' as const, testId: 'sidebar-agenda' },
  ];
  const formationLinks =
    currentFormation === null
      ? []
      : [
          {
            href: `/formations/${currentFormation.id}/programme`,
            label: t.programme,
            icon: 'programme' as const,
            testId: 'sidebar-programme',
          },
          {
            href: `/formations/${currentFormation.id}/carte`,
            label: t.notionMap,
            icon: 'notion-map' as const,
            testId: 'sidebar-notion-map',
          },
          {
            href: `/formations/${currentFormation.id}/quiz-global`,
            label: t.globalQuiz,
            icon: 'global-quiz' as const,
            testId: 'sidebar-global-quiz',
            badge: (
              <CountBadge
                tone="lime"
                value={data?.quizDueCount ?? 0}
                aria-label={t.quizCountLabel(data?.quizDueCount ?? 0)}
                data-testid="sidebar-quiz-badge"
              />
            ),
          },
          {
            href: `/formations/${currentFormation.id}/lacunes`,
            label: t.gaps,
            icon: 'gaps' as const,
            testId: 'sidebar-gaps',
            badge: (
              <CountBadge
                tone="orange-on-dark"
                value={data?.gapCount ?? 0}
                aria-label={t.gapsCountLabel(data?.gapCount ?? 0)}
                data-testid="sidebar-gaps-badge"
              />
            ),
          },
        ];

  return (
    <>
      {overlayOpen ? (
        <div
          aria-hidden="true"
          data-testid="sidebar-backdrop"
          className="fixed inset-0 z-popover bg-overlay animate-overlay-in motion-reduce:animate-none shell:hidden"
          onClick={onCloseOverlay}
        />
      ) : null}
      {!overlayOpen && showTrigger === 'internal' ? (
        <IconButton
          ref={showTriggerRef}
          tone="light"
          size="md"
          label={t.show}
          icon={iconRegistry['sidebar-open']}
          aria-expanded={false}
          data-testid="sidebar-show"
          onClick={onShow}
          className={cn(
            'fixed top-12 left-12 z-header shadow-float',
            collapsed ? undefined : 'shell:hidden',
          )}
        />
      ) : null}
      {collapsed && !overlayOpen ? null : (
        // The focus trap listens on the container; interactive controls live inside it.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <aside
          ref={asideRef}
          data-sidebar=""
          data-testid="sidebar"
          role={overlayOpen ? 'dialog' : undefined}
          aria-modal={overlayOpen ? true : undefined}
          aria-label={overlayOpen ? t.navLabel : undefined}
          onKeyDown={onKeyDown}
          className={cn(
            'box-border flex-col gap-10 bg-ink px-12 py-16 text-white',
            overlayOpen
              ? 'fixed inset-y-0 left-0 z-drawer flex h-dvh w-sidebar max-w-[85vw] animate-dialog-in motion-reduce:animate-none'
              : 'hidden shell:sticky shell:top-0 shell:flex shell:h-screen shell:w-sidebar shell:shrink-0',
          )}
        >
          <div className="flex items-center justify-between gap-8 pl-4">
            <NextLink
              href="/accueil"
              aria-label={t.logoLabel}
              data-testid="sidebar-logo"
              className="flex min-w-0 items-center gap-10 font-display text-16 font-600 whitespace-nowrap text-white no-underline"
            >
              <span
                aria-hidden="true"
                className="flex size-30 shrink-0 items-center justify-center rounded-9 bg-lime text-ink"
              >
                <Icon name="book" size={16} strokeWidth={2.4} />
              </span>
              <span className="truncate">Learny</span>
            </NextLink>
            <IconButton
              tone="dark"
              size="sm"
              label={overlayOpen ? t.closeOverlay : t.hide}
              icon={iconRegistry['sidebar-close']}
              aria-expanded
              data-testid="sidebar-hide"
              onClick={onHide}
            />
          </div>

          <nav aria-label={t.navLabel} data-testid="sidebar-nav-main">
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {generalLinks.map((link) => (
                <li key={link.href}>
                  <SidebarLink
                    {...link}
                    active={isActivePath(pathname, link.href)}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </nav>

          <div
            aria-hidden="true"
            data-testid="sidebar-separator"
            className="mx-6 h-px bg-dark-line"
          />

          {status === 'loading' ? (
            <SkeletonGroup data-testid="sidebar-loading" label={t.loading} className="px-4">
              <div className="flex flex-col gap-8 rounded-18 border border-solid border-dark-line bg-dark-850 p-14">
                <Skeleton className="h-12 w-2/3 bg-dark-600" radius={6} />
                <Skeleton className="h-52 w-full bg-dark-700" radius={12} />
                <Skeleton className="h-36 w-full bg-dark-700" radius={10} />
              </div>
            </SkeletonGroup>
          ) : status === 'error' ? (
            <div
              role="alert"
              data-testid="sidebar-error"
              className="px-4 py-8 text-13 text-on-dark-muted"
            >
              <p className="m-0">{t.errorTitle}</p>
              {onRetry ? (
                <Button
                  variant="outline-on-dark"
                  size="sm"
                  className="mt-8"
                  onClick={onRetry}
                  data-testid="sidebar-retry"
                >
                  {t.retry}
                </Button>
              ) : null}
            </div>
          ) : (
            <section
              aria-labelledby="sidebar-current-formation-title"
              data-testid="sidebar-current-formation"
              className="flex flex-col gap-6 rounded-18 border border-solid border-dark-line bg-dark-850 px-8 pt-10 pb-8"
            >
              <div className="flex items-center justify-between gap-8 pl-4">
                <h2
                  id="sidebar-current-formation-title"
                  className="m-0 text-11 font-600 uppercase tracking-eyebrow text-on-dark-muted"
                >
                  {t.currentFormation}
                </h2>
                {formations.length > 0 ? (
                  <FormationSwitcher
                    formations={formations}
                    currentId={currentFormation?.id ?? null}
                    onSelect={(formation) => onSelectFormation?.(formation)}
                    onPause={(formation) => onPauseFormation?.(formation)}
                    onResume={(formation) => onResumeFormation?.(formation)}
                    onArchive={(formation) => onArchiveFormation?.(formation)}
                    pendingId={pendingFormationId}
                  />
                ) : null}
              </div>

              {currentFormation === null ? (
                <div data-testid="sidebar-empty" className="flex flex-col gap-8 px-4 pb-4">
                  <p className="m-0 text-13 font-600 text-white">{t.noFormationTitle}</p>
                  <p className="m-0 text-12 leading-1.45 text-on-dark-muted">
                    {t.noFormationDescription}
                  </p>
                  <Button asChild variant="lime" size="sm" className="self-start">
                    <NextLink
                      href="/formations/nouvelle"
                      prefetch={false}
                      {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
                    >
                      {t.createFormation}
                    </NextLink>
                  </Button>
                </div>
              ) : (
                <>
                  <div
                    data-testid="sidebar-formation-card"
                    className="flex items-center gap-10 rounded-13 bg-dark-750 px-10 py-8"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex size-34 shrink-0 items-center justify-center rounded-10 font-display text-12 font-700',
                        FORMATION_ACCENT_CLASS[currentFormation.accent],
                      )}
                    >
                      {currentFormation.monogram}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-5">
                      <span
                        className="text-13 font-600 leading-1.25 break-words text-white"
                        title={currentFormation.title}
                      >
                        {currentFormation.title}
                      </span>
                      <span className="flex items-center gap-8">
                        <ProgressBar
                          value={currentFormation.progressPercent}
                          tone="lime"
                          size="sm"
                          onDark
                          decorative
                          className="flex-1"
                          data-testid="sidebar-progress"
                        />
                        <span className="text-11 font-600 text-on-dark-secondary">
                          {currentFormation.progressPercent}&nbsp;%
                        </span>
                      </span>
                      <span className="text-11 text-on-dark-muted">
                        {formationModuleLabel(currentFormation)}
                      </span>
                    </span>
                  </div>

                  <nav aria-label={t.formationNavLabel} data-testid="sidebar-formation-nav">
                    <ul className="m-0 flex list-none flex-col gap-2 p-0">
                      {formationLinks.map((link) => (
                        <li key={link.href}>
                          <SidebarLink
                            {...link}
                            active={isActivePath(pathname, link.href)}
                            onNavigate={onNavigate}
                          />
                        </li>
                      ))}
                    </ul>
                  </nav>
                </>
              )}
            </section>
          )}

          {status === 'ready' && data !== null ? <StreakBlock streak={data.streak} /> : null}
        </aside>
      )}
    </>
  );
};

export interface SidebarProps {
  /** Server-rendered DTO: the first paint never waits for the browser (ET-3). */
  initialData: SidebarDto | null;
  initialError?: boolean;
  /** The fixed header renders the trigger when `external` (SPEC-305 EF-1). */
  showTrigger?: 'internal' | 'external';
  /** Ref of the external trigger, used to return the focus after the mobile overlay (CL-3). */
  showTriggerRef?: RefObject<HTMLButtonElement | null> | undefined;
  /** Header visibility mirror: called whenever the collapse preference changes. */
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Registers the show action so the fixed header can reveal the sidebar (SPEC-305 EF-1). */
  onShowHandler?: (show: () => void) => void;
}

/**
 * Connected sidebar: server data, client refresh through `/api/v1/me/sidebar`, persisted collapse
 * and mobile overlay with Escape, backdrop, focus trap and focus return (EF-3, CL-3).
 */
export const Sidebar = ({
  initialData,
  initialError = false,
  showTrigger = 'internal',
  showTriggerRef,
  onCollapsedChange,
  onShowHandler,
}: SidebarProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(initialData?.collapsed ?? false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  const localTriggerRef = useRef<HTMLButtonElement>(null);
  const triggerRef = showTriggerRef ?? localTriggerRef;
  const wasOverlayOpen = useRef(false);

  const query = useQuery({
    queryKey: SIDEBAR_QUERY_KEY,
    queryFn: () => api.sidebarGet({}),
    ...(initialData === null ? {} : { initialData }),
    retry: false,
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      // CL-2 — a browser that refuses localStorage keeps the server preference.
    }
  }, [collapsed]);

  useEffect(() => {
    onCollapsedChange?.(collapsed);
  }, [collapsed, onCollapsedChange]);

  useEffect(() => {
    if (overlayOpen) {
      wasOverlayOpen.current = true;
      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const focusTarget = asideRef.current?.querySelector<HTMLElement>(
        '[data-testid="sidebar-hide"]',
      );
      focusTarget?.focus();
      return () => {
        document.body.style.overflow = previous;
      };
    }
    if (wasOverlayOpen.current) {
      wasOverlayOpen.current = false;
      triggerRef.current?.focus();
    }
    return undefined;
  }, [overlayOpen, triggerRef]);

  useEffect(() => {
    if (!overlayOpen) return undefined;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOverlayOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [overlayOpen]);

  const update = useMutation({
    mutationFn: (input: { collapsed?: boolean; currentFormationId?: string }) =>
      api.sidebarUpdate({ body: input }),
    onSuccess: (data) => {
      queryClient.setQueryData(SIDEBAR_QUERY_KEY, data);
      setCollapsed(data.collapsed);
    },
    onError: (error: unknown) => {
      toast({
        title: 'Le menu n’a pas pu être enregistré.',
        description:
          error instanceof ApiError ? error.detail : 'Vérifiez votre connexion puis réessayez.',
        tone: 'error',
      });
    },
  });

  const closeOverlay = () => {
    setOverlayOpen(false);
  };

  const [archiveTarget, setArchiveTarget] = useState<SidebarFormation | null>(null);
  const [limitTarget, setLimitTarget] = useState<SidebarFormation | null>(null);
  const [limitCandidates, setLimitCandidates] = useState<SidebarFormation[]>([]);

  // SPEC-618 — one transition answer already contains the refreshed management state; patch the
  // shell view immediately, then refresh the counters and the server-rendered pages.
  const applyManagementState = (state: FormationManagementState) => {
    queryClient.setQueryData<SidebarDto>(SIDEBAR_QUERY_KEY, (previous) => {
      if (previous === undefined) return previous;
      return {
        ...previous,
        currentFormation:
          state.formations.find(
            (formation) =>
              formation.id === state.currentFormationId && formation.status === 'active',
          ) ?? null,
        formations: state.formations,
      };
    });
    void queryClient.invalidateQueries({ queryKey: SIDEBAR_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ['home'] });
    router.refresh();
  };

  const notifyError = (error: unknown) => {
    toast({
      title: t.formationManagement.errorTitle,
      description: error instanceof ApiError ? error.detail : t.formationManagement.errorDetail,
      tone: 'error',
    });
  };

  const pause = useMutation({
    mutationFn: (formation: SidebarFormation) =>
      api.formationPause({ params: { fid: formation.id }, body: {} }),
    onSuccess: (data, formation) => {
      applyManagementState(data.state);
      if (data.outcome === 'applied') {
        toast({ title: t.formationManagement.pausedToast(formation.title), tone: 'success' });
      }
    },
    onError: notifyError,
  });

  const resume = useMutation({
    mutationFn: (input: { formation: SidebarFormation; pauseFormationId?: string }) =>
      api.formationResume({
        params: { fid: input.formation.id },
        body:
          input.pauseFormationId === undefined ? {} : { pauseFormationId: input.pauseFormationId },
      }),
    onSuccess: (data, input) => {
      applyManagementState(data.state);
      if (data.outcome === 'limit') {
        setLimitTarget(input.formation);
        setLimitCandidates(
          data.state.formations.filter((formation) => formation.status === 'active'),
        );
        return;
      }
      setLimitTarget(null);
      setLimitCandidates([]);
      if (data.outcome === 'applied') {
        toast({
          title: t.formationManagement.resumedToast(input.formation.title),
          tone: 'success',
        });
      }
    },
    onError: notifyError,
  });

  const archive = useMutation({
    mutationFn: (formation: SidebarFormation) =>
      api.formationArchive({ params: { fid: formation.id }, body: {} }),
    onSuccess: (data, formation) => {
      applyManagementState(data.state);
      setArchiveTarget(null);
      if (data.outcome === 'applied') {
        toast({ title: t.formationManagement.archivedToast(formation.title), tone: 'success' });
      }
    },
    onError: (error) => {
      setArchiveTarget(null);
      notifyError(error);
    },
  });

  const switchCurrent = useMutation({
    mutationFn: (formation: SidebarFormation) =>
      api.currentFormationUpdate({ body: { formationId: formation.id } }),
    onSuccess: (state, formation) => {
      applyManagementState(state);
      toast({ title: t.formationManagement.currentToast(formation.title), tone: 'success' });
    },
    onError: notifyError,
  });

  const hide = () => {
    if (overlayOpen) {
      closeOverlay();
      return;
    }
    const previous = collapsed;
    setCollapsed(true);
    update.mutate(
      { collapsed: true },
      {
        onError: () => {
          setCollapsed(previous);
        },
      },
    );
  };

  const show = useCallback(() => {
    if (isCompactViewport()) {
      setOverlayOpen(true);
      return;
    }
    setCollapsed(false);
    update.mutate({ collapsed: false });
  }, [update]);

  // SPEC-305 EF-1 — the fixed header owns the visible trigger; it calls the registered action so
  // the sidebar keeps its own show logic (persisted on desktop, overlay on mobile).
  useEffect(() => {
    onShowHandler?.(show);
  }, [onShowHandler, show]);

  const retry = () => {
    void query.refetch();
  };

  const selectFormation = (formation: SidebarFormation) => {
    closeOverlay();
    if (formation.status === 'paused') {
      resume.mutate({ formation });
      return;
    }
    switchCurrent.mutate(formation);
  };

  const requestPause = (formation: SidebarFormation) => {
    closeOverlay();
    pause.mutate(formation);
  };

  const requestResume = (formation: SidebarFormation) => {
    closeOverlay();
    resume.mutate({ formation });
  };

  const requestArchive = (formation: SidebarFormation) => {
    closeOverlay();
    setArchiveTarget(formation);
  };

  const pendingFormationId = pause.isPending
    ? pause.variables.id
    : resume.isPending
      ? resume.variables.formation.id
      : archive.isPending
        ? archive.variables.id
        : null;

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!overlayOpen || event.key !== 'Tab') return;
    const root = asideRef.current;
    if (root === null) return;
    const focusable = [
      ...root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((element) => element.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const navigate = () => {
    if (overlayOpen) closeOverlay();
  };

  const status: SidebarViewProps['status'] =
    query.data === undefined ? (query.isError ? 'error' : 'loading') : 'ready';

  return (
    <>
      <SidebarView
        data={query.data ?? null}
        status={initialError && query.data === undefined && !query.isError ? 'error' : status}
        collapsed={collapsed}
        overlayOpen={overlayOpen}
        pathname={pathname}
        onHide={hide}
        onShow={show}
        onCloseOverlay={closeOverlay}
        onRetry={retry}
        onSelectFormation={selectFormation}
        onPauseFormation={requestPause}
        onResumeFormation={requestResume}
        onArchiveFormation={requestArchive}
        pendingFormationId={pendingFormationId}
        onNavigate={navigate}
        onKeyDown={handleKeyDown}
        showTriggerRef={triggerRef}
        asideRef={asideRef}
        showTrigger={showTrigger}
      />
      <AlertDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        trigger={<span aria-hidden="true" />}
        title={t.formationManagement.archiveTitle(archiveTarget?.title ?? '')}
        description={t.formationManagement.archiveDescription}
        confirmLabel={t.formationManagement.archiveConfirm}
        cancelLabel={t.formationManagement.cancel}
        destructive
        data-testid="formation-archive-dialog"
        onConfirm={async () => {
          if (archiveTarget === null) return;
          try {
            await archive.mutateAsync(archiveTarget);
          } catch {
            // The error toast of the mutation explains the refusal; the dialog still closes.
          }
        }}
      />
      <ActiveLimitDialog
        open={limitTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setLimitTarget(null);
            setLimitCandidates([]);
          }
        }}
        targetTitle={limitTarget?.title ?? ''}
        formations={limitCandidates}
        pending={resume.isPending}
        onConfirm={(pauseFormationId) => {
          if (limitTarget === null) return;
          resume.mutate({ formation: limitTarget, pauseFormationId });
        }}
      />
    </>
  );
};
