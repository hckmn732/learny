# Learny · maquettes du mode simple « Dépose ton cours »

Proposition de conception du parcours décrit dans `docs/product/mode-simple.md` (décisions D1 à D7). Le web et le mobile (iOS et Android) suivent le même parcours, avec les mêmes fonctionnalités (D1). Les maquettes normatives de `design/maquettes/` et `design/app-mobile/` ne sont pas modifiées.

**Statut** : proposition, à valider avant l'ADR et les spécifications.

## Ouvrir

`index.html`, dans Chrome ou Edge, en `file://` ou servi en statique ; aucune dépendance. Polices Inter et Space Grotesk depuis Google Fonts.

- **Web / Mobile / Côte à côte** : le support affiché.
- **iOS / Android** : la plateforme du téléphone.
- **Sans clé d'IA** : l'état bloquant du dépôt (BR-IA-06).
- Les flèches gauche et droite parcourent les étapes. Lien direct : `index.html#step=3&view=both&plat=android` (`nokey=1` pour l'état sans clé).

## Les écrans

| # | Écran | Décisions | Interactions |
|---|---|---|---|
| 1 | Accueil : deux portes d'entrée | D2 | « Déposer mes fichiers » ouvre le dépôt |
| 2 | Dépôt : plusieurs fichiers, rôles, lien, motivation | D4, BR-IA-06 | Changer le rôle d'un fichier ; état sans clé |
| 3 | Analyse : progression et chapitres trouvés | §5 du cadrage | Chapitres qui apparaissent au fil de l'eau |
| 4 | Aperçu du programme : modules, pages sources, échéance | D6, D7 | Échéance oui ou non (le planning se recalcule) |
| 5 | Diagnostic global | D5 | Choix d'une réponse ; « Passer le diagnostic » |
| 6 | Résultat et premier chapitre prêt | D3, D5 | Préparation des modules suivants en tâche de fond |

Données de démonstration : Alex Perrin, mercredi 11 novembre 2026 ; un manuel de comptabilité générale de 712 pages, des TD corrigés et des annales (862 pages au total).
