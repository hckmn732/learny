---
id: SPEC-212
title: Recherche globale (service et API)
phase: P2
priority: V1
depends_on: [SPEC-112, SPEC-201]
business_rules: [BR-NAV-05]
screens: []
adrs: [ADR-0062]
visual: demo
---

# SPEC-212 — Recherche globale (service et API)

## 1. Objectif

Exposer `GET /api/v1/search?q=` : normaliser la requête, appeler la fonction SQL `search_user_content`, regrouper les résultats par type (notions, chapitres, formations), produire des extraits en texte brut avec positions de surlignage et des liens internes. L'interface de recherche (SPEC-307) ne fait qu'afficher cette réponse.

## 2. Contexte

SPEC-112 a livré `search_user_content(q, limit)` (`security invoker`, `simple` + `unaccent`, trigrammes) qui renvoie `{kind, id, title, snippet, href, rank}` pour les formations, notions et sections du cours courant de l'utilisateur. SPEC-307 consomme l'API dans l'en-tête et la page de résultats complète. Lire `docs/product/business-rules.md` BR-NAV-05, `docs/architecture/api.md` §1–§2, `docs/architecture/data-model.md` §11, ADR-0062 (Postgres FTS), ADR-0217 (format groupé, quotas, extraits, surlignage), ADR-0046 (routes en français pour les `href`), ADR-0213 (profils de débit).

## 3. Dépendances

- **SPEC-112** : fonction `search_user_content`, index GIN et trigrammes, exclusion des cours non courants et sections signalées.
- **SPEC-201** : `handler`, `defineRoute`, validation Zod de `query`, `problem+json`, profil de débit `default`.
- **SPEC-113** (transitive) : RLS des tables sources ; la fonction s'exécute avec le JWT de l'utilisateur (`userDb`).
- **SPEC-115** (transitive) : jeu de démonstration (formations, notions, cours) utilisé par les tests et la page SDD.
- **Externe** : aucune ; pas de moteur de recherche tiers (ADR-0062).

## 4. Règles métier couvertes

- **BR-NAV-05** : la recherche n'est lancée qu'à partir de 2 caractères après normalisation, est insensible à la casse et aux accents (normalisation serveur + `unaccent`), couvre notions, chapitres de cours et formations du seul utilisateur, renvoie des résultats groupés dans un ordre stable, et permet la page de résultats complète par un `limit` plus élevé.

## 5. Exigences fonctionnelles

- **EF-1** — `GET /api/v1/search?q=<texte>&limit=<n>` : `q` normalisée (NFKC, espaces multiples réduits, trim), longueur 2 à 100 caractères après normalisation ; `limit` par groupe 5 par défaut, de 1 à 20. Hors bornes → `400 VALIDATION_FAILED` avec message « Saisissez au moins 2 caractères. » ou « Recherche limitée à 100 caractères. ».
- **EF-2** — Réponse `200` : `{ query, groups: [{ kind, label, items: [{ id, title, snippet, highlights: [{ start, end }], href }], total }] }` ; ordre fixe des groupes : `notion` (« Notions »), `chapter` (« Chapitres »), `formation` (« Formations ») ; groupes vides omis ; aucun résultat → `groups: []`.
- **EF-3** — Dans chaque groupe, items triés par `rank` décroissant puis `id` croissant ; `total` = nombre de lignes de ce type renvoyées par la fonction (avant coupe à `limit`).
- **EF-4** — `snippet` : texte brut d'au plus 160 caractères centré sur la première correspondance, avec « … » aux coupures ; `highlights` : positions `[start, end[` des correspondances dans `snippet` (et dans `title` via `titleHighlights`), calculées sans casse ni accents. Aucun HTML n'est renvoyé.
- **EF-5** — `href` : chemins internes en français — notion → `/formations/<fid>/notions/<nid>`, chapitre → `/formations/<fid>/modules/<mid>/cours#<sectionId>`, formation → `/formations/<fid>/programme` — fournis par la fonction SQL et validés (chemin relatif commençant par `/`).
- **EF-6** — La page `/_dev/sdd/SPEC-212` propose un champ de recherche sur le jeu de démonstration, affiche la réponse groupée avec surlignage rendu par `<mark>`, et des requêtes d'exemple : « reseau » (sans accent), « RÉSEAU » (casse), « reseua » (faute), « a » (refusée), « ' OR 1=1 -- » (traitée comme texte).

