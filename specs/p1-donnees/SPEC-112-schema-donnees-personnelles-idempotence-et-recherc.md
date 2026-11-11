---
id: SPEC-112
title: Schéma données personnelles, idempotence et recherche
phase: P1
priority: V1
depends_on: [SPEC-105, SPEC-103]
business_rules: []
screens: []
adrs: [ADR-0044, ADR-0062, ADR-0120, ADR-0219]
visual: demo
---

# SPEC-112 — Schéma données personnelles, idempotence et recherche

## 1. Objectif

Créer les tables qui tracent exports, acceptations légales, clés d'idempotence et quotas d'API ; ajouter une recherche Postgres limitée au contenu de l'apprenant. Le schéma doit permettre aux services d'exécuter une mutation une fois et de chercher sans moteur externe ni fuite entre utilisateurs.

## 2. Contexte

`docs/architecture/data-model.md` §11–§12 fixe `data_exports`, `legal_acceptances`, `idempotency_keys`, `rate_limits` et `search_user_content`. ADR-0044 définit l'export ZIP et la suppression à J+30 ; ADR-0062 impose FTS `simple` + `unaccent` et trigrammes. Lire `docs/architecture/api.md` §1 (Idempotency-Key, erreurs), SPEC-103 (formations/notions), SPEC-105 (cours courants), SPEC-101 (migrations) et `docs/engineering/conventions.md` §7. Les services export/suppression, recherche et limitation sont livrés par SPEC-211, 212 et 208.

## 3. Dépendances

- **SPEC-105** : `courses`/`course_sections` courants pour l'index de recherche et les exports.
- **SPEC-103** : `formations.title` et `notions.label/short_definition`, liens de résultat et propriétaire.
- **SPEC-102** : `profiles` et identifiant de l'apprenant.
- **SPEC-101** : Drizzle, Supabase local, extensions `unaccent`/`pg_trgm`, transactions et tests RLS.

## 4. Règles métier couvertes

Aucune règle `BR-*` n'est directement attribuée. Ces tables soutiennent BR-ACC-02/10/11 (acceptation, export, suppression), BR-NAV-05 (recherche) et BR-PLA-08 (limitation) ; les services fonctionnels les réaliseront.

## 5. Exigences fonctionnelles

- **EF-1** — `data_exports` conserve propriétaire, état de job, chemin privé dans le bucket `exports`, expiration, taille et création ; un export expiré n'est plus téléchargeable même si la ligne subsiste pour audit jusqu'à purge.
- **EF-2** — `legal_acceptances` enregistre document `cgu|privacy`, version et `accepted_at` par utilisateur. Une nouvelle version crée une ligne nouvelle sans modifier l'acceptation précédente.
- **EF-3** — `idempotency_keys` utilise `(user_id,key)` comme clé primaire et conserve route, réponse JSON, code HTTP et création ; une même clé/requête rejouée pendant 24 h renvoie la réponse originale, une clé réutilisée pour une route ou un corps différent est refusée `422 IDEMPOTENCY_KEY_REUSED` par le wrapper de SPEC-201 (ADR-0120). La purge des clés de plus de 24 h est exercée par SPEC-208.
- **EF-4** — `rate_limits` conserve `bucket` unique, nombre de tokens et `updated_at` ; le seau par utilisateur ou IP est mis à jour atomiquement par SPEC-208, sans perdre des décréments concurrents.
- **EF-5** — `search_user_content(q, limit)` renvoie `{kind,id,title,snippet,href,rank}` pour les formations, notions et sections du cours courant seulement. La fonction applique le contexte utilisateur, `simple` + `unaccent`, puis la similarité trigramme pour une faute courante ; résultats triés par rang décroissant et ID stable.
- **EF-6** — Les extraits de recherche sont du texte brut avec marquage de correspondance séparé ou échappé par l'API ; aucun HTML de cours non assaini ne sort de la fonction. Une requête vide ne renvoie rien.
- **EF-7** — La page SDD montre une recherche déterministe parmi formation/notion/cours et les états d'un export, d'une acceptation et d'une clé d'idempotence factices sans exposer de contenu réel.

