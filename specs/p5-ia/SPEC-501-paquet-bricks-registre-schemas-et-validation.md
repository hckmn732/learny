---
id: SPEC-501
title: Paquet bricks : registre, schémas et validation
phase: P5
priority: V1
depends_on: [SPEC-106]
business_rules: [BR-BRI-01, BR-BRI-02, BR-BRI-03, BR-BRI-04, BR-BRI-05, BR-BRI-06, BR-BRI-07, BR-IA-11]
screens: []
adrs: [ADR-0021, ADR-0027, ADR-0150, ADR-0151]
visual: demo
---

# SPEC-501 — Paquet bricks : registre, schémas et validation

## 1. Objectif

Livrer `@learny/bricks` (registre des 13 types, schémas Zod normatifs, règles de validation communes, normalisation et empreinte, charge publique sans réponses) et le service applicatif `packages/services/src/bricks` (création, versionnement, signalement et correction par l'apprenant) avec ses deux routes d'API. C'est le contrat unique que le tuteur (SPEC-508), la correction (SPEC-502), le rendu (SPEC-503), la qualification (SPEC-506) et les banques (SPEC-513) utilisent.

## 2. Contexte

- Principe : « le modèle propose, le code valide » (ADR-0021) ; toute brique produite par un modèle passe par `validateBrick` avant persistance (BR-IA-11).
- Lire : `docs/product/business-rules.md` (BRI, MEM-07/09, COU-09/10), `docs/architecture/data-model.md` §5 (tables `bricks`, `brick_versions`, `brick_reports`), `docs/architecture/overview.md` §3 (frontières : `bricks` n'importe que `core`, `contracts`, `ui`), `docs/legacy/specification-v0/2-Catalogue-de-briques.md` (champs obligatoires, règles communes), ADR-0027, ADR-0150, ADR-0151.
- Maquettes servant à fixer les champs : `design/maquettes/Quiz.dc.html` (choix unique, texte à trous, association), `QuizGlobal.dc.html` (carte de rappel, association, remise en ordre, classement, texte à trous), `Exercice.dc.html` (consigne avec tableau), `ExamenBlanc.dc.html` (minuteur, barème).

## 3. Dépendances

- **SPEC-106** : tables `bricks`, `brick_versions`, `brick_reports`, énumérations `brick_type`, `brick_purpose`, `brick_status`, `content_origin`, `actor`, `report_status`. Utilisées telles quelles ; aucune migration nouvelle.
- Socle déjà livré par les phases précédentes (CP-4 réussi) : `@learny/core` (`Result`, `AppError`, `clock`, `logger`), `@learny/contracts`, `@learny/db` (`userDb`, `serviceDb`, `withRollback`), wrapper `handler()` (SPEC-201), fabriques `@learny/testing` et jeu de démonstration (SPEC-115), pages `/_dev/sdd/[specId]` (SPEC-006).
- Bibliothèques : `zod` (version du socle, ADR-0003), `node:crypto` (SHA-256). Aucun service externe.

## 4. Règles métier couvertes

- **BR-BRI-01** : `BRICK_TYPES` liste exactement les 13 types de l'énumération `brick_type` ; le registre `brickRegistry` a une entrée par type ; un test échoue si un type n'est pas enregistré (« un nouveau type demande du code »).
- **BR-BRI-02** : un schéma Zod par type avec champs obligatoires et bornes (§6, ET-3) ; question à choix : 2 à 6 options, au moins une juste.
- **BR-BRI-03** : `notionIds` doit contenir au moins une notion existante de la formation pour tous les types sauf `timer` et `scoring` (code `NOTION_REQUIRED`, `NOTION_NOT_FOUND`).
- **BR-BRI-04** : `origin` obligatoire (`resource` | `tutor`) ; `origin = 'resource'` exige au moins une entrée `sources` ; `resource_excerpt` impose `origin = 'resource'` ; `timer`/`scoring` imposent `tutor`.
- **BR-BRI-05** : toute référence (notion, ressource, passage, brique) est vérifiée par un `BrickReferenceResolver` limité à l'utilisateur courant et à sa formation (RLS + filtre explicite).
- **BR-BRI-06** : une modification crée une ligne `brick_versions` (version + 1) ; les réponses (`answers.brick_version_id`) restent liées à l'ancienne version ; aucune mise à jour en place d'une charge.
- **BR-BRI-07** : chaque distracteur (`correct = false`) porte `notionId` ; empreinte SHA-256 calculée selon ADR-0151 et stockée dans `brick_versions.fingerprint`.
- **BR-IA-11** : `validateBrick` renvoie une liste d'erreurs lisibles par un modèle (anglais, chemin JSON) que la boucle du tuteur (SPEC-508) renvoie au plus 2 fois.

## 5. Exigences fonctionnelles

- **EF-1** — Création : `createBrick` valide puis insère `bricks` (statut `active`, `current_version = 1`) et `brick_versions` (version 1) dans une transaction ; renvoie `{ brickId, versionId, version: 1, fingerprint }`.
- **EF-2** — Versionnement : `createBrickVersion` exige `expectedVersion` égal à `bricks.current_version` (sinon `CONFLICT` 409), valide la nouvelle charge, insère la version suivante et met à jour `current_version`.
- **EF-3** — Signalement : `POST /api/v1/bricks/:bid/report` avec `{ reason }` (1 à 500 caractères) crée un `brick_reports` (`open`, version courante) et passe la brique en `reported` ; elle est alors exclue des tirages (filtre `status = 'active'` exposé par `activeBricksFilter`). Réponse `201 { reportId, status: 'open' }`. Un second signalement ouvert du même utilisateur sur la même brique renvoie `200` avec le signalement existant (idempotent).
- **EF-4** — Correction par l'apprenant : `PATCH /api/v1/bricks/:bid` avec `{ expectedVersion, payload }` ; mêmes règles de format que le tuteur ; crée une version `created_by = 'learner'`, `origin` inchangée ; tous les signalements `open` de la brique passent `corrected` (`resolution = { by: 'learner', versionId }`, `resolved_at = clock.now()`) et la brique repasse `active`. Réponse `200 { brickId, version, versionId }`.
- **EF-5** — Correction par le tuteur : même effet via `createBrickVersion(..., { createdBy: 'tutor' })` (résolution `{ by: 'tutor', versionId }`).
- **EF-6** — Charge publique : `toPublicBrick(versionRow)` renvoie `{ brickId, versionId, type, notionIds, publicPayload }` selon ADR-0150 ; elle est la seule forme envoyée au navigateur avant correction.
- **EF-7** — Erreurs API : `404 NOT_FOUND` (brique inexistante ou d'un autre utilisateur), `409 CONFLICT` (version obsolète), `422 BRICK_INVALID` avec `errors: [{ code, path, message }]`, `422 BRICK_RETIRED` si statut `retired`.

## 6. Exigences techniques

**ET-1 — Registre** (`packages/bricks/src/registry.ts`) :
```ts
export const BRICK_TYPES = ['text','resource_excerpt','choice_question','open_question','cloze','matching','ordering','categorization','recall_card','instruction','scripted_dialogue','timer','scoring'] as const;
export type BrickType = (typeof BRICK_TYPES)[number];
export interface BrickDefinition<T extends BrickType> {
  type: T; schema: z.ZodType<BrickPayload<T>>; isQuestion: boolean; requiresNotion: boolean;
  gradedBy: 'code' | 'tutor' | 'none';
  canonicalAnswer?: (p: BrickPayload<T>) => string; stem?: (p: BrickPayload<T>) => string;
  crossCheck: (p: BrickPayload<T>) => BrickIssue[];            // règles internes (§ET-4)
  references: (p: BrickPayload<T>) => BrickRefs;               // ids à vérifier
  toPublic: (p: BrickPayload<T>, seed: string) => PublicPayload<T>;
}
export const brickRegistry: { [K in BrickType]: BrickDefinition<K> };
```
`gradedBy` : `code` pour `choice_question`, `cloze`, `matching`, `ordering`, `categorization`, `timer`, `recall_card` (auto-évaluation convertie par le code) ; `tutor` pour `open_question`, `instruction`, `scripted_dialogue` ; `none` pour `text`, `resource_excerpt`, `scoring`.

**ET-2 — Champs communs** (`common.ts`) : `uuid = z.string().uuid()` ; `sourceRef = z.object({ chunkId: uuid, quote: z.string().min(1).max(300).optional() }).strict()` ; chaque schéma de type est `.strict()` et inclut `sources: z.array(sourceRef).max(10).default([])`. Brouillon soumis à la validation :
```ts
export const brickDraftSchema = z.object({
  type: z.enum(BRICK_TYPES), formationId: uuid,
  purpose: z.enum(['course','validation','bank','remediation','exercise','exam','warmup','review']),
  notionIds: z.array(uuid).max(10), origin: z.enum(['resource','tutor']), payload: z.unknown(),
}).strict();
```
Textes : toutes les chaînes sont `trim()`ées avant validation ; une chaîne vide après `trim` est invalide.

**ET-3 — Schémas par type** (bornes en caractères sauf mention) :
- `text` : `title?` 1..120 ; `bodyMd` 1..20000 (Markdown GFM, sans HTML brut — balise `<` suivie d'une lettre refusée, code `HTML_NOT_ALLOWED`).
- `resource_excerpt` : `resourceId` uuid ; `chunkId` uuid | null ; `location` `{ page?: int ≥ 1, startSec?: ≥ 0, endSec?: ≥ startSec, anchor?: 1..200, charStart?: int ≥ 0, charEnd?: int > charStart }` avec au moins une clé ; `quote` 1..1000 ; `label` 1..80 (ex. « Guide FI, p. 4 »).
- `choice_question` : `stem` 3..600 ; `mode` `single|multiple` ; `options` 2..6 de `{ id: /^[a-z0-9]{1,8}$/, text 1..200, correct: boolean, notionId: uuid | null, rationale?: 1..300 }` ; `explanation` 10..1200 ; `objective` 3..200.
- `open_question` : `stem` 3..600 ; `expectedElements` 1..8 × (2..200) ; `criteria` 1..6 × `{ key: /^[a-z0-9_]{1,32}$/, label 2..120, points int 1..10, description 0..300 }` ; `answerMaxChars` int 50..4000 (défaut 1500) ; `modelAnswer` 10..2000 ; `explanation` 10..1200 ; `objective` 3..200.
- `cloze` : `template` 10..1000 contenant des jetons `{{n}}` ; `gaps` 1..10 × `{ id: int 1..10, answers: 1..10 × (1..60), hint?: 1..60 }` ; `explanation` 10..1200. Comparaison toujours insensible à la casse et aux accents (BR-MEM-05) : aucun champ de sensibilité.
- `matching` : `instruction` 3..300 ; `pairs` 2..8 × `{ id, left 1..120, right 1..200, notionId: uuid }` ; `extraRights` 0..3 × (1..200) ; `explanation` 10..1200.
- `ordering` : `instruction` 3..300 ; `items` 3..10 × `{ id, text 1..160 }` **dans l'ordre correct** ; `explanation` 10..1200.
- `categorization` : `instruction` 3..300 ; `categories` 2..4 × `{ id, label 1..60, notionId: uuid | null }` ; `items` 4..12 × `{ id, text 1..120, categoryId }` ; `explanation` 10..1200.
- `recall_card` : `front` 3..300 ; `back` 1..600 ; `sourceLabel?` 1..120 ; `mnemonic?` 1..200.
- `instruction` (ADR-0027, ADR-0150) : `title` 3..120 ; `taskMd` 10..4000 ; `data` 0..8 × (1..80) ; `deliverable` 3..300 ; `production` union discriminée sur `kind` :
  - `text` `{ minChars: 0..2000 (défaut 0), maxChars: 50..10000 }` ;
  - `file` `{ accept: 1..6 types MIME parmi application/pdf, image/png, image/jpeg, image/webp, text/plain, text/markdown, maxSizeMb: 1..50 }` ;
  - `link` `{}` ;
  - `table` `{ fields: 0..4 × column, columns: 1..8 × column, minRows: 1..20, maxRows: minRows..50, initialRows: minRows..maxRows, checks: 0..3 × check }` avec `column = { key: /^[a-z][a-z0-9_]{0,31}$/, label 1..60, type: 'text'|'number'|'select', options?: 1..20 × { value 1..40, label 1..80 } (obligatoire si select, interdit sinon) }` et `check = { type: 'sum_equal', numberColumn, groupColumn, left: 1..10 valeurs, right: 1..10 valeurs, leftLabel?: 1..20, rightLabel?: 1..20, sideColumnLabel?: 1..20 }`.
  - `explanationPrompt` 3..300 | null ; `hints` 0..2 × (5..400) ; `criteria` 1..8 × `{ key, label 2..120, points int 1..10, description 2..400 }` ; `estimatedMinutes` int 5..120 ; `passPoints` int 1..10 (défaut 8).
- `scripted_dialogue` : `role` 3..120 ; `context` 10..1500 ; `learnerGoal` 10..400 ; `endCondition` 10..300 ; `openingLine` 1..600 ; `maxTurns` int 4..30 (défaut 12) ; `criteria` 1..6 (même forme que `open_question`).
- `timer` : `durationSec` int 30..14400 ; `scope` `activity|items` ; `itemBrickIds` 1..100 uuid (obligatoire si `items`, interdit sinon) ; `warnAtSec` int 0..durationSec (défaut 300) ; `autoSubmit` boolean (défaut true).
- `scoring` : `total` int 1..100 ; `threshold` number 0..total ; `mode` `equal|weighted` ; `weights` 1..100 × `{ brickId: uuid, points > 0 }` (obligatoire si `weighted`) ; `display` `percent|points`.

**ET-4 — Règles internes** (`crossCheck`, codes `BrickIssueCode`) : `CHOICE_NO_CORRECT` ; `CHOICE_SINGLE_NEEDS_ONE` (mode `single` et ≠ 1 juste) ; `CHOICE_ALL_CORRECT` (aucune option fausse) ; `DISTRACTOR_NOTION_MISSING` (option fausse sans `notionId`) ; `DUPLICATE_OPTION` (textes normalisés identiques) ; `DUPLICATE_ID` ; `CLOZE_GAP_MISMATCH` (jetons ≠ ids, ids non consécutifs depuis 1, jeton répété) ; `CLOZE_ANSWER_LEAK` (une première réponse normalisée apparaît dans le texte hors trous) ; `MATCHING_DUPLICATE` (gauches ou droites normalisées en double, y compris `extraRights`) ; `ORDERING_DUPLICATE` ; `CATEGORY_EMPTY` ; `CATEGORY_UNKNOWN` ; `CRITERIA_POINTS_MISMATCH` (`instruction` : Σ points ≠ 10 ; `open_question`/`scripted_dialogue` : Σ points hors 1..20) ; `TABLE_CHECK_COLUMN_UNKNOWN` (colonne inconnue ou `numberColumn` non `number`) ; `TABLE_OPTIONS_INVALID` ; `SCORING_SUM_MISMATCH` (Σ poids ≠ `total`) ; `TIMER_SCOPE_INVALID` ; `HTML_NOT_ALLOWED`.

**ET-5 — Validation complète** (`validate.ts`) :
```ts
export interface BrickReferenceResolver {
  existingNotionIds(formationId: string, ids: string[]): Promise<Set<string>>;
  chunks(ids: string[]): Promise<Map<string, { resourceId: string }>>;
  resources(ids: string[]): Promise<Map<string, { kind: ResourceKind; pages: number | null; durationSec: number | null; deleted: boolean }>>;
  existingBrickIds(formationId: string, ids: string[]): Promise<Set<string>>;
}
export async function validateBrick(draft: unknown, resolver: BrickReferenceResolver): Promise<Result<ValidBrick, BrickIssue[]>>;
export function parseBrickPayload<T extends BrickType>(type: T, payload: unknown): Result<BrickPayload<T>, BrickIssue[]>;
```
Ordre : (1) `brickDraftSchema` ; (2) schéma du type (erreurs Zod converties en `SCHEMA_INVALID` avec `path` et message Zod en anglais) ; (3) `crossCheck` ; (4) règles communes : `NOTION_REQUIRED`, `ORIGIN_INVALID`, `SOURCES_REQUIRED` ; (5) références : `NOTION_NOT_FOUND` (notionIds, `notionId` des options, paires, catégories), `SOURCE_NOT_FOUND`, `RESOURCE_NOT_FOUND` (ressource absente ou supprimée), `CHUNK_RESOURCE_MISMATCH`, `LOCATION_INVALID` (pdf → `page` ≤ `pages` ; youtube/audio/video → `startSec` ≤ `durationSec` ; web → `anchor` ou `charStart` ; note/image → `charStart`), `BRICK_REF_NOT_FOUND` (timer, scoring). Les étapes 3 à 5 ne s'exécutent que si 1 et 2 réussissent ; toutes les erreurs d'une étape sont renvoyées ensemble. `ValidBrick` contient la charge normalisée (valeurs par défaut appliquées) et `fingerprint: string | null`.

**ET-6 — Empreinte** (`fingerprint.ts`, ADR-0151) — `canonicalAnswer` : choix → textes normalisés des options justes triés, joints `|` ; ouverte → `expectedElements` normalisés triés ; trous → première réponse de chaque trou dans l'ordre des ids ; association → `left=>right` normalisés triés ; remise en ordre → textes dans l'ordre correct ; classement → `item=>catégorie` triés ; carte → `back`. `stem` : `stem`, `template`, `instruction` + gauches triées (association), `instruction` + textes triés (remise en ordre, classement), `front`.

**ET-7 — Charge publique** (`toPublic`, graine = `versionId`, mélange Fisher-Yates avec générateur `mulberry32(hash32(seed))`) : choix → options `{ id, text }` (ordre conservé), `mode`, `stem`, `objective` omis ; ouverte → `stem`, `answerMaxChars`, `criteria[{label, points}]` ; trous → `template` et `gaps[{ id, hint? }]` ; association → gauches dans l'ordre, droites (paires + `extraRights`) mélangées avec ids opaques `r1..rn` ; remise en ordre → items mélangés (si le mélange redonne l'ordre correct, rotation d'un cran) ; classement → catégories `{ id, label }` et items mélangés sans `categoryId` ; carte → tout ; consigne → tout sauf `criteria[].description` et `hints` (remplacés par `hintsCount`) ; dialogue → `role`, `context`, `learnerGoal`, `openingLine`, `maxTurns` ; texte, extrait, minuteur, barème → tout. Les correspondances d'ids opaques sont recalculables côté serveur à partir de la même graine.

**ET-8 — Service** (`packages/services/src/bricks/brick-service.ts`, client `userDb(ctx)`, transactions Drizzle) :
```ts
createBrick(ctx, input: BrickDraft & { createdBy: 'tutor'|'learner'|'import' }): Promise<Result<CreatedBrick, AppError>>;
createBrickVersion(ctx, brickId, input: { payload: unknown; expectedVersion: number; createdBy: 'tutor'|'learner' }): Promise<Result<CreatedVersion, AppError>>;
reportBrick(ctx, brickId, input: { reason: string }): Promise<Result<{ reportId: string; status: 'open' }, AppError>>;
correctBrick(ctx, brickId, input: { payload: unknown; expectedVersion: number }): Promise<Result<CreatedVersion, AppError>>;
retireBrick(ctx, brickId): Promise<Result<void, AppError>>;
getPublicBrick(ctx, versionId): Promise<Result<PublicBrick, AppError>>;
export const activeBricksFilter: SQL; // bricks.status = 'active'
```
`DbBrickReferenceResolver` (`reference-resolver.ts`) implémente ET-5 avec des requêtes `in (...)` filtrées par `formation_id` et `owner_id = ctx.userId`. Codes d'erreur ajoutés à `packages/core/src/errors.ts` : `BRICK_INVALID` (422), `BRICK_RETIRED` (422).

**ET-9 — API** (`packages/contracts/src/bricks.ts`, routes `apps/web/app/api/v1/bricks/[bid]/route.ts` (PATCH) et `.../report/route.ts` (POST)) via `handler()` ; POST avec `Idempotency-Key` obligatoire ; limitation par défaut (120/min). Mettre à jour `docs/architecture/api.md` (ligne existante, aucune route nouvelle).

**ET-10 — Performance** : `validateBrick` d'une brique sans références < 2 ms (p95 sur 1 000 exécutions en test unitaire) ; résolution des références en au plus 4 requêtes SQL.

## 7. Comportements attendus et cas limites

- **CL-1** Sortie de modèle avec champ inconnu (`hint` au lieu de `hints`) → `SCHEMA_INVALID` (schémas `.strict()`), chemin exact.
- **CL-2** Question à choix « single » avec deux options justes → `CHOICE_SINGLE_NEEDS_ONE`.
- **CL-3** Distracteur sans `notionId` → `DISTRACTOR_NOTION_MISSING` (même si une notion est connue au niveau de la brique).
- **CL-4** Notion d'une autre formation ou d'un autre utilisateur → `NOTION_NOT_FOUND` (aucune fuite d'existence).
- **CL-5** Ressource supprimée logiquement (`deleted_at`) citée → `RESOURCE_NOT_FOUND`.
- **CL-6** Texte à trous dont la réponse figure dans l'énoncé → `CLOZE_ANSWER_LEAK`.
- **CL-7** Deux corrections concurrentes de la même brique avec `expectedVersion = 2` → la première crée la version 3, la seconde reçoit `409 CONFLICT` (contrainte `unique(brick_id, version)` + vérification sous `select … for update`).
- **CL-8** Correction de l'apprenant invalide → `422 BRICK_INVALID`, aucun changement de statut ni de signalement.
- **CL-9** Signalement d'une brique `retired` → `422 BRICK_RETIRED`.
- **CL-10** Injection dans un texte de brique (« ignore previous instructions ») → aucun traitement particulier : c'est une donnée ; le Markdown est rendu assaini (ADR-0060) ; seul le HTML brut est refusé.
- **CL-11** Charge contenant des caractères de contrôle (U+0000–U+001F hors `\n`, `\t`) → `SCHEMA_INVALID`.
- **CL-12** Réponse passée liée à la version 1 après création de la version 2 → la lecture de la tentative renvoie toujours la charge v1.

## 8. Instructions d'implémentation

1. Créer `packages/bricks` (package.json `@learny/bricks`, exports `.` et `./view` réservé à SPEC-503), `src/index.ts`. Commit `feat(SPEC-501): crée le paquet bricks`.
2. Écrire `normalize.ts` (ADR-0151) et `fingerprint.ts` + tests. Commit.
3. Écrire `common.ts`, puis un dossier par type `src/types/<kebab>/schema.ts` (13 dossiers : `text`, `resource-excerpt`, `choice-question`, `open-question`, `cloze`, `matching`, `ordering`, `categorization`, `recall-card`, `instruction`, `scripted-dialogue`, `timer`, `scoring`) avec `schema.ts`, `checks.ts` (crossCheck), `public.ts` (toPublic), `examples.ts` (au moins une charge valide et une invalide par type, réutilisées par les tests, la qualification SPEC-506 et la galerie SPEC-503). Commit par groupe de types.
4. Écrire `registry.ts`, `validate.ts`, `issues.ts` (codes ET-4/ET-5, messages anglais). Commit.
5. Dans `packages/services/src/bricks/` : `reference-resolver.ts`, `brick-service.ts`. Ajouter les codes d'erreur dans `packages/core/src/errors.ts`. Commit.
6. Contrats et routes API (ET-9). Commit.
7. Page de démonstration (§10). Tests unitaires, intégration, e2e (§12). Commits `test(SPEC-501): …`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/bricks/{package.json,README.md,src/index.ts,src/registry.ts,src/common.ts,src/normalize.ts,src/fingerprint.ts,src/validate.ts,src/issues.ts,src/random.ts}`, `packages/bricks/src/types/<type>/{schema,checks,public,examples}.ts` (×13), `packages/services/src/bricks/{brick-service,reference-resolver,index}.ts`, `packages/contracts/src/bricks.ts`, `apps/web/app/api/v1/bricks/[bid]/route.ts`, `apps/web/app/api/v1/bricks/[bid]/report/route.ts`, `apps/web/app/_dev/sdd/_demos/spec-501.tsx`, tests listés en §12.
- **Modifiés** : `packages/core/src/errors.ts` (codes), `packages/services/src/index.ts` (export), `apps/web/app/_dev/sdd` (enregistrement de la démonstration), `docs/architecture/api.md` (précision des codes de réponse de la ligne « Signalement / correction »), `eslint` (frontière `bricks` déjà prévue).
- **Lus** : schéma Drizzle de SPEC-106, fabriques `@learny/testing`.

## 10. Interface et conformité visuelle

Mode `demo` (ADR-0049). Page `/_dev/sdd/SPEC-501` (titre « SPEC-501 · Briques : schémas et validation »), composée avec `@learny/ui` :
- Sélecteur `data-testid="brick-type-select"` (13 types) ; zone JSON `data-testid="brick-json"` préremplie avec l'exemple valide du type ; boutons « Charger l'exemple invalide » (`brick-load-invalid`) et « Valider » (`brick-validate`).
- Résultat `data-testid="brick-result"` : « Valide » + empreinte (`brick-fingerprint`) ou liste des erreurs `data-testid="brick-issue"` (code, chemin, message).
- Section « Cycle de vie » sur une brique créée pour l'utilisateur de démonstration : boutons « Créer » (`brick-create`), « Signaler » (`brick-report`), « Corriger » (`brick-correct`), tableau des versions (`brick-versions`) et statut (`brick-status`).
- Section « Charge publique » (`brick-public`) montrant la charge envoyée au navigateur.
- États : chargement (Skeleton), erreur (ErrorState). Accessibilité : libellés associés, `aria-live="polite"` sur le résultat.
- Contrôles visuels : jetons (Button citron/noir, Card rayon 24 px), structure (présence et ordre des sections ci-dessus), non-régression `toHaveScreenshot` (`maxDiffPixelRatio: 0.01`).

## 11. Critères d'acceptation

- **CA-1** Les 13 types sont enregistrés ; pour chacun, l'exemple valide passe et l'exemple invalide échoue avec le code attendu (13 × 2 cas).
- **CA-2** Les 28 codes d’erreur d'ET-4/ET-5 sont chacun produits par au moins un cas de test.
- **CA-3** L'empreinte est identique pour deux énoncés ne différant que par casse, accents, espaces, apostrophes typographiques et ponctuation finale, et différente si la bonne réponse change.
- **CA-4** La charge publique d'aucun type ne contient `correct`, `answers`, `expectedElements`, `modelAnswer`, `categoryId`, ni `hints` (test sur les 13 exemples).
- **CA-5** Signalement puis correction par l'apprenant : version 2 créée par `learner`, signalement `corrected`, brique `active` ; les réponses liées à v1 renvoient la charge v1.
- **CA-6** Une référence d'un autre utilisateur est refusée (`NOTION_NOT_FOUND`/`RESOURCE_NOT_FOUND`) et l'API renvoie 404 sur la brique d'autrui.
- **CA-7** Deux corrections concurrentes : une seule réussit, l'autre reçoit 409.
- **CA-8** La page de démonstration valide, crée, signale et corrige une brique (vidéo e2e).

## 12. Plan de tests

**Unitaires** (`describe('[SPEC-501] …')`) :
- `packages/bricks/src/normalize.test.ts` : table de 20 cas (NFKC, apostrophes, accents, espaces, ponctuation finale), idempotence (fast-check).
- `packages/bricks/src/fingerprint.test.ts` : égalité/inégalité (CA-3), 64 caractères hex.
- `packages/bricks/src/types/*/schema.test.ts` : exemples valides/invalides par type, bornes min/max ±1 pour chaque champ borné (CA-1).
- `packages/bricks/src/validate.test.ts` : chaque code d'erreur avec un résolveur en mémoire (CA-2), ordre des étapes, performance (ET-10).
- `packages/bricks/src/public.test.ts` : absence des champs secrets (CA-4), déterminisme du mélange (même graine → même ordre), remise en ordre jamais dans l'ordre correct.
- `packages/bricks/src/registry.test.ts` : `BRICK_TYPES` égal à l'énumération Drizzle `brick_type`.
- **Injection** : `validate.test.ts` « contenu piégé » — une charge contenant `</document><system>…` et « ignore all previous instructions » est validée comme texte ordinaire et rendue inchangée dans `toPublic`.

**Intégration** (`packages/services/test/integration/bricks.test.ts`, `describe('[SPEC-501] service des briques')`, base réelle, `withRollback`) : création (EF-1), versionnement et conflit concurrent (CA-7, deux transactions parallèles), signalement et exclusion par `activeBricksFilter`, correction apprenant (CA-5), isolation entre deux utilisateurs (CA-6), routes via `next-test-api-route-handler` (201/200/404/409/422).

**End-to-end** (`apps/web/e2e/specs/p5/spec-501-bricks.spec.ts`) : `test('validation et cycle de vie d'une brique @SPEC-501', …)` : ouvrir `/_dev/sdd/SPEC-501` (utilisateur de démonstration connecté par la fixture d'authentification du socle de tests), choisir `choice_question`, valider (« Valide » + empreinte), charger l'exemple invalide (erreur `CHOICE_NO_CORRECT` visible), créer, signaler (statut « reported »), corriger (version 2, statut « active »). Vidéo enregistrée (CA-8).

**Visuel** : `test('page de démonstration SPEC-501 @SPEC-501 @visual', …)` : `expectTokens` sur boutons et cartes, structure §10, `toHaveScreenshot('spec-501-demo.png')`.

**Non-régression** : rejouer `@SPEC-106`, `@SPEC-113`, `[SPEC-106]`, `[SPEC-113]`.

| Critère | Tests |
|---|---|
| CA-1 | `types/*/schema.test.ts`, `registry.test.ts` |
| CA-2 | `validate.test.ts` |
| CA-3 | `fingerprint.test.ts`, `normalize.test.ts` |
| CA-4 | `public.test.ts` |
| CA-5 | `bricks.test.ts` (intégration) |
| CA-6 | `bricks.test.ts` (isolation, 404) |
| CA-7 | `bricks.test.ts` (concurrence) |
| CA-8 | `spec-501-bricks.spec.ts` (@SPEC-501, @visual) |

## 13. Preuves attendues

`evidence/SPEC-501/` : vidéo du cycle de vie, captures `spec-501-valid.png`, `spec-501-invalid.png`, `spec-501-corrected.png`, rapports unitaires et d'intégration, mesure de performance d'ET-10 consignée dans `summary.md`, `acceptance.md` complété.

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7) ; en plus : couverture de lignes ≥ 80 % sur `packages/bricks` ; aucun import de `db` dans `packages/bricks` (ESLint) ; `docs/architecture/api.md` à jour.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0021, ADR-0027, ADR-0060 (rendu assaini), ADR-0022 (RLS).
- Décisions créées : **ADR-0150** (schémas normatifs, compléments de la consigne, charge publique), **ADR-0151** (normalisation et empreinte).
- Le service vit dans `packages/services` car `bricks` ne peut pas importer `db` (overview §3).
- Les notions d'une brique sont portées par `bricks.notion_ids` et ne changent pas entre versions ; une correction ne modifie que la charge.
- `scripted_dialogue` est validable dès la V1 (qualification, BR-BRI-01) ; son usage en activité relève de la V2 (ADR-0074).
