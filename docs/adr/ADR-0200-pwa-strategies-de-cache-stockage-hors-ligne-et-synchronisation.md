# ADR-0200 — PWA : stratégies de cache, stockage hors ligne et synchronisation

- **Statut** : Acceptée
- **Origine** : Déduite (décision déduite lors de la préparation du référentiel, sur la base des travaux existants et des standards)
- **Date** : 2026-11-11
- **Liens** : SPEC-801, ADR-0037

## Contexte

ADR-0037 fixe le principe (Serwist, IndexedDB, file d'attente rejouée, serveur qui fait foi) sans préciser les stratégies de cache, le contenu préchargé, le schéma de stockage, l'idempotence ni la résolution des conflits.

## Décision

- Un seul service worker (`apps/web/app/sw.ts`, Serwist) à la portée `/`, qui intègre aussi les gestionnaires Web Push. Précache : ressources statiques du build, `/hors-ligne`, `/hors-ligne/revisions`, icônes, polices. `CacheFirst` pour images (60 entrées, 30 j) et polices (20 entrées, 365 j). `NetworkOnly` pour `/api/**`, `/auth/**`, `/_dev/**` et Supabase. Navigations en `NetworkOnly` avec repli : `/formations/<uuid>/quiz-global` → `/hors-ligne/revisions`, sinon `/hors-ligne`. Aucune page HTML authentifiée ni réponse d'API n'est mise en cache.
- Paquet quotidien `GET /api/v1/offline/pack` : pour chaque formation active, la session de quiz global du jour (mode complet) et au plus 20 cartes de rappel des notions dues le lendemain ; valable jusqu'à la fin du lendemain local ; aucun appel IA.
- IndexedDB `learny-offline` v1 : magasins `meta`, `packs`, `progress`, `queue` ; purge à la déconnexion et au changement d'utilisateur.
- Synchronisation par lots de 50 vers `POST /api/v1/sync/offline-answers`, idempotente par `clientId` (UUID v4) grâce à la table `offline_sync_receipts` (purge à 30 jours). Réponses de plus de 7 jours rejetées (`EXPIRED`). Le serveur recorrige et recalcule FSRS ; une position déjà répondue côté serveur est un `conflict` sans effet ; une révision plus récente de la même notion prévaut sur l'état FSRS.
- La série est créditée au jour local de la réponse hors ligne.

## Conséquences

Pas de lecture hors ligne des autres écrans en V1 ; l'apprenant qui n'a pas ouvert Learny en ligne le jour même ne dispose que du paquet de la veille.