## 6. Exigences techniques

- **ET-1** — Colonnes de `data-model.md` §11–§12, FK vers `profiles`, `numeric` pour tokens du seau, timestamps UTC, index sur propriétaire/date d'expiration. `idempotency_keys` a `pk(user_id,key)`, `request_hash text not null` (SHA-256 de la méthode, du chemin du gabarit, des paramètres et du corps en JSON canonique, ADR-0120) et `completed_at timestamptz null` ; cette spécification crée ces colonnes, SPEC-201 n'ajoute aucune migration (ADR-0219).
- **ET-2** — `search_user_content` est `security invoker`, non `security definer`, et chaque branche de recherche applique les politiques RLS des tables sources. Le paramètre `limit` est borné entre 1 et 100 ; `q` est normalisée, trimée et bornée avant SQL.
- **ET-3** — Index GIN `to_tsvector('simple', unaccent(...))` ou stratégie équivalente compatible avec l'immuabilité des fonctions d'index ; index trigramme sur titres/labels. Le plan de requête d'un jeu de données de test substantiel est capturé sans fixer un temps absolu dépendant de la machine.
- **ET-4** — La fonction échappe `q` par paramètres SQL, jamais par concaténation ; le `snippet` est borné et ne contient pas de colonne privée d'autrui. Les cours non courants et sections signalées sont exclus.
- **ET-5** — RLS activée sur `data_exports`, `legal_acceptances` et `idempotency_keys` ; `rate_limits` est réservée au service API et n'est pas lisible depuis un client utilisateur. SPEC-113 audite les politiques et permissions.
- **ET-6** — Migration Drizzle copiée vers Supabase ; toute fonction SQL est versionnée dans la migration. Les tests de recherche utilisent deux JWT et des contenus dont les mots se recoupent pour détecter une fuite.

## 7. Comportements attendus et cas limites

- **CL-1** — Version de CGU acceptée deux fois : l'historique ne double pas la même version pour le même utilisateur/document.
- **CL-2** — Export expiré : URL non émise et état visible jusqu'à purge.
- **CL-3** — Idempotency-Key rejouée à l'identique : réponse et code originaux ; route/corps différents : 422 `IDEMPOTENCY_KEY_REUSED` ; traitement encore en cours : 409 `IDEMPOTENCY_IN_PROGRESS`.
- **CL-4** — Deux requêtes concurrentes du même seau : les deux consommations sont comptées atomiquement.
- **CL-5** — Recherche vide, accentuée ou avec faute : vide → zéro ; accent/typo → résultats pertinents du seul propriétaire.
- **CL-6** — Identifiant de formation d'un autre utilisateur dans un résultat potentiel : aucune ligne, même si le texte correspond exactement.
- **CL-7** — Cours ancienne version ou section signalée : exclu des résultats.
- **CL-8** — Requête contenant apostrophe ou caractères SQL : traitée comme donnée, aucune injection.

## 8. Instructions d'implémentation

1. Définir les quatre tables et contraintes, générer migration Drizzle/Supabase, activer RLS. Commit `feat(SPEC-112): crée export acceptations et quotas`.
2. Écrire la fonction de recherche et les index FTS/trigrammes, valider requête et limite. Commit `feat(SPEC-112): recherche le contenu privé`.
3. Ajouter repositories d'idempotence/expiration et tests de concurrence, pertinence et isolation. Commit `test(SPEC-112): vérifie recherche et idempotence`.
4. Créer page SDD et e2e/visuel, puis valider et renseigner les preuves.

## 9. Fichiers et composants concernés

