# ADR-0223 — Outillage SDD testable et index de progression (SPEC-003)

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-11
- **Liens** : SPEC-003, ADR-0068, ADR-0203

## Contexte

SPEC-003 demande d'injecter la racine et l'horloge de l'outillage, de réutiliser displayStatus et nextAction dans l'application, de vérifier l'index par une capture alors que ses valeurs changent à chaque spécification terminée, et cite un assistant expectTokens qui n'existe pas encore (socle de tests de SPEC-004) ; le projet Playwright mobile n'existe pas non plus avant SPEC-004.

## Décision

1. Les fonctions pures (statuts, prochaine action, synthèse, rendu de PROGRESS.md) vivent dans tools/sdd/core.mjs, réexportées par lib.mjs ; core.d.mts et audit.d.mts les typent pour TypeScript. 2. Racine et horloge injectables par variables réservées aux tests : SDD_ROOT (racine du référentiel) et SDD_NOW (date ISO figée) ; sans elles, comportement inchangé. 3. Toutes les écritures (état, verrou, PROGRESS.md, audit, ADR, CHANGELOG, preuves) passent par writeFileAtomic (fichier temporaire du même répertoire puis renommage) ; un state.json mal formé arrête la commande sans être recréé. 4. nextAction ne renvoie finished que lorsque tous les checkpoints sont réussis. 5. apps/web/lib/sdd-status.ts trouve la racine en remontant jusqu'à specs/catalog.json (ou SDD_ROOT), ne lit que deux fichiers et masque une raison de blocage qui ressemble à un secret. 6. La capture de l'index masque les valeurs vivantes (indicateurs, barre, prochaine action, corps des tableaux) et fige les largeurs de colonnes des phases ; la capture mobile est prise à 390 px dans le projet desktop. 7. En attendant expectTokens (SPEC-004), le test vérifie les jetons par toHaveCSS (bordure #E7E6E1, rayon 16 px, texte #111113). 8. La 404 hors pages SDD est vérifiée sur un second serveur next start lancé sans ENABLE_SDD_PAGES. 9. ESLint autorise tabIndex sur role=region pour les tableaux défilants (WCAG 2.1.1).

## Conséquences

Les tests n'écrivent jamais dans le suivi réel ; SPEC-004 pourra remplacer les vérifications toHaveCSS par expectTokens et ajouter le projet mobile.
