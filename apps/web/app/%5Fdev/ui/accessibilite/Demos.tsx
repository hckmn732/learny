'use client';

import { X } from 'lucide-react';
import { useRef, useState } from 'react';

import {
  ACCESSIBLE_TOKEN_PAIRS,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  IconButton,
  LiveRegion,
  Skeleton,
  SkeletonGroup,
  SkeletonText,
  TextField,
  contrastRatio,
  returnFocus,
} from '@learny/ui';
import { colors } from '@learny/ui/tokens';

import { GalleryCard } from '../../../../components/dev-ui/GalleryCard';
import { fr } from '../../../../messages/fr';

const t = fr.ui.gallery.accessibility;

export function Demos() {
  const archiveTriggerRef = useRef<HTMLButtonElement>(null);
  const archived = useRef(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveTriggerVisible, setArchiveTriggerVisible] = useState(true);
  const [politeMessage, setPoliteMessage] = useState('');
  const [assertiveMessage, setAssertiveMessage] = useState('');
  const [, setRenderTick] = useState(0);

  const announceResult = () => {
    // A microtask makes the result genuinely asynchronous without a wall-clock timer.
    void Promise.resolve().then(() => {
      setPoliteMessage(t.live.result);
    });
  };

  const announceError = () => {
    void Promise.resolve().then(() => {
      setAssertiveMessage(t.live.errorMessage);
    });
  };

  return (
    <div className="flex flex-col">
      <GalleryCard testId="a11y-skip" title={t.skip.title} intro={t.skip.intro}>
        <p className="max-w-[42rem] text-14 leading-1.55 text-ink-secondary">{t.skip.body}</p>
      </GalleryCard>

      <GalleryCard testId="a11y-focus" title={t.focus.title} intro={t.focus.intro}>
        <div className="flex flex-wrap items-center gap-8">
          <Dialog open={focusOpen} onOpenChange={setFocusOpen}>
            <DialogTrigger asChild>
              <Button data-testid="a11y-focus-trigger" variant="lime">
                {t.focus.trigger}
              </Button>
            </DialogTrigger>
            <DialogContent data-testid="a11y-focus-dialog">
              <DialogTitle>{t.focus.dialogTitle}</DialogTitle>
              <DialogDescription>{t.focus.dialogDescription}</DialogDescription>
              <DialogFooter>
                <DialogClose asChild>
                  <Button data-testid="a11y-focus-close" variant="outline">
                    {t.focus.close}
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button data-testid="a11y-menu-trigger" variant="outline">
                {t.focus.menuTrigger}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent data-testid="a11y-menu-content">
              <DropdownMenuItem>{t.focus.menuItem}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="mt-16 border-t border-solid border-divider pt-16">
          <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
            {archiveTriggerVisible ? (
              <DialogTrigger asChild>
                <Button data-testid="a11y-archive-trigger" ref={archiveTriggerRef} variant="danger">
                  {t.focus.archiveTrigger}
                </Button>
              </DialogTrigger>
            ) : (
              <p
                className="text-14 text-ink-secondary"
                data-testid="a11y-archive-done"
                role="status"
              >
                {t.focus.archived}
              </p>
            )}
            <DialogContent
              data-testid="a11y-archive-dialog"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                returnFocus({ trigger: archived.current ? null : archiveTriggerRef.current });
              }}
            >
              <DialogTitle>{t.focus.archiveTitle}</DialogTitle>
              <DialogDescription>{t.focus.archiveDescription}</DialogDescription>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">{t.focus.cancel}</Button>
                </DialogClose>
                <Button
                  data-testid="a11y-archive-confirm"
                  onClick={() => {
                    archived.current = true;
                    setArchiveTriggerVisible(false);
                    setArchiveOpen(false);
                  }}
                  variant="danger"
                >
                  {t.focus.confirm}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </GalleryCard>

      <GalleryCard testId="a11y-live" title={t.live.title} intro={t.live.intro}>
        <LiveRegion data-testid="a11y-live-polite" message={politeMessage} />
        <LiveRegion
          data-testid="a11y-live-assertive"
          message={assertiveMessage}
          politeness="assertive"
        />
        <div className="flex flex-wrap gap-8">
          <Button data-testid="a11y-live-run" onClick={announceResult} variant="dark">
            {t.live.run}
          </Button>
          <Button
            data-testid="a11y-live-repeat"
            onClick={() => {
              setRenderTick((tick) => tick + 1);
            }}
            variant="outline"
          >
            {t.live.repeat}
          </Button>
          <Button data-testid="a11y-live-error" onClick={announceError} variant="danger">
            {t.live.error}
          </Button>
        </div>
      </GalleryCard>

      <GalleryCard testId="a11y-motion" title={t.motion.title} intro={t.motion.intro}>
        <div className="flex flex-wrap items-center gap-16">
          <span
            aria-hidden="true"
            className="block size-40 shrink-0 rounded-full bg-indigo animate-skeleton-pulse motion-reduce:animate-none"
            data-testid="a11y-motion-demo"
            title={t.motion.demoLabel}
          />
          <p className="max-w-[42rem] text-14 leading-1.55 text-ink-secondary">{t.motion.body}</p>
        </div>
      </GalleryCard>

      <GalleryCard testId="a11y-contrast" title={t.contrast.title} intro={t.contrast.intro}>
        <div className="grid grid-cols-1 gap-8 shell:grid-cols-2">
          {ACCESSIBLE_TOKEN_PAIRS.map((pair) => {
            const ratio = contrastRatio(colors[pair.foreground], colors[pair.background]);
            return (
              <div
                className="rounded-12 border border-solid border-border p-12"
                data-testid={`a11y-contrast-${pair.id}`}
                key={pair.id}
                style={{
                  backgroundColor: colors[pair.background],
                  color: colors[pair.foreground],
                }}
              >
                <span className="block text-14 font-600">{t.contrast.pairs[pair.id]}</span>
                <span className="mt-2 block text-12">{t.contrast.ratio(ratio.toFixed(2))}</span>
              </div>
            );
          })}
        </div>
      </GalleryCard>

      <GalleryCard testId="a11y-states" title={t.states.title} intro={t.states.intro}>
        <div className="grid grid-cols-1 gap-12 shell:grid-cols-2">
          <SkeletonGroup
            className="rounded-18 border border-solid border-border bg-surface p-16"
            data-testid="a11y-state-loading"
            label={t.states.loading}
          >
            <Skeleton className="h-18 w-1/3" radius={8} />
            <SkeletonText className="mt-12" lines={2} />
          </SkeletonGroup>
          <EmptyState
            className="rounded-18 border border-solid border-border bg-surface"
            compact
            data-testid="a11y-state-empty"
            description={t.states.emptyDescription}
            title={t.states.emptyTitle}
          />
          <ErrorState
            className="rounded-18 border border-solid border-border bg-surface"
            data-testid="a11y-state-error"
            description={t.states.errorDescription}
            onRetry={() => {
              setPoliteMessage(t.states.retryResult);
            }}
            title={t.states.errorTitle}
          />
          <p
            className="rounded-18 border border-solid border-border bg-surface p-16 text-14 font-600 text-green-ink"
            data-testid="a11y-state-success"
            role="status"
          >
            {t.states.success}
          </p>
        </div>
      </GalleryCard>

      <GalleryCard testId="a11y-axe" title={t.axe.title} intro={t.axe.intro}>
        <p className="max-w-[42rem] text-14 leading-1.55 text-ink-secondary">{t.axe.body}</p>
        <ul className="mt-12 list-disc pl-20 text-14 leading-1.6 text-ink-secondary">
          {t.axe.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </GalleryCard>

      <GalleryCard testId="a11y-controls" title={t.controls.title} intro={t.controls.intro}>
        <div className="flex flex-wrap items-end gap-12">
          <Button data-testid="a11y-control-button" variant="dark">
            {t.controls.button}
          </Button>
          <IconButton
            data-testid="a11y-control-icon"
            icon={X}
            label={t.controls.icon}
            tone="light"
          />
          <TextField
            className="min-w-[220px]"
            data-testid="a11y-control-input"
            label={t.controls.input}
            placeholder={t.controls.placeholder}
          />
        </div>
      </GalleryCard>
    </div>
  );
}
