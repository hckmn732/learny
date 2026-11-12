// Pure breadcrumb builder of the navigation (SPEC-303, ET-4, BR-NAV-04).

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface FormationBreadcrumbInput {
  formationId: string;
  module?: { id: string; position: number; title: string };
  page: string;
}

export interface BreadcrumbMessages {
  programme: string;
  /** Builds « Module <n> · <titre> » from the module position and title. */
  module: (position: number, title: string) => string;
}

/** Default dictionary; an application may inject its own (ET-4). */
export const breadcrumbMessagesFr: BreadcrumbMessages = {
  programme: 'Programme',
  module: (position, title) => `Module ${String(position)} · ${title}`,
};

/**
 * Builds the breadcrumb of BR-NAV-04:
 * `Programme / Module n · titre / page`. The last item has no link.
 */
export function buildFormationBreadcrumb(
  { formationId, module, page }: FormationBreadcrumbInput,
  messages: BreadcrumbMessages = breadcrumbMessagesFr,
): BreadcrumbItem[] {
  const programmeHref = `/formations/${encodeURIComponent(formationId)}/programme`;
  const items: BreadcrumbItem[] = [{ label: messages.programme, href: programmeHref }];
  if (module) {
    items.push({
      label: messages.module(module.position, module.title),
      href: `/formations/${encodeURIComponent(formationId)}/modules/${encodeURIComponent(module.id)}`,
    });
  }
  items.push({ label: page });
  return items;
}
