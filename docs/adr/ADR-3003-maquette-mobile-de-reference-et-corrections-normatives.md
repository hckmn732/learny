# ADR-3003 — Maquette mobile de référence et corrections normatives

- **Statut** : Acceptée — adapte ADR-0034 à la piste mobile
- **Origine** : Déduite (préparation de la piste mobile)
- **Date** : 2026-11-22
- **Liens** : ADR-0007, ADR-0034, ADR-3002, ADR-3006, SPEC-3002, SPEC-3304, SPEC-3305

## Contexte

`design/app-mobile/` (planche `index.html`, écran seul `view.html`, exports
`exports/screens/*.png` à 786 × 1704 pour iOS et 824 × 1830 pour Android) est une proposition de
conception non normative. Elle diverge des règles métier sur plusieurs points et précède
l'adoption des barres natives d'iOS 26 (Liquid Glass) et de Material 3 Expressive.

## Décision

1. `design/app-mobile/` devient la **maquette de référence de la piste mobile** pour la structure,
   les textes, les états et le style. Comme `design/maquettes/`, elle n'est jamais modifiée par
   un agent. Priorité en cas de conflit : ADR > règles métier > spécification > maquette mobile.
2. Corrections normatives (la spécification fait foi, la maquette est lue avec ces écarts) :
   - **Quiz de validation** : bouton « Vérifier » (pas « Valider »), correction et explication
     immédiates, réponse non modifiable ensuite (BR-QUI-04) ; pas de chronomètre ; la mention
     « Correction immédiate · nouvelles questions à chaque tentative » est affichée (BR-QUI-07) ;
     le nombre de questions vient de la tentative (10 à 20, BR-QUI-01).
   - **Réviser** : la session joue tous les types de briques que le quiz global propose
     (BR-BRI-01, BR-MEM-05) avec rail des jeux, raison du tuteur, « Passer » / « Suivant » et
     écran de fin (BR-MEM-08) ; la carte « Touchez pour révéler » n'est que le rendu de la brique
     « carte de rappel », dont l'auto-évaluation est « Raté / Difficile / Bon / Facile » avec
     échéances (BR-MEM-02, SPEC-701). Les boutons « À revoir » / « Je savais » de la maquette
     appartiennent à l'**échauffement** (BR-AUT-03), joué depuis Aujourd'hui et Réviser.
   - **Signet du cours** : aucune règle ni route ne le porte ; il n'est pas implémenté (ADR-0005).
   - **Connexion** : le lien magique est proposé en plus du mot de passe (ADR-0007) ; les boutons
     Apple et Google n'apparaissent qu'à partir de SPEC-3402. « Mot de passe oublié ? » ouvre
     l'envoi d'un lien magique (aucune réinitialisation de mot de passe n'existe dans le
     produit). L'inscription exige la case non pré-cochée d'acceptation des CGU et de la
     politique de confidentialité (BR-ACC-02) au lieu de la mention « En continuant, vous
     acceptez… », et affiche l'indicateur de solidité du mot de passe (BR-ACC-01).
   - **Abonnement** : affichage du statut seulement (ADR-3006).
3. **Barres natives** : la barre d'onglets, la barre de navigation et la barre d'état sont
   rendues par les composants natifs du système (ADR-3004) et peuvent différer de la maquette
   (Liquid Glass, Material 3 Expressive). La comparaison visuelle les **masque** ; seule la zone
   de contenu est comparée.
4. **Comparaison visuelle** : capture de l'émulateur ou du simulateur à l'horloge figée
   (2026-11-11T12:20:00Z, 13:20 heure de Paris, barre d'état en mode démo), redimensionnée aux
   dimensions des exports, zones natives masquées ; écart de pixels ≤ 12 % sur la zone de
   contenu, plus contrôles structurels (textes exacts, ordre des régions, `testID`) et contrôle
   des jetons (couleurs et rayons lus dans le thème). Références :
   `design/app-mobile/exports/screens/{ios,android}-NN-*.png` et, pour les états,
   `design/app-mobile/exports/states/*.png`.

## Conséquences

- Les spécifications d'écran (`visual: mockup`) citent l'export de référence et l'état exact.
- Les états non couverts par la maquette (chargement, erreur, vide, hors ligne, permission)
  sont composés avec les composants de SPEC-3002 et vérifiés par les jetons.
