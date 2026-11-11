---
id: SPEC-502
title: Correction automatique des briques
phase: P5
priority: V1
depends_on: [SPEC-501]
business_rules: [BR-BRI-08, BR-IA-09, BR-MEM-05]
screens: []
adrs: [ADR-0150, ADR-0151]
visual: demo
---

# SPEC-502 — Correction automatique des briques

## 1. Objectif

Fournir dans `@learny/bricks` les fonctions pures de correction par le code (`grade.ts` de chaque type auto-corrigé), le contrôle en direct `sum_equal` des tableaux de consigne, le calcul du barème (score d'activité, note d'exercice avec indices) et l'état du minuteur, ainsi qu'un service `gradeStoredBrick` qui corrige une réponse contre une version de brique enregistrée. Aucun appel IA (BR-IA-09).

## 2. Contexte

- Le quiz de validation (SPEC-611), le quiz global et ses jeux (SPEC-701, SPEC-702), l'examen blanc (SPEC-614), l'exercice (SPEC-613) et le mode hors ligne (SPEC-801) appellent ces fonctions ; le moteur (SPEC-402, SPEC-404) consomme `isCorrect`, `score`, `chosenDistractorNotionId`, `confusions` et `normalizedResponse`.
- Lire : `docs/product/business-rules.md` (BRI-08, MEM-02/05/10, LAC-02/03, PRA-01/03, QUI-01), ADR-0014 (barème sur 100 à parts égales), ADR-0024 (même erreur), ADR-0027 (contrôle `sum_equal`), ADR-0150 (charge publique et ids opaques), ADR-0151 (normalisation).
- Maquettes : `Quiz.dc.html` (« Exact. » / « Pas tout à fait. », états des options), `QuizGlobal.dc.html` (association, remise en ordre, classement, texte à trous, carte de rappel), `Exercice.dc.html` (débit/crédit/écart en direct, 2 indices −1 point), `ExamenBlanc.dc.html` (chronomètre orange sous 5 min, soumission automatique).

## 3. Dépendances

- **SPEC-501** : `brickRegistry`, schémas, `normalizeText`, `toPublic` (ids opaques et graine), `brick_versions`, service des briques.
- Aucune dépendance externe ; `@learny/core` (horloge pour le minuteur, `Result`).

## 4. Règles métier couvertes

- **BR-BRI-08** : `choice_question`, `cloze`, `matching`, `ordering`, `categorization` et `timer` sont corrigés par `gradeBrick` ; `open_question`, `instruction` et `scripted_dialogue` renvoient `GRADED_BY_TUTOR` (refus explicite) et leur note, fournie par le tuteur (SPEC-508 `grade_answer`), est bornée par `clampTutorScore` au barème fixé à la création.
- **BR-IA-09** : toutes les fonctions sont pures, synchrones, sans I/O ; un test d'architecture vérifie que `packages/bricks/src/**/grade.ts` n'importe ni `ai` ni `@learny/llm`.
- **BR-MEM-05** : texte à trous sans liste de choix comparé par `normalizeText` (casse, accents, espaces), variantes acceptées (`answers[]`) ; association et classement : une erreur entre deux notions différentes produit une entrée `confusions` que SPEC-404 enregistre comme confusion.

## 5. Exigences fonctionnelles

