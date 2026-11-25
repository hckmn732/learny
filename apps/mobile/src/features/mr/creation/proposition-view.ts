// Vue de la proposition de programme (maquette Proposition.dc.html).
//
// Les modules arrivent ordonnés et datés. Le volume total (`volumeHours`) n'est pas réparti par le
// serveur : l'écran affiche une durée par module proportionnelle à son nombre de notions, et
// laisse la durée absente quand le volume n'est pas connu. Les dates sont formatées sans
// `Intl` pour rester déterministes d'un moteur JavaScript à l'autre.
import type { ProgrammeModuleDto, ProgrammeProposalDto } from '@learny/contracts';

const MONTHS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
] as const;

/** « 2027-01-18 » → « 18 janv. » (maquette), la valeur brute si la date est illisible. */
export function formatShortDate(value: string): string {
  const parts = value.slice(0, 10).split('-');
  if (parts.length !== 3) return value;
  const day = Number(parts[2]);
  const month = Number(parts[1]);
  const label = MONTHS[month - 1];
  if (!Number.isInteger(day) || label === undefined) return value;
  return `${String(day)} ${label}`;
}

export interface PropositionModuleRow {
  readonly position: number;
  readonly title: string;
  readonly notions: number;
  readonly hours: number | null;
}

export interface PropositionView {
  readonly modules: readonly PropositionModuleRow[];
  readonly notionCount: number;
  /** Fin du dernier module, formatée pour la pastille de l'en-tête. */
  readonly endDate: string | null;
  /** `volumeHours * notions du module / notions totales`, au moins 1 h. */
  readonly hoursOf: (module: ProgrammeModuleDto) => number | null;
}

function notionCountOf(module: ProgrammeModuleDto): number {
  return module.chapters.reduce((count, chapter) => count + chapter.notions.length, 0);
}

/** Lignes de modules, nombre de notions et date de fin de la proposition. */
export function buildPropositionView(proposal: ProgrammeProposalDto): PropositionView {
  const modules = [...proposal.modules].sort((first, second) => first.position - second.position);
  const notionCount = modules.reduce((count, module) => count + notionCountOf(module), 0);
  const volume = proposal.volumeHours;
  const hoursOf = (module: ProgrammeModuleDto): number | null => {
    const notions = notionCountOf(module);
    if (volume === null || notionCount === 0 || notions === 0) return null;
    return Math.max(1, Math.round((volume * notions) / notionCount));
  };
  const last = modules.at(-1);
  return {
    modules: modules.map((module) => ({
      position: module.position,
      title: module.title,
      notions: notionCountOf(module),
      hours: hoursOf(module),
    })),
    notionCount,
    endDate: last === undefined ? null : formatShortDate(last.plannedEnd),
    hoursOf,
  };
}