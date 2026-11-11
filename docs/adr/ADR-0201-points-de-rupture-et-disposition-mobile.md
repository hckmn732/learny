# ADR-0201 — Points de rupture et disposition mobile

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-802, BR-PLA-02, BR-NAV-03

## Contexte

BR-PLA-02 exige un usage de 360 à 1920 px et des cibles de 44 px ; BR-NAV-03 fixe le seuil du menu à 900 px. Les maquettes n'ont pas de requêtes média ; les autres seuils et la vérification ne sont pas définis.

## Décision

- Points de rupture uniques : 768 px (`sm`), 900 px (`nav`, menu), 1024 px (`lg`), 1280 px (`xl`), 1440 px (`2xl`), en rem de 16 px.
- Sous 900 px : menu en surimpression modale ; la préférence mémorisée ne s'applique qu'au-delà. Sous 768 px : panneaux (notifications, recherche, Mon compte, tuteur, détail de la carte) en plein écran avec bouton « Fermer », barre d'actions fixe en bas des écrans d'exercice, feuilles basses pour les détails, tableau des formations en cartes, vue Jour par défaut dans l'agenda.
- Contenu limité à 90rem de large au-delà de 1440 px.
- Cibles tactiles ≥ 44 × 44 px partout ; seules exemptions : liens en ligne dans le texte courant et nœuds SVG de la carte des notions (alternatives accessibles).
- Vérification : matrice automatisée de tous les écrans à 360, 390, 768, 1024, 1440 et 1920 px (pas de défilement horizontal, cibles) ; comparaison mobile aux références « menu masqué » 390×844 générées depuis les maquettes, écart ≤ 12 %.

## Conséquences

Tout nouvel écran est ajouté à l'inventaire de la matrice responsive.