- **EF-1** — Correction immédiate : pour une réponse valide, `gradeBrick` renvoie `GradeOutcome` (ET-2) et un objet `correction` affichable (bonne réponse, explication, état de chaque élément) ; titre de retour « Exact. » si `isCorrect`, « Pas tout à fait. » sinon (textes de la maquette, `feedbackTitle`).
- **EF-2** — Score partiel (ADR-0024 : réussite ∈ [0,1]) : choix multiple, trous, association, remise en ordre et classement donnent un score proportionnel (ET-3) ; `isCorrect` n'est vrai que si tout est juste.
- **EF-3** — Distracteur : pour une question à choix, `chosenDistractorNotionId` est la notion du premier distracteur choisi (ordre des options) ; `null` si aucune option fausse choisie.
- **EF-4** — Contrôle en direct du tableau : `evaluateTableChecks(production, values)` renvoie pour chaque contrôle `sum_equal` les totaux gauche/droite, l'écart, `balanced` et `state` (`empty` → « Pas encore de montant », `balanced` → « ✓ Pièce équilibrée », `unbalanced` → « Écart : 12 € ») ; libellés exacts de la maquette ; nombres au format français.
- **EF-5** — Barème d'activité : `computeActivityScore(items, scoring)` renvoie points (2 décimales), pourcentage (entier arrondi au plus proche) et `passed` (points ≥ seuil). Mode `equal` : chaque élément vaut `total / N` points ; une question ouverte vaut `score/maxScore` de sa part.
- **EF-6** — Note d'exercice : `computeExerciseScore(criteria, hintsUsed, brick)` = max(0, Σ points des critères réussis − 1 × indices utilisés) sur 10 ; `passed` si ≥ `passPoints` (défaut 8, verdict « Réussi » / « À retravailler »).
- **EF-7** — Minuteur : `timerState({ startedAt, durationSec, warnAtSec, now })` renvoie `remainingMs` (≥ 0), `display` `mm:ss` (ou `h:mm:ss` au-delà de 59:59), `warning` (restant < `warnAtSec`, orange), `expired` ; l'heure serveur fait foi (`now = clock.now()`).
- **EF-8** — Carte de rappel : `gradeRecallCard(selfGrade)` : `again` → incorrect (score 0), `hard`/`good`/`easy` → correct (score 1) ; `fsrsGrade` = auto-évaluation (BR-MEM-02).

## 6. Exigences techniques

**ET-1 — Schémas de réponse** (`src/types/<type>/response.ts`, `.strict()`) :
- choix : `{ optionIds: string[] (1..6, uniques) }` (exactement 1 si `single`) ;
- trous : `{ gaps: Record<string /* id */, string (0..120) > }` (une entrée par trou ; vide autorisé = faux) ;
- association : `{ pairs: Record<string /* pair id */, string | null /* id opaque r1..rn */> }` ;
- remise en ordre : `{ order: string[] }` (permutation exacte des ids) ;
- classement : `{ assignments: Record<string /* item id */, string | null /* category id */> }` ;
- carte : `{ selfGrade: 'again'|'hard'|'good'|'easy' }` ;
- consigne `table` : `{ fields: Record<string, string>, rows: Array<Record<string, string>> (minRows..maxRows) }` (valeurs brutes saisies) ; `text` : `{ text }` ; `file` : `{ resourceId }` ; `link` : `{ url }` (https uniquement), plus `explanation?: string ≤ 2000`.
Réponse invalide → `Result.err({ code: 'RESPONSE_INVALID', issues })`.

**ET-2 — Sortie** :
```ts
export interface GradeOutcome {
  isCorrect: boolean; score: number;            // 0..1, 4 décimales
  chosenDistractorNotionId: string | null;
  confusions: Array<{ notionId: string; confusedWithNotionId: string }>; // dédupliquées
  normalizedResponse: string;                   // détection de « même erreur » (ADR-0024)
  feedbackTitle: 'Exact.' | 'Pas tout à fait.';
  correction: CorrectionView;                   // union par type, consommée par SPEC-503
}
export function gradeBrick<T extends AutoGradedType>(type: T, payload: BrickPayload<T>, response: unknown, seed: string): Result<GradeOutcome, GradeError>;
export function clampTutorScore(points: number, maxPoints: number): number; // borne [0, max], 2 décimales
```
`seed` = `versionId` pour retrouver les ids opaques de la charge publique (ADR-0150).

**ET-3 — Algorithmes** :
- Choix `single` : juste ⇔ l'option choisie est `correct`. Choix `multiple` : `C` options justes, `TP` justes choisies, `FP` fausses choisies → `score = max(0, (TP − FP) / C)` ; juste ⇔ ensemble identique. `normalizedResponse` = ids choisis triés joints `,`.
- Trous : trou juste ⇔ `normalizeText(saisie) ∈ { normalizeText(a) | a ∈ answers }` ; `score = justes / trous` ; `correction.gaps[i].expected = answers[0]` ; `normalizedResponse` = saisies normalisées dans l'ordre des ids, jointes `|`.
- Association : la paire `p` est juste si l'id opaque choisi correspond à la droite de `p` ; `score = justes / paires` ; pour chaque paire `p` reliée à la droite d'une paire `q` avec `q.notionId ≠ p.notionId` → confusion `(p.notionId, q.notionId)` ; une droite de `extraRights` ou `null` → faux sans confusion.
- Remise en ordre : position juste ⇔ `order[i] === items[i].id` ; `score = positions justes / n` ; `correction.positions[{ id, expectedIndex, givenIndex, correct }]` (« écarts »).
- Classement : élément juste ⇔ catégorie choisie = `categoryId` ; `score = justes / éléments` ; confusion si la catégorie attendue et la catégorie choisie ont toutes deux une `notionId` différente.
- Arrondis : `score` arrondi à 4 décimales (demi vers le haut) ; points à 2 décimales.

