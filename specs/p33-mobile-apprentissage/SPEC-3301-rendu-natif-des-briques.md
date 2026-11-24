---
id: SPEC-3301
title: Rendu natif des briques et du Markdown
phase: P33
priority: mobile
depends_on: [SPEC-3002, SPEC-3003]
business_rules: [BR-BRI-01, BR-BRI-02, BR-BRI-08, BR-MEM-05, BR-MEM-10, BR-COU-02]
screens: []
adrs: [ADR-0027, ADR-0150, ADR-3004, ADR-3005, ADR-3009]
visual: demo
---

# SPEC-3301 — Rendu natif des briques et du Markdown

## 1. Objectif

Livrer les composants natifs qui affichent et font jouer les briques reçues de l'API (charges
publiques) ainsi que le rendu Markdown, avec un registre unique couvrant les treize types, pour
qu'un même composant serve au cours, au quiz de validation, au quiz global et à l'échauffement.

## 2. Contexte

Lire ADR-0150 (charge publique sans réponse, correction renvoyée par le serveur), ADR-0027
(types et règles communes), ADR-3009 (périmètre natif, Markdown, gestes). Code pur réutilisé :
`@learny/bricks` (`BRICK_TYPES`, schémas de réponse, `gradeBrick`, `correction-view.ts`,
`brickExamples`, `RECALL_SELF_GRADES`), `@learny/domain` `review/game-response.ts`
(`toBrickResponse`, `toGameCorrection`, `correctionExplanation`). Référence web du comportement
et des libellés : `packages/bricks/src/types/*/view.tsx`, SPEC-503, SPEC-701, SPEC-702 et les
maquettes `design/maquettes/Quiz.dc.html` et `QuizGlobal.dc.html`. Style mobile : options de
`design/app-mobile/exports/screens/*-05-quiz.png` (rayon 20, lettre A–D cerclée) et carte de
`*-06-session.png`.

## 3. Dépendances

- **SPEC-3002** (composants, thème, haptique), **SPEC-3003** (client, horloge).
- `mdast-util-from-markdown`, `mdast-util-gfm-table` (ADR-3009), Gesture Handler, Reanimated.

## 4. Règles métier couvertes

- BR-BRI-01 — Le registre `nativeBrickViews` couvre les treize types ; neuf rendus natifs, quatre
  cartes de renvoi au web (ADR-3009 §2).
- BR-BRI-02 — Les rendus valident la charge publique reçue avec les schémas de `@learny/bricks`
  ; une charge invalide affiche « Ce contenu ne peut pas être affiché » et est journalisée (sans
  contenu).
- BR-BRI-08 — Pour les types corrigés par le code, le composant produit une réponse au format
  attendu par le serveur (`toBrickResponse`) et affiche la correction renvoyée ; hors ligne, la
  correction locale vient de `gradeBrick` (utilisée par SPEC-3305).
- BR-MEM-05 — Jeux de mémorisation jouables : carte de rappel, texte à trous (saisie libre,
  comparaison insensible à la casse et aux accents faite par le serveur ou `gradeBrick`),
  association, remise en ordre, classement.
- BR-MEM-10 — Après chaque réponse, la correction et l'explication s'affichent immédiatement
  (`correctionExplanation`).
- BR-COU-02 — `resource-excerpt` et les sources d'une brique affichent la référence (extrait,
  page, minute, ancre) avec un lien vers la ressource (`GET /resources/:rid/url`, ouverture dans
  le navigateur intégré).

## 5. Exigences fonctionnelles

- **EF-1** — `BrickView` : `({ brick, mode: 'read' | 'play', correction?, onResponse, disabled })`
  choisit le rendu par `brick.type` ; `mode: 'read'` pour le cours, `play` pour les épreuves.
- **EF-2** — `choice-question` : énoncé, consigne (« Une seule réponse. » / « Plusieurs
  réponses. »), options A, B, C… (puce lettre, rayon 20), sélection simple ou multiple ; après
  correction : option juste en vert avec icône, option choisie fausse en orange, explication.
- **EF-3** — `open-question` : champ multiligne (compteur de caractères si borne), réponse
  envoyée telle quelle ; affichage « Correction par le tuteur à la fin de la tentative ».
- **EF-4** — `cloze` : texte avec trous en champs inline (largeur adaptée), correction par trou.
- **EF-5** — `matching`, `ordering`, `categorization` : deux modes équivalents (glisser et appuis
  successifs, ADR-3009 §4), état « placé », bouton « Vérifier » géré par l'écran parent.
- **EF-6** — `recall-card` : recto (« Touchez pour révéler »), retournement animé (rotation Y,
  coupée si réduction des animations), verso avec réponse et source ; boutons fournis par
  l'écran parent (auto-évaluation du quiz global ou « À revoir » / « Je savais » de
  l'échauffement).
- **EF-7** — `text` et `resource-excerpt` : rendu `Markdown` ; blocs « À retenir », « Ne pas
  confondre », « Question éclair » (réponse masquée, « Afficher la réponse ») rendus selon leur
  balisage dans la charge.
- **EF-8** — Galerie `/_dev/bricks` : chaque exemple de `brickExamples` rendu en mode lecture,
  jeu et corrigé.

## 6. Exigences techniques

- **ET-1** — `apps/mobile/src/bricks/registry.ts` : `Record<BrickType, NativeBrickView>` ; test
  de complétude sur `BRICK_TYPES`.
- **ET-2** — Aucun accès à une bonne réponse avant correction : les rendus ne lisent que la
  charge publique ; la correction n'est affichée que si `correction` est fourni.
