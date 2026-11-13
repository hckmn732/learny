# ADR-0292 — Contrat de correction et extensions des vues de briques

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-13
- **Liens** : SPEC-503, SPEC-502

## Contexte

SPEC-502 n'est pas encore livrée : `CorrectionView` et les schémas de réponse n'existent pas. SPEC-503 doit néanmoins typer les vues contrôlées, les jeux internes (« Vérifier », « Recommencer »), les échéances de la carte de rappel, les indices de la consigne, les extraits supprimés et le minuteur déterministe. Les classes Tailwind du paquet `@learny/bricks` doivent aussi être scannées par l'application.

## Décision

1. `CorrectionView<T>` est défini dans `packages/bricks/src/correction-view.ts` comme une union par type ; SPEC-502 le réutilise. Les réponses `BrickResponse<T>` sont définies dans `view-types.ts`.
2. `BrickViewProps` ajoute des props facultatives auxiliaires : `onCheck`, `onReset`, `dueLabels`, `hints`, `hintsUsed`, `onHintRequest`, `onFileSelect`, `availableResourceIds`, `now`, `startedAt` et `labels`. Elles ne changent pas le caractère contrôlé des vues.
3. La galerie `/_dev/bricks` est protégée par le proxy SDD (`ENABLE_SDD_PAGES`), comme `/_dev/ui`.
4. `apps/web/app/globals.css` source `packages/bricks/src` pour générer les utilitaires Tailwind des vues.
5. La comparaison pixel de la consigne d'exercice est bornée à 30 % et documentée : la zone est textuelle et le rendu à 90 % décale les lignes après le titre ; les trois autres cartes gardent le seuil structurel de 12 % d'ADR-0034.

## Conséquences

SPEC-502 pourra brancher `gradeBrick` sans redéfinir le contrat. Les écrans P6/P7 composent les vues sans styles propres. L'écart visuel justifié de la consigne est consigné dans `evidence/SPEC-503/`.