**ET-4 — Tableau** (`src/types/instruction/table-checks.ts`) :
```ts
export function parseFrenchNumber(raw: string): number | null; // accepte "1 234,56", "1234.56", "120", "-3,5" ; espaces/espaces insécables ignorés ; sinon null
export function evaluateTableChecks(production: TableProduction, values: TableResponse): TableCheckResult[];
export interface TableCheckResult { index: number; leftSum: number; rightSum: number; difference: number; state: 'empty'|'balanced'|'unbalanced'; label: string; sideByRow: Array<string | null> }
```
Lignes comptées : `groupColumn ∈ left` (gauche) ou `∈ right` (droite) ; montant non numérique = 0 ; comparaison au centime (`Math.round(x*100)`). `empty` si aucune ligne n'a à la fois une valeur de groupe et un montant > 0 ; `balanced` si différence = 0 et somme gauche > 0. `sideByRow` donne `leftLabel`/`rightLabel` (colonne « Sens ») ou `null`. Libellés : `Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })`.

**ET-5 — Barème et minuteur** (`src/types/scoring/compute.ts`, `src/types/timer/state.ts`) :
```ts
export function computeActivityScore(items: Array<{ brickId: string; score: number }>, scoring: ScoringPayload): { points: number; percent: number; passed: boolean; perItem: Array<{ brickId: string; points: number; max: number }> };
export function computeExerciseScore(criteria: Array<{ key: string; ok: boolean }>, hintsUsed: number, brick: InstructionPayload): { points: number; max: 10; passed: boolean; verdict: 'Réussi' | 'À retravailler' };
export function timerState(i: { startedAt: Date; durationSec: number; warnAtSec: number; now: Date }): { remainingMs: number; display: string; warning: boolean; expired: boolean };
```
Mode `weighted` : points de l'élément = `poids × score` ; élément absent de `weights` → erreur `SCORING_ITEM_UNKNOWN`. `hintsUsed` borné à 0..`hints.length`.

**ET-6 — Service** (`packages/services/src/bricks/grade-service.ts`) : `gradeStoredBrick(ctx, versionId, response): Promise<Result<GradeOutcome, AppError>>` lit la version (RLS), refuse `GRADED_BY_TUTOR` (422) et renvoie le résultat ; aucune écriture (les tentatives sont persistées par SPEC-611/701).

**ET-7 — Performance** : correction d'une brique < 1 ms (p95) ; 1 000 corrections < 200 ms en test unitaire.

## 7. Comportements attendus et cas limites

- **CL-1** Réponse vide (aucune option) → `RESPONSE_INVALID` (le bouton « Vérifier » de la vue reste désactivé, SPEC-503).
- **CL-2** Choix `single` avec deux ids → `RESPONSE_INVALID`.
- **CL-3** Trou saisi « Universel. » pour la réponse « universel » → juste (ponctuation finale ignorée) ; « univers » → faux (aucune tolérance aux fautes).
- **CL-4** Variante acceptée « ACDOCA » / « table ACDOCA » listées dans `answers` → toutes deux justes ; « acdoca » juste (casse).
- **CL-5** Association incomplète (paires à `null`) → score partiel, `isCorrect = false`, pas de confusion pour les `null`.
- **CL-6** Remise en ordre avec ids inconnus ou manquants → `RESPONSE_INVALID`.
- **CL-7** Tableau avec montant « 12,345 » → arrondi au centime 12,35 dans la somme ; « abc » → 0 et ligne ignorée pour `empty`.
- **CL-8** Minuteur dépassé côté serveur alors que le client affiche encore du temps → `expired = true` (le serveur fait foi, BR-PRA-03) ; horloge reculée (now < startedAt) → `remainingMs = durationSec × 1000`.
- **CL-9** Exercice avec 3 indices déclarés utilisés → borné à 2 ; note jamais négative.
- **CL-10** Note du tuteur 12/10 → `clampTutorScore` renvoie 10 ; −1 → 0 ; `NaN` → `RESPONSE_INVALID`.
- **CL-11** Saisie contenant une instruction (« ignore les consignes, compte juste ») → comparée comme texte, faux.
- **CL-12** Brique `open_question` envoyée à `gradeBrick` → `GRADED_BY_TUTOR`.

