# ADR-0225 — Captures de référence déterministes

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-005

## Contexte

Deux générations successives de design/references produisaient des PNG différents de quelques pixels : le chargement des polices distantes et le cache de glyphes de Chromium laissaient parfois des rasters de repli, et le rendu GPU/compositeur variait entre processus. CA-2 exige des PNG et empreintes identiques.

## Décision

Les polices Google sont récupérées une fois par génération côté Node et rejouées aux contextes Playwright ; le document reste invisible jusqu'à document.fonts.ready, puis un repaint complet est forcé ; Chromium est lancé avec un profil de rendu fixe (grayscale AA, hinting désactivé, compositeur déterministe). Une police inaccessible fait échouer la génération.

## Conséquences

Aucune conséquence particulière au-delà de la décision.