- **Créés** : `packages/db/src/schema/privacy-search.ts`, `packages/db/src/schema/privacy-search.test.ts`, `packages/db/src/repositories/idempotency.ts`, `packages/db/src/repositories/search.ts`, `packages/db/migrations/NNNN_privacy_search.sql` et copie Supabase, `packages/db/test/integration/privacy-search.test.ts`, `apps/web/components/sdd-demos/spec-112.tsx`, `apps/web/e2e/specs/p1/spec-112.spec.ts`.
- **Modifiés** : `packages/db/src/schema/index.ts`, `packages/db/src/index.ts`, registre SDD et `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `formations`, `notions`, `course_sections`, `profiles` et extensions SPEC-008.

## 10. Interface et conformité visuelle

Mode `demo` : `/_dev/sdd/SPEC-112` affiche « Recherche privée », champ de requête prérempli, trois groupes de résultats avec snippets sûrs, puis cartes « Export », « Documents acceptés » et « Idempotence ». `data-testid` : `spec-112-search`, `spec-112-results`, `spec-112-export`, `spec-112-acceptance`, `spec-112-idempotency`. Les exemples sont des fixtures, pas des données personnelles du navigateur. Le champ a un label, les résultats un statut pour l'absence de correspondance. Tester jetons, structure, axe, captures desktop/mobile ≤ 1 %.

## 11. Critères d'acceptation

- **CA-1** — Les quatre tables et contraintes sont migrées ; historique légal et expiration d'export sont conservés.
- **CA-2** — Une clé d'idempotence rejouée rend la même réponse, une réutilisation incompatible est refusée et deux débits concurrents sont comptés.
- **CA-3** — Recherche accent/typo renvoie formation, notion et cours courant pertinents, sans HTML non sûr ni ancienne section signalée.
- **CA-4** — Un second utilisateur ne voit ni exports, ni acceptations, ni contenu de recherche d'autrui.
- **CA-5** — La page SDD présente recherche et données de contrôle, passe axe, vidéo et captures desktop/mobile.

## 12. Plan de tests

- **Unitaires** — `packages/db/src/schema/privacy-search.test.ts`, `describe('[SPEC-112] privacy search schema')` : versions, bornes, normalisation, sortie échappée et empreinte d'idempotence (`request_hash`) (CA-1 à CA-3).
- **Intégration** — `packages/db/test/integration/privacy-search.test.ts`, `describe('[SPEC-112] privacy search SQL')` : migrations, concurrence, FTS accent/typo, version de cours, deux JWT, plan d'index et RLS (CA-1 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p1/spec-112.spec.ts`, `test('inspecte la recherche privée @SPEC-112')` : rechercher une notion de fixture, vérifier groupe/snippet et absence de résultat d'autrui, vidéo (CA-5).
- **Visuel** — `test('recherche conforme @SPEC-112 @visual')` : jetons, structure, axe et captures ≤ 1 % (CA-5).
- **Non-régression** — `[SPEC-103]`, `[SPEC-105]` et tests RLS P1.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; intégration migration |
| CA-2 | intégration idempotence/concurrence |
| CA-3 | unitaires ; intégration FTS |
| CA-4 | intégration RLS |
| CA-5 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-112/` contient rapports, exemples de résultats anonymisés, plan d'index, cas d'idempotence et RLS, vidéo/captures, `checks.json` et `acceptance.md`.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent ; migrations copiées, RLS active, recherche bornée et privée, idempotence sans double écriture et aucune donnée réelle dans la démonstration.

## 15. Décisions et hypothèses

ADR-0044 fixe le format et l'expiration de l'export, ADR-0062 la recherche Postgres, ADR-0120 l'empreinte de requête et le rejeu concurrent des clés d'idempotence ; ADR-0219 tranche le conflit avec ADR-0206 (remplacée) et attribue la création des colonnes `request_hash` et `completed_at` à cette spécification. Les services de SPEC-208, 211 et 212 prendront la responsabilité des opérations métier ; cette spécification fixe le stockage et la fonction SQL.