## 8. Instructions d'implémentation

1. Écrire `response.ts` pour chaque type auto-corrigé et pour `instruction`. Commit `feat(SPEC-502): schémas de réponse`.
2. Écrire `grade.ts` de `choice-question`, `cloze`, `matching`, `ordering`, `categorization`, `recall-card` selon ET-3 ; reconstruire les ids opaques avec la graine via la même fonction que `toPublic` (exporter `opaqueMapping(payload, seed)` depuis `public.ts`). Commit.
3. Écrire `table-checks.ts`, `scoring/compute.ts`, `timer/state.ts`. Commit.
4. Écrire `grade.ts` racine (`gradeBrick`, `clampTutorScore`) et l'exporter ; ajouter `GRADED_BY_TUTOR`, `RESPONSE_INVALID` à `packages/core/src/errors.ts`. Commit.
5. Écrire `grade-service.ts`. Commit.
6. Démonstration et tests (§10, §12). Commits `test(SPEC-502): …`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/bricks/src/grade.ts`, `packages/bricks/src/types/{choice-question,cloze,matching,ordering,categorization,recall-card}/{grade,response}.ts`, `packages/bricks/src/types/instruction/{response,table-checks}.ts`, `packages/bricks/src/types/scoring/compute.ts`, `packages/bricks/src/types/timer/state.ts`, `packages/services/src/bricks/grade-service.ts`, `apps/web/app/_dev/sdd/_demos/spec-502.tsx`, tests §12.
- **Modifiés** : `packages/bricks/src/index.ts`, `packages/bricks/src/types/*/public.ts` (export `opaqueMapping`), `packages/core/src/errors.ts`.
- **Lus** : `brickRegistry`, exemples de SPEC-501.

## 10. Interface et conformité visuelle

Mode `demo`. Page `/_dev/sdd/SPEC-502` « SPEC-502 · Correction par le code » : pour chacun des cinq jeux et de la question à choix, une carte (`data-testid="grade-card-<type>"`) qui affiche l'exemple de SPEC-501 sous forme de formulaire simple (`@learny/ui` : Checkbox, TextField, Select), un bouton « Vérifier » (`grade-check-<type>`) et le résultat (`grade-result-<type>` : « Exact. »/« Pas tout à fait. », score en %, confusions). Une carte « Tableau » (`grade-table`) reprend l'exemple de saisie de la maquette Exercice (2 lignes, clé, compte, montant) et affiche en direct « Débit … € · Crédit … € » et l'état (`grade-table-state`). Une carte « Minuteur » (`grade-timer`) affiche `mm:ss` calculé par `timerState` sur l'horloge figée (démarrage 12:00:00Z, durée 40 min → « 20:00 »). Accessibilité : `aria-live="polite"` sur les résultats. Contrôles visuels : jetons (couleurs succès `#E1F4EF`/`#0B5C4D`, erreur `#FFEDE0`/`#8F3305`), structure, `toHaveScreenshot`.

## 11. Critères d'acceptation

- **CA-1** Les tables de cas de §12 (≥ 60 cas couvrant les 6 correcteurs) donnent exactement `isCorrect`, `score` et `correction` attendus.
- **CA-2** Une erreur d'association ou de classement entre deux notions différentes produit la confusion attendue ; une erreur au sein d'une même notion n'en produit pas.
- **CA-3** Le texte à trous accepte casse, accents, espaces et variantes, et refuse une faute d'orthographe.
- **CA-4** Le contrôle `sum_equal` reproduit les trois états et libellés de la maquette Exercice (aucun montant, équilibré à 120 €, écart).
- **CA-5** `computeActivityScore` sur 12 questions à parts égales donne 75 % pour 9 justes ; `computeExerciseScore` donne 8/10 pour 5 critères réussis et 2 indices ; le seuil est respecté.
- **CA-6** `timerState` passe `warning` à 4:59 restantes et `expired` à 0, avec l'horloge figée.
- **CA-7** Aucun fichier de correction n'importe un SDK d'IA (test d'architecture) et la page de démonstration corrige les 6 types (vidéo).

## 12. Plan de tests

**Unitaires** (`describe('[SPEC-502] …')`) :
- `packages/bricks/src/types/choice-question/grade.test.ts` : single juste/faux, multiple exact/partiel/FP pénalisant/score plancher 0, distracteur → notion (CA-1).
- `cloze/grade.test.ts` : table de 15 saisies (CA-3, CL-3, CL-4), `normalizedResponse`.
- `matching/grade.test.ts`, `categorization/grade.test.ts` : confusions (CA-2), ids opaques reconstruits avec la graine.
- `ordering/grade.test.ts` : écarts, permutation invalide (CL-6), propriété fast-check « l'ordre correct donne 1 ».
- `recall-card/grade.test.ts` : 4 auto-évaluations (EF-8).
- `instruction/table-checks.test.ts` : `parseFrenchNumber` (12 formats), trois états (CA-4), arrondi (CL-7).
- `scoring/compute.test.ts`, `timer/state.test.ts` : CA-5, CA-6, CL-8, CL-9 (horloge `createFixedClock()`).
- `grade.test.ts` : `GRADED_BY_TUTOR`, `clampTutorScore` (CL-10), performance (ET-7).
- `architecture.test.ts` : aucun import de `ai`/`@learny/llm` dans `grade.ts` (CA-7).
- **Injection** : `cloze/grade.test.ts` « saisie piégée » (CL-11) reste fausse.

**Intégration** (`packages/services/test/integration/grade-service.test.ts`, `describe('[SPEC-502] correction d'une brique enregistrée')`) : création d'une association et d'un classement via le service SPEC-501, correction par `gradeStoredBrick` avec ids opaques issus de `getPublicBrick` (cohérence graine), refus d'une question ouverte, refus d'une version d'un autre utilisateur (404).

**End-to-end** (`apps/web/e2e/specs/p5/spec-502-grading.spec.ts`) : `test('correction par le code des six types @SPEC-502', …)` : sur `/_dev/sdd/SPEC-502`, répondre juste à la question à choix (« Exact. »), faux à l'association (confusion affichée), saisir « Universel » dans le texte à trous (juste), remplir le tableau 120 €/120 € (« ✓ Pièce équilibrée ») puis 120/100 (« Écart : 20 € »), lire le minuteur « 20:00 ». Vidéo.

**Visuel** : `test('démonstration de correction @SPEC-502 @visual', …)` : `expectTokens` sur les états succès/erreur, `toHaveScreenshot('spec-502-demo.png')`.

**Non-régression** : `[SPEC-501]`, `@SPEC-501`, `[SPEC-404]`.

| Critère | Tests |
|---|---|
| CA-1 | `*/grade.test.ts` |
| CA-2 | `matching/grade.test.ts`, `categorization/grade.test.ts`, e2e |
| CA-3 | `cloze/grade.test.ts`, e2e |
| CA-4 | `table-checks.test.ts`, e2e |
| CA-5 | `scoring/compute.test.ts` |
| CA-6 | `timer/state.test.ts`, e2e |
| CA-7 | `architecture.test.ts`, `spec-502-grading.spec.ts` (@SPEC-502, @visual) |

## 13. Preuves attendues

`evidence/SPEC-502/` : vidéo de la démonstration, captures `spec-502-table-balanced.png` et `spec-502-matching-confusion.png`, rapports unitaires (table des cas), mesure de performance (ET-7) dans `summary.md`, `acceptance.md`.

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7) ; couverture ≥ 80 % des lignes des fichiers `grade.ts`, `table-checks.ts`, `compute.ts`, `state.ts`.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0014, ADR-0024, ADR-0027, ADR-0150, ADR-0151.
- Décisions prises ici (rattachées à ADR-0150/0151, sans nouvel ADR) : formule du choix multiple `(TP − FP)/C` bornée à 0 ; score proportionnel pour les jeux ; aucune tolérance orthographique au-delà de `normalizeText` ; comparaison des montants au centime.
- La persistance des réponses et la mise à jour du moteur ne relèvent pas de cette spécification (SPEC-611, SPEC-701, SPEC-411).
