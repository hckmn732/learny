'use client';

import NextLink from 'next/link';

import { fr } from '@learny/i18n/fr/simple';
import { Button } from '@learny/ui';
import { colors } from '@learny/ui/tokens';

import { ChatIcon, UploadIcon } from './icons';

const t = fr.simple.choice;

export interface SimpleChoiceCardsProps {
  /** `home` dans la section de l'accueil, `dialog` dans la boîte de dialogue de création. */
  variant?: 'home' | 'dialog';
  /** Ferme la boîte de dialogue avant la navigation. */
  onNavigate?: (() => void) | undefined;
}

/**
 * SPEC-4002 EF-1 — les deux portes d'entrée du mode simple (SCR-03, étape 1 de la maquette) :
 * « Dépose ton cours » sur fond citron, mise en avant, et « Construire avec le tuteur », le cadrage
 * existant. Les mêmes cartes servent la section de l'accueil et la boîte de dialogue.
 */
export function SimpleChoiceCards({ variant = 'home', onNavigate }: SimpleChoiceCardsProps) {
  const inDialog = variant === 'dialog';
  return (
    <div
      data-testid="simple-choice-cards"
      className={inDialog ? 'flex flex-col gap-10' : 'grid gap-16 lg:grid-cols-[1.25fr_1fr]'}
    >
      <article
        className="flex flex-col gap-10 rounded-24 border border-solid border-lime bg-lime p-24 max-sm:p-18"
        data-testid="simple-card-drop"
      >
        <span className="self-start rounded-full border border-solid border-ink bg-ink px-9 py-3 text-12 font-600 text-lime">
          {t.dropCard.badge}
        </span>
        <h3 className="m-0 mt-2 font-display text-26 font-600 max-sm:text-22">
          {t.dropCard.title}
        </h3>
        <p className="m-0 text-15 leading-1.5 text-lime-ink-strong max-sm:text-14">
          {t.dropCard.body}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-8">
          <span className="text-13 font-600 text-lime-ink-strong">{t.dropCard.hint}</span>
          <Button asChild size="md" variant="dark">
            <NextLink
              data-testid="simple-card-drop-action"
              href="/formations/depot"
              {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
              prefetch={false}
            >
              <UploadIcon color={colors.white} size={16} />
              {t.dropCard.action}
            </NextLink>
          </Button>
        </div>
      </article>

      <article
        className="flex flex-col gap-10 rounded-24 border border-solid border-border bg-surface p-24 max-sm:p-18"
        data-testid="simple-card-tutor"
      >
        <span className="self-start rounded-full border border-solid border-indigo-soft bg-indigo-soft px-9 py-3 text-12 font-600 text-indigo-ink">
          {t.tutorCard.badge}
        </span>
        <h3 className="m-0 mt-2 font-display text-26 font-600 max-sm:text-20">
          {t.tutorCard.title}
        </h3>
        <p className="m-0 text-15 leading-1.5 text-ink-muted max-sm:text-14">{t.tutorCard.body}</p>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-8">
          <span className="text-13 font-600 text-ink-muted">{t.tutorCard.hint}</span>
          <Button asChild size="md" variant="outline">
            <NextLink
              data-testid="simple-card-tutor-action"
              href="/formations/nouvelle"
              {...(onNavigate === undefined ? {} : { onClick: onNavigate })}
              prefetch={false}
            >
              <ChatIcon size={16} />
              {t.tutorCard.action}
            </NextLink>
          </Button>
        </div>
      </article>
    </div>
  );
}
