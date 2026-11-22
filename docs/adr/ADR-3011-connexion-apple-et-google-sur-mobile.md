# ADR-3011 — Connexion avec Apple et Google sur l'application mobile

- **Statut** : Acceptée — étend ADR-0007 pour le client mobile uniquement
- **Origine** : Déduite (préparation de la piste mobile, d'après la maquette `design/app-mobile/`)
- **Date** : 2026-11-22
- **Liens** : ADR-0007, ADR-0121, ADR-3006, ADR-3008, SPEC-3402

## Contexte

ADR-0007 fixe deux méthodes de connexion : lien magique et e-mail + mot de passe. La maquette
mobile propose aussi « Continuer avec Apple » et « Continuer avec Google », attendus sur
smartphone. Les règles de l'App Store imposent Apple dès qu'un fournisseur tiers est proposé
(ADR-3006 §3). Supabase Auth gère ces fournisseurs par `signInWithIdToken` sans route d'API
nouvelle.

## Décision

1. Sur l'application mobile seulement, Apple et Google s'ajoutent au lien magique et au mot de
   passe, livrés par SPEC-3402, toujours ensemble.
2. Les comptes créés par ces fournisseurs suivent les mêmes règles que les autres : acceptation
   des CGU (BR-ACC-02), onboarding sur le web (ADR-3002), suppression et export identiques.
3. Le web n'est pas modifié ; l'extension au web exigerait un ADR de la piste concernée.
4. Les fournisseurs sont désactivés par défaut dans la configuration Supabase locale et activés
   seulement dans l'environnement de test mobile et dans le projet hébergé une fois les
   identifiants fournis par le porteur.

## Conséquences

- Un utilisateur inscrit par Apple sur mobile se connecte au web par lien magique (même e-mail) ;
  l'e-mail relais Apple reste valable.
