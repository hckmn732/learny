# ADR-0204 — Page publique d'accessibilite et liens de pied de page

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-803, SPEC-806

## Contexte

SPEC-803 doit publier une declaration d'accessibilite et SPEC-806 doit publier les pages legales. Elles peuvent etre executees dans un ordre different et partagent le pied des pages publiques.

## Décision

Une route publique /accessibilite presente la declaration avec le statut 'partiellement conforme' jusqu'a un audit externe verifie. Le registre unique SITE_FOOTER_LINKS ordonne CGU, Confidentialite, Mentions legales, puis Accessibilite : partiellement conforme. SiteFooter rend ce registre dans un nav nomme Informations legales sur les pages publiques, y compris authentification, pages legales, accessibilite et hors-ligne. SPEC-803 et SPEC-806 ajoutent leurs entrees sans ecraser celles de l'autre.

## Conséquences

La declaration ne pretend pas a une conformite totale sans preuve; les tests verifient ordre, liens et presence sur chaque page publique.
