# ADR-0268 — Jetons de design : nommage, échelle de 1 px, thème Tailwind fermé et galerie /_dev/ui

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-301, SPEC-005, SPEC-006, ADR-0034, ADR-0059

## Contexte

SPEC-301 doit exposer les jetons des maquettes comme thème Tailwind 4 et vérifier automatiquement leur conformité à design/references/tokens.json. Ce fichier est un inventaire d'éléments clés : il ne contient que 15 couleurs observées, alors que EF-2 en définit 60, et il inclut des valeurs initiales du navigateur (#000000 sur body, rgba(0,0,0,0) en fond transparent, 13.3333px sur button). Une lecture littérale de ET-6 échouerait sur ces observations, non sur les jetons.

## Décision

Les couleurs de @learny/ui/tokens sont vérifiées contre l'union de design/references/tokens.json et des sources des maquettes (design/maquettes/*.dc.html et support.js), qui font foi. Les valeurs initiales du navigateur et la taille 13.3333px d'un bouton non stylé sont explicitement exclues de l'inventaire de référence ; les couleurs E de tokens.json doivent appartenir aux jetons, à dataPalette ou à ces valeurs par défaut. L'échelle d'espacement Tailwind vaut 1 px maquette (--spacing: 0.0625rem), les rayons sont nommés rounded-<px>, les tailles text-<px> (les décimales sont échappées dans les variables CSS, ex. --text-11\.5), et tous les espaces de noms couleur, texte, rayon, ombre et police sont réinitialisés. Les points de rupture et contours restent en px CSS. La galerie /_dev/ui est autorisée par le proxy SDD sous ENABLE_SDD_PAGES et /_dev/sdd/SPEC-301 répond 307 au niveau du proxy, avant le chargement streamé.

## Conséquences

Le test ET-6 est plus strict que la lecture littérale puisqu'il vérifie les 60 jetons contre les maquettes, tout en ignorant les valeurs par défaut du navigateur. Les écrans antérieurs à SPEC-301 voient leurs classes Tailwind d'espacement interprétées avec l'unité de 1 px maquette ; leurs lignes de base visuelles sont régénérées et justifiées dans evidence/SPEC-301.