## 6. Exigences techniques

- **ET-1** — Contrats Zod dans `packages/contracts/src/search.ts` (`SearchQuery`, `SearchResponse`) ; route `apps/web/app/api/v1/search/route.ts` (`auth: 'user'`, `rateLimit: 'default'`, `output` validé).
- **ET-2** — `packages/services/src/search/index.ts` exporte `searchUserContent(ctx, { q, limit }): Promise<Result<SearchResponse>>` ; il appelle la fonction SQL avec `limit = min(100, 3 × limit)` par paramètre lié (jamais concaténation), via `userDb` (RLS active).
- **ET-3** — `packages/services/src/search/normalize.ts` exporte `normalizeQuery(q)` et `fold(text)` (NFD, suppression des diacritiques, minuscules) ; `packages/services/src/search/highlight.ts` exporte `computeHighlights(text, query)` qui travaille sur le texte replié en conservant les positions du texte original (correspondance caractère à caractère après NFC).
- **ET-4** — Le `snippet` SQL est retraité côté service : suppression de toute balise résiduelle, Markdown aplati (titres, emphase, liens réduits à leur texte), puis coupe à 160 caractères. Un test vérifie qu'aucun `<` non échappé ne sort de l'API.
- **ET-5** — Journalisation : seule la longueur de `q` et le nombre de résultats sont journalisés ; jamais le texte de la requête.
- **ET-6** — Performance : p95 ≤ 150 ms sur le jeu de données substantiel de SPEC-112 (10 formations, 2 000 notions, 500 sections) en local, mesuré par le test d'intégration et consigné ; `EXPLAIN` montre l'usage des index GIN/trigramme.

## 7. Comportements attendus et cas limites

- **CL-1** — `q = "a"` ou `"  a  "` : `400`, aucune requête SQL exécutée.
- **CL-2** — `q = "Réseau"`, `"reseau"`, `"RESEAU"` : mêmes résultats et mêmes positions de surlignage relatives.
- **CL-3** — Faute de frappe courante (`"reseua"`) : résultats trouvés par trigrammes, rang inférieur aux correspondances exactes.
- **CL-4** — Texte correspondant exactement chez un autre utilisateur : aucun résultat (RLS), même `total`.
- **CL-5** — Caractères SQL ou guillemets : traités comme données, aucune erreur 500.
- **CL-6** — Section de cours d'une version antérieure ou signalée : absente.
- **CL-7** — Correspondance au-delà du 160ᵉ caractère d'une section longue : extrait recentré sur elle, « … » au début.
- **CL-8** — Requête d'emoji ou de caractères combinants : normalisée, pas d'exception, positions valides.
- **CL-9** — Plus de 100 caractères : `400`.

## 8. Instructions d'implémentation

