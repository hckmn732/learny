# ADR-0272 — Pages système et layout d'authentification : frontière d'erreur, 404 selon session et panneau partagé

- **Statut** : Acceptée
- **Origine** : Déduite (pendant l'implémentation, sans sollicitation de l'utilisateur)
- **Date** : 2026-11-12
- **Liens** : SPEC-308, SPEC-006, SPEC-202, SPEC-303, SPEC-601, ADR-0034, ADR-0047, ADR-0268, ADR-0270

## Contexte

SPEC-308 compose les pages système minimales de SPEC-006 avec les composants de SPEC-303 et ajoute la mise en page d'authentification de SCR-01. Plusieurs points ne sont pas tranchés par la spécification : le nom de la prop de reprise fournie par Next, la source de l'identifiant de requête, le choix du lien principal d'une 404, la propriété des routes d'authentification avant SPEC-601 et la manière de tester la coquille `global-error`.

## Décision

- Les frontières d'erreur utilisent la prop `reset` de l'App Router et l'appellent exactement une fois par activation. `ErrorView` ne rend que l'identifiant de requête porté par un `AppError` ; il ne lit ni `message`, ni pile, ni `digest`, ni aucune propriété de l'erreur brute. `global-error` délègue à `GlobalErrorView`, qui fournit ses propres `html` et `body` et reste testable sans les imports de polices Next.
- La 404 lit la session côté serveur : l'action principale est « Se connecter » pour un visiteur anonyme et « Retour à l'accueil » pour un apprenant connecté. Le lien d'accueil reste toujours présent en secondaire afin que le texte et un lien utile subsistent sans JavaScript et que le contrat SPEC-006 reste satisfait. Le proxy protège `/acces-refuse` ; une session expirée repart vers `/connexion?suite=<chemin encodé>` et le retour n'est honoré que par `isSafeNextPath` (chemin local, sans `//`, sans contrôle).
- Le groupe de routes `(auth)` monte `AuthLayout` : panneau `aside[aria-label="Learny"]` sombre à gauche (base `23.75rem`, remplissage de 40 px maquette), colonne `main` claire à droite (base `35rem`). Le `flex-wrap` et les largeurs en `rem` reproduisent le 90 % de la maquette et empilent les deux zones à 390 px sans débordement. Le stepper est dérivé du chemin (`/inscription`, `/verifier-email`, `/connexion`, futurs `/premiers-pas/*`) par une fonction pure ; aucun menu connecté n'est monté.
- Les pages `/inscription`, `/connexion` et `/verifier-email` de cette spécification sont des coquilles de mise en page : titres, sous-titres, carte et liens de bascule sont livrés, tandis que SPEC-601 ajoute les formulaires, la validation et les mutations. Leurs lignes de base visuelles sont créées par SPEC-308 et seront remplacées par SPEC-601, qui en justifiera la mise à jour.
- La page `/hors-ligne` est publique et sans état client : le bouton « Réessayer » est un lien de rechargement, donc le texte et l'action restent disponibles sans JavaScript. Le `loading.tsx` racine utilise le même cadre (`PageHeader`, `Card`, `SkeletonGroup`) avec un `h1`, un statut annoncé et un lien de sortie.

## Conséquences

Les spécifications suivantes réutilisent `AuthLayout` et les vues système sans redéfinir de boutons, cartes ou titres. Toute page d'erreur ajoutée doit rester sûre par construction : seul un `AppError` porteur d'un `requestId` peut afficher une référence. La comparaison visuelle du panneau d'authentification se fait sur la région gauche de `SCR-01-base-desktop.png` (343 × 900), les pages système n'ayant pas de maquette. SPEC-601 remplacera le contenu des trois routes d'authentification en conservant le layout et mettra à jour les captures correspondantes.
