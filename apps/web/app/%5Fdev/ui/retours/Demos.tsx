'use client';

import { Bell, ChevronDown, LogOut, Pause, SlidersHorizontal, TriangleAlert } from 'lucide-react';

import {
  AlertDialog,
  Avatar,
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  SkeletonCard,
  SkeletonGroup,
  SkeletonStatRow,
  SkeletonText,
  ToastProvider,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  toast,
} from '@learny/ui';

import { GalleryCard } from '../../../../components/dev-ui/GalleryCard';
import { fr } from '../../../../messages/fr';

const t = fr.ui.gallery.retours;

export function Demos() {
  const popoverTitleId = 'gallery-popover-title';

  const showToasts = (count: number) => {
    for (let index = 1; index <= count; index += 1) {
      toast({
        title: `${t.toast.neutral} · ${String(index)}`,
        description: t.toast.description,
        tone: 'neutral',
      });
    }
  };

  return (
    <ToastProvider>
      <TooltipProvider delayDuration={400} skipDelayDuration={0}>
        <GalleryCard testId="ui-retours-popover" title={t.popover.title} intro={t.popover.intro}>
          <Popover>
            <PopoverTrigger asChild>
              <IconButton
                aria-label={t.popover.trigger}
                badge={<Bell aria-hidden="true" size={14} strokeWidth={2} />}
                data-testid="ui-popover-trigger"
                icon={Bell}
                label={t.popover.trigger}
              />
            </PopoverTrigger>
            <PopoverContent
              aria-labelledby={popoverTitleId}
              data-testid="ui-popover-content"
              className="p-20"
            >
              <h2
                className="m-0 font-display text-20 font-600 tracking-heading"
                id={popoverTitleId}
              >
                {t.popover.panelTitle}
              </h2>
              <p className="mt-8 text-14 leading-1.5 text-ink-secondary">{t.popover.panelBody}</p>
            </PopoverContent>
          </Popover>
        </GalleryCard>

        <GalleryCard testId="ui-retours-menu" title={t.menu.title} intro={t.menu.intro}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button data-testid="ui-menu-trigger" variant="outline">
                <Avatar firstName="Alex" lastName="Perrin" />
                {t.menu.trigger}
                <ChevronDown aria-hidden="true" size={14} strokeWidth={2.2} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent data-testid="ui-menu-content">
              <DropdownMenuLabel>
                <Avatar firstName="Alex" lastName="Perrin" />
                <span className="flex min-w-0 flex-col gap-2">
                  <span className="text-14 font-700">{t.menu.identityName}</span>
                  <span className="text-12 text-ink-muted">{t.menu.identityMeta}</span>
                </span>
              </DropdownMenuLabel>
              <DropdownMenuItem icon={SlidersHorizontal}>{t.menu.settings}</DropdownMenuItem>
              <DropdownMenuItem icon={Pause}>{t.menu.pause}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={LogOut}>{t.menu.signOut}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </GalleryCard>

        <GalleryCard testId="ui-retours-dialog" title={t.dialog.title} intro={t.dialog.intro}>
          <Dialog>
            <DialogTrigger asChild>
              <Button data-testid="ui-dialog-trigger" variant="lime">
                {t.dialog.trigger}
              </Button>
            </DialogTrigger>
            <DialogContent data-testid="ui-dialog">
              <DialogTitle>{t.dialog.dialogTitle}</DialogTitle>
              <DialogDescription>{t.dialog.description}</DialogDescription>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">{t.dialog.cancel}</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="dark">{t.dialog.confirm}</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </GalleryCard>

        <GalleryCard testId="ui-retours-alert" title={t.alert.title} intro={t.alert.intro}>
          <AlertDialog
            data-testid="ui-alert-dialog"
            trigger={
              <Button data-testid="ui-alert-dialog-trigger" variant="danger">
                <TriangleAlert aria-hidden="true" size={16} strokeWidth={2} />
                {t.alert.trigger}
              </Button>
            }
            title={t.alert.dialogTitle}
            description={t.alert.description}
            confirmLabel={t.alert.confirm}
            cancelLabel={t.alert.cancel}
            destructive
          />
        </GalleryCard>

        <GalleryCard testId="ui-retours-toasts" title={t.toast.title} intro={t.toast.intro}>
          <div className="flex flex-wrap gap-8">
            <Button
              data-testid="ui-toast-trigger-neutral"
              onClick={() => {
                toast({
                  title: t.toast.neutral,
                  description: t.toast.description,
                  tone: 'neutral',
                });
              }}
              variant="outline"
            >
              {t.toast.triggerNeutral}
            </Button>
            <Button
              data-testid="ui-toast-trigger-success"
              onClick={() => {
                toast({
                  title: t.toast.success,
                  description: t.toast.description,
                  tone: 'success',
                  action: { label: t.toast.actionLabel, onClick: () => undefined },
                });
              }}
              variant="lime"
            >
              {t.toast.triggerSuccess}
            </Button>
            <Button
              data-testid="ui-toast-trigger-error"
              onClick={() => {
                toast({ title: t.toast.error, description: t.toast.description, tone: 'error' });
              }}
              variant="danger"
            >
              {t.toast.triggerError}
            </Button>
            <Button
              data-testid="ui-toast-trigger-four"
              onClick={() => {
                showToasts(4);
              }}
              variant="dark"
            >
              {t.toast.triggerFour}
            </Button>
          </div>
        </GalleryCard>

        <GalleryCard testId="ui-retours-tooltip" title={t.tooltip.title} intro={t.tooltip.intro}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t.tooltip.trigger}
                data-testid="ui-tooltip-trigger"
                variant="ghost"
              >
                {t.tooltip.trigger}
              </Button>
            </TooltipTrigger>
            <TooltipContent data-testid="ui-tooltip-content">{t.tooltip.body}</TooltipContent>
          </Tooltip>
        </GalleryCard>

        <GalleryCard testId="ui-retours-empty" title={t.empty.title} intro={t.empty.intro}>
          <div className="grid grid-cols-1 gap-16 shell:grid-cols-2">
            <EmptyState
              action={<Button variant="outline">{t.empty.emptyAction}</Button>}
              data-testid="ui-empty"
              description={t.empty.emptyDescription}
              icon={TriangleAlert}
              title={t.empty.emptyTitle}
            />
            <EmptyState compact data-testid="ui-empty-compact" title={t.empty.compactText} />
          </div>
        </GalleryCard>

        <GalleryCard testId="ui-retours-skeleton" title={t.skeleton.title} intro={t.skeleton.intro}>
          <SkeletonGroup data-testid="ui-skeleton">
            <div className="flex flex-col gap-16">
              <SkeletonText lines={2} />
              <Skeleton className="h-40 w-40" radius={12} />
              <div className="grid grid-cols-1 gap-16 shell:grid-cols-2">
                <SkeletonCard />
                <SkeletonCard />
              </div>
              <SkeletonStatRow />
            </div>
          </SkeletonGroup>
        </GalleryCard>

        <GalleryCard testId="ui-retours-error" title={t.error.title} intro={t.error.intro}>
          <ErrorState data-testid="ui-error" requestId={t.error.requestId} />
        </GalleryCard>
      </TooltipProvider>
    </ToastProvider>
  );
}