1. Contrats Zod, `normalizeQuery`, `fold` et tests unitaires. Commit `feat(SPEC-212): normalise les requêtes de recherche`.
2. `computeHighlights` et nettoyage des extraits. Commit `feat(SPEC-212): extraits et surlignage`.
3. Service `searchUserContent` (appel SQL, regroupement, tri, quotas) et route API. Commit `feat(SPEC-212): API de recherche globale`.
4. Mesure de performance et contrôle `EXPLAIN` en intégration. Commit `test(SPEC-212): isolation et performance de la recherche`.
5. Page SDD, tests e2e et visuels. Commit `test(SPEC-212): démontre la recherche`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/search.ts`, `packages/services/src/search/{index,normalize,highlight}.ts`, `packages/services/src/search/search.test.ts`, `packages/services/test/integration/search.test.ts`, `apps/web/app/api/v1/search/route.ts`, `apps/web/components/sdd-demos/spec-212.tsx`, `apps/web/e2e/specs/p2/spec-212.spec.ts`.
- **Modifiés** : `packages/contracts/src/index.ts`, routes agrégées (`routes.ts`), registre SDD, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `search_user_content` et données de test (SPEC-112, SPEC-115), `handler` (SPEC-201), `userDb` (SPEC-101).

## 10. Interface et conformité visuelle

Mode `demo` : `/_dev/sdd/SPEC-212`, `h1` « SPEC-212 — Recherche globale (service et API) ». Régions :
1. « Requête » (`spec-212-query`) : champ `type="search"` étiqueté « Rechercher », bouton « Rechercher », puces des requêtes d'exemple.
2. « Résultats » (`spec-212-results`, `aria-live="polite"`) : un bloc par groupe avec titre (« Notions », « Chapitres », « Formations ») et `total`, items avec titre, extrait, `<mark>` sur les correspondances, `href` affiché ; message « Aucun résultat pour « {q} ». » si vide ; erreur de validation affichée en `role="alert"`.
3. « Réponse brute » (`spec-212-json`) : JSON formaté repliable.
Clavier, 390 px, jetons SPEC-301. Contrôles : jetons, ordre, axe, captures desktop/mobile ≤ 1 %.

## 11. Critères d'acceptation

- **CA-1** — Les requêtes de moins de 2 ou plus de 100 caractères normalisés sont refusées `400` sans appel SQL ; les autres renvoient la structure groupée dans l'ordre Notions, Chapitres, Formations.
- **CA-2** — Casse et accents n'influent pas sur les résultats ; une faute courante retrouve la notion attendue.
- **CA-3** — Aucun résultat d'un autre utilisateur, d'un cours non courant ou d'une section signalée ; aucune injection SQL possible.
- **CA-4** — Les extraits sont du texte brut ≤ 160 caractères, les positions de surlignage correspondent exactement aux occurrences, aucun HTML ne sort de l'API.
- **CA-5** — p95 ≤ 150 ms sur le jeu substantiel, index utilisés, texte de requête absent des journaux.
- **CA-6** — La page SDD démontre les requêtes d'exemple ; vidéo, axe et captures ≤ 1 %.

## 12. Plan de tests

- **Unitaires** — `packages/services/src/search/search.test.ts`, `describe('[SPEC-212] normalisation et surlignage')` : bornes de longueur, NFKC, repli des accents, positions de surlignage avec accents et combinants, nettoyage Markdown/HTML, coupe à 160 avec ellipses (CA-1, CA-2, CA-4).
- **Intégration** — `packages/services/test/integration/search.test.ts`, `describe('[SPEC-212] API de recherche')` : deux JWT avec contenus recoupés, cours ancien et section signalée, faute de frappe, chaîne d'injection, regroupement/tri/`total`, mesure p95 et `EXPLAIN`, journaux sans texte de requête (CA-1 à CA-5).
- **End-to-end** — `apps/web/e2e/specs/p2/spec-212.spec.ts`, `test('recherche groupée @SPEC-212')` : saisir « reseau », vérifier les groupes et `<mark>` ; « a » → alerte ; requête d'injection → résultat vide sans erreur ; vidéo (CA-6).
- **Visuel** — `test('recherche conforme @SPEC-212 @visual')` : régions, jetons, axe, captures ≤ 1 % (CA-6).
- **Non-régression** — `[SPEC-112]`, `[SPEC-113]`, `[SPEC-201]` / `@SPEC-201`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires bornes ; intégration structure |
| CA-2 | unitaires repli ; intégration faute de frappe |
| CA-3 | intégration isolation et injection |
| CA-4 | unitaires extraits/surlignage ; intégration absence de HTML |
| CA-5 | intégration performance et journaux |
| CA-6 | e2e et `@visual` |

## 13. Preuves attendues

`evidence/SPEC-212/` : rapports, réponses JSON des requêtes d'exemple, mesure p95 et plan `EXPLAIN`, test d'isolation à deux utilisateurs, vidéo, captures desktop/mobile, `checks.json`, `acceptance.md`. Uniquement des données du jeu de démonstration.

## 14. Définition de terminé

Validations communes de `docs/engineering/testing.md` §7 ; en plus : la route figure dans `docs/architecture/api.md` §2 et l'OpenAPI généré, et SPEC-307 peut consommer la réponse sans transformation autre que l'affichage.

## 15. Décisions et hypothèses

- ADR-0062 : recherche Postgres (`simple` + `unaccent`, trigrammes), sans moteur externe.
- ADR-0217 (créé pour cette spécification) : bornes de `q` et `limit`, format groupé et ordre fixe, quota SQL `3 × limit`, extraits de 160 caractères, positions de surlignage, absence de journalisation du texte.
- Hypothèse : les chemins `href` suivent les routes en français d'ADR-0046 ; si une route d'écran change dans une spécification ultérieure, la fonction SQL de SPEC-112 et ce contrat sont mis à jour ensemble.