- **ET-3** — `Markdown` : AST mdast → composants `Text` du thème ; liens `accessibilityRole="link"` ;
  tableaux dans un `ScrollView` horizontal ; images ignorées en V1 (texte alternatif affiché).
- **ET-4** — Accessibilité : options en `radio`/`checkbox` avec état ; jeux annoncent l'état
  (« Élément 2 placé dans Actifs ») ; carte de rappel : bouton « Révéler la réponse ».
- **ET-5** — Performances : rendu d'une brique < 16 ms en moyenne sur l'émulateur de référence
  (mesure consignée), aucune re-création d'éléments à la saisie.

## 7. Comportements attendus et cas limites

- **CL-1** — Type inconnu (nouveau type serveur) : carte « Cette activité se fait sur le web ».
- **CL-2** — Charge publique invalide : message « Ce contenu ne peut pas être affiché » (section 4,
  BR-BRI-02), pas de plantage.
- **CL-3** — Texte à trous très long : retour à la ligne correct des champs, clavier ne masquant
  pas le champ actif (`KeyboardAvoidingView`).
- **CL-4** — Glisser interrompu (appel entrant) : l'élément revient à sa place d'origine.
- **CL-5** — Markdown contenant du HTML brut ou un script : ignoré, texte visible seulement.

## 8. Instructions d'implémentation

1. `Markdown` et ses tests (exemples réels de cours seedés).
2. Registre et cartes de renvoi.
3. Rendus dans l'ordre : text, resource-excerpt, choice-question, open-question, recall-card,
   cloze, matching, ordering, categorization.
4. Galerie `/_dev/bricks`, flux Maestro, visuel.

## 9. Fichiers et composants concernés

- **Créés** — `apps/mobile/src/bricks/**`, `apps/mobile/src/ui/Markdown.tsx`,
  `apps/mobile/app/_dev/bricks.tsx`, tests, `apps/mobile/e2e/flows/SPEC-3301-briques.yaml`.
- **Modifiés** — `apps/mobile/package.json` (dépendances d'ADR-3009), `packages/i18n/src/fr/mobile.ts`.
- **Lus** — `packages/bricks/src/**` (entrée principale), `packages/domain/src/review/game-response.ts`.

## 10. Interface et conformité visuelle

Mode `demo` : galerie `/_dev/bricks`. Lignes de base versionnées pour la question à choix
(non répondue, corrigée) et la carte de rappel (recto, verso) ; la question à choix non répondue
doit aussi rester conforme à la zone options de `ios-05-quiz.png` (écart ≤ 12 % sur la zone),
la carte recto à la zone carte de `ios-06-session.png`. `testID` : `brick-<type>`,
`brick-option-<index>`, `brick-gap-<index>`, `brick-item-<id>`, `brick-reveal`.

## 11. Critères d'acceptation

- **CA-1** — Les treize types sont couverts par le registre (test de complétude) et chaque
  exemple de `brickExamples` s'affiche sans erreur en lecture, jeu et corrigé.
- **CA-2** — Pour chaque type corrigé par le code, la réponse produite est acceptée par le schéma
  de réponse de `@learny/bricks` et `gradeBrick` renvoie la même justesse que l'API.
- **CA-3** — Aucune bonne réponse n'apparaît dans l'arbre rendu avant correction.
- **CA-4** — Association, remise en ordre et classement sont jouables sans glisser (appuis
  successifs) et avec un lecteur d'écran.
- **CA-5** — Galerie conforme aux lignes de base et aux zones de maquette (écart ≤ 12 %).

## 12. Plan de tests

- **Unitaires** — Vitest `[SPEC-3301]` `bricks/registry.test.ts` (complétude),
  `bricks/responses.test.ts` (réponses ↔ schémas, `gradeBrick`), `ui/markdown-ast.test.ts`.
  Jest `[SPEC-3301]` `test/bricks/*.test.tsx` (un par type : rendu, jeu, corrigé, absence de
  réponse avant correction, accessibilité). Couvre CA-1, CA-2, CA-3, CA-4.
- **Intégration** — Vitest `[SPEC-3301]` `test/integration/bricks.int.test.ts` : charges
  publiques réelles d'une tentative et d'une session seedées validées et rendues. Couvre CA-1, CA-2.
- **End-to-end** — Maestro `@SPEC-3301` `SPEC-3301-briques.yaml` (vidéo) : galerie, jeu d'une
  association par appuis, retournement d'une carte. Couvre CA-4.
- **Visuel** — `@SPEC-3301 @visual` : question à choix et carte de rappel. Couvre CA-5.
- **Non-régression** — tests de `packages/bricks` et `packages/domain` inchangés et verts.

| Critère | Tests |
|---|---|
| CA-1 | registry.test, test/bricks/*, bricks.int |
| CA-2 | responses.test, bricks.int |
| CA-3 | test/bricks/* |
| CA-4 | test/bricks/*, SPEC-3301-briques.yaml |
| CA-5 | flux visuel |

## 13. Preuves attendues

`evidence/SPEC-3301/` : `acceptance.md`, rapports, vidéo, captures, mesure de rendu (ET-5).

## 14. Définition de terminé

Définition commune adaptée par ADR-3004 ; `validate.mjs SPEC-3301` vert.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0027, ADR-0150, ADR-3004, ADR-3005, ADR-3009.
- Images dans le Markdown non affichées en V1 (texte alternatif) : aucun cours seedé n'en contient.
