'use client';

import NextLink from 'next/link';

import { fr } from '@learny/i18n/fr/simple';
import { Button } from '@learny/ui';
import { colors } from '@learny/ui/tokens';

import { KeyIcon } from './icons';

const t = fr.simple.key;

export interface KeyWarningProps {
  /** Route de retour après l'ajout de la clé (`/formations/[fid]/depot`). */
  returnTo: string;
}

/**
 * SPEC-4002 EF-3, BR-IA-06 — l'encart « Ajoute ta clé d'IA pour continuer » : la création reste
 * bloquée, les fichiers restent affichés et un seul geste mène à la section Modèles des Paramètres,
 * qui ramène ensuite à la page de dépôt.
 */
export function KeyWarning({ returnTo }: KeyWarningProps) {
  const href = `/parametres?retour=${encodeURIComponent(returnTo)}#modeles`;
  return (
    <div
      className="flex items-start gap-12 rounded-14 border border-solid border-orange-ink-alt/40 bg-orange-soft px-16 py-14"
      data-testid="simple-key-warning"
      role="alert"
    >
      <span className="mt-2 shrink-0">
        <KeyIcon color={colors['orange-ink-alt']} size={20} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="m-0 text-14 font-700 text-orange-ink">{t.title}</p>
        <p className="m-0 text-13 leading-1.5 text-orange-ink-strong">{t.body}</p>
        <Button asChild className="mt-10 self-start" size="md" variant="dark">
          <NextLink data-testid="simple-key-action" href={href}>
            <KeyIcon color={colors.white} size={14} />
            {t.action}
          </NextLink>
        </Button>
      </div>
    </div>
  );
}
