// Single registry of the public footer links (ADR-0204, SPEC-803 ET-6).
// SPEC-806 serves the three legal pages; this specification owns the accessibility entry in the
// fourth position. The order is normative.
export const SITE_FOOTER_LINKS = [
  { href: '/legal/cgu', label: 'CGU' },
  { href: '/legal/confidentialite', label: 'Confidentialité' },
  { href: '/legal/mentions', label: 'Mentions légales' },
  { href: '/accessibilite', label: 'Accessibilité : partiellement conforme' },
] as const;

export type SiteFooterLink = (typeof SITE_FOOTER_LINKS)[number];
