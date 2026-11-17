// Single registry of the public footer (ADR-0204, SPEC-806 EF-7, ET-5).
//
// SPEC-803 and SPEC-806 add their entries without overriding the other: CGU, Confidentialité,
// Mentions légales, then Accessibilité. The order and labels are normative and tested; no script
// or optional cookie is loaded by the footer.
import { fr } from '../messages/fr';

export interface SiteFooterLink {
  href: string;
  /** French label of the link; the order below is the ADR-0204 order. */
  label: string;
}

export const SITE_FOOTER_LINKS: readonly SiteFooterLink[] = [
  { href: '/legal/cgu', label: fr.legal.footer.links.cgu },
  { href: '/legal/confidentialite', label: fr.legal.footer.links.confidentialite },
  { href: '/legal/mentions', label: fr.legal.footer.links.mentions },
  { href: '/accessibilite', label: fr.legal.footer.links.accessibilite },
];

export const SITE_FOOTER_NAV_LABEL = fr.legal.footer.navLabel;
