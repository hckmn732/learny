---
id: SPEC-503
title: Rendu des briques
phase: P5
priority: V1
depends_on: [SPEC-501, SPEC-303]
business_rules: [BR-BRI-01]
screens: []
adrs: [ADR-0060, ADR-0150, ADR-0152]
visual: tokens
---

# SPEC-503 — Rendu des briques

## 1. Objectif

Livrer un composant React `view.tsx` par type de brique (13), conforme aux maquettes Quiz, QuizGlobal, Exercice, ExamenBlanc et Cours, utilisable au clavier et à la souris, avec les états vierge, sélectionné, répondu, corrigé (juste/faux) et explication, ainsi que la galerie `/_dev/bricks` qui les présente tous. Les écrans des phases P6 et P7 composeront ces vues sans styles propres.

## 2. Contexte

- Lire : `design/maquettes/Quiz.dc.html` (question, options A-D, texte à trous, association par menus, bloc de correction, bouton Vérifier/Question suivante), `QuizGlobal.dc.html` (carte de rappel recto/verso et auto-évaluation, association par tuiles, remise en ordre avec Monter/Descendre, classement avec boutons segmentés et paniers, texte à trous grand format), `Exercice.dc.html` (consigne sombre, puces de données, tableau typé avec contrôle en direct, explication, indice, correction par critère), `ExamenBlanc.dc.html` (choix en colonne, chronomètre, alerte orange sous 5 min), `Cours.dc.html` (texte du cours, extraits cliquables colorés par type).
- `docs/engineering/conventions.md` §4 (composants `@learny/ui` uniquement, `data-testid`), `docs/engineering/testing.md` §6, ADR-0034 (échelle 90 %, jetons en rem), ADR-0060 (Markdown sécurisé), ADR-0150 (charge publique), ADR-0152 (variantes, couleurs).

## 3. Dépendances

- **SPEC-501** : types `PublicPayload<T>`, exemples valides par type (`examples.ts`).
- **SPEC-303** (et SPEC-301/302) : jetons, `Button`, `IconButton`, `Card`, `Chip`, `Badge`, `SegmentedControl`, `TextField`, `Textarea`, `Select`, `ProgressBar`, icônes lucide, `Tooltip`.
- SPEC-502 n'est pas une dépendance déclarée : la vue consomme le type `CorrectionView` exporté par `@learny/bricks` ; si SPEC-502 n'est pas encore terminée, le type est défini ici (fichier `src/correction-view.ts`) et SPEC-502 le réutilise. Bibliothèques : `react-markdown`, `remark-gfm`, `rehype-sanitize` (ADR-0060).

## 4. Règles métier couvertes

- **BR-BRI-01** : une vue par type est enregistrée dans `brickViews: { [K in BrickType]: BrickView<K> }` ; le composant générique `<BrickRenderer>` choisit la vue par `type` ; un test échoue si un des 13 types n'a pas de vue. Règles d'affichage associées (retour immédiat BR-QUI-04/BR-MEM-10, carte de rappel BR-MEM-02) sont portées par les états `corrected` et l'auto-évaluation.

## 5. Exigences fonctionnelles

- **EF-1** — Contrat de vue (contrôlée) :
```ts
export interface BrickViewProps<T extends BrickType> {
  brick: { versionId: string; type: T; notionLabels: string[]; publicPayload: PublicPayload<T> };
  variant: 'quiz' | 'game' | 'exam' | 'review' | 'course' | 'exercise';
  value: BrickResponse<T> | null;           // réponse en cours
  onChange?: (value: BrickResponse<T>) => void;
  status: 'idle' | 'answered' | 'checking' | 'corrected' | 'locked';
  correction?: CorrectionView<T>;           // présent si status = corrected | review
  onExcerptOpen?: (ref: { resourceId: string; location: ExcerptLocation }) => void;
  labelledBy?: string;                      // id du titre fourni par l'écran
}
```
`locked` : saisie désactivée (minuteur écoulé, examen soumis, réponse vérifiée). La vue n'appelle jamais l'API.
- **EF-2** — En-tête de question (variants `quiz`/`review`) : pastille de type (libellés : « Choix unique », « Choix multiple », « Question ouverte », « Texte à trous », « Association », « Remise en ordre », « Classement », « Carte de rappel ») et pastille « Notion : {label} » (`#ECECFC`/`#2E2E8F`), énoncé en Space Grotesk 26 px (24 px en `exam`).
- **EF-3** — Question à choix : options lettrées A-F ; `quiz` = grille 2 colonnes (1 colonne < 640 px), tuile min. 72 px, rayon 18 px ; `exam` = colonne, min. 56 px, rayon 16 px, lettre `#111113`/`#C6F432` si choisie ; `role="radiogroup"`/`radio` (single) ou `group`/`checkbox` (multiple, mention « Plusieurs réponses possibles ») ; corrigé : bonne option bordure 2 px `#14A38B` fond `#E1F4EF`, option choisie fausse `#F97316`/`#FFEDE0`.
- **EF-4** — Texte à trous : champs en ligne de 150 px, fond `#F4F4F1`, soulignement intérieur 2 px `#111113` ; corrigé juste/faux par couleur et texte « Réponse attendue : X » lisible par lecteur d'écran ; libellés accessibles « Trou 1 sur 2 » ; `game` : texte Space Grotesk 24 px, interligne 2, paragraphe « Réponses attendues : … » après vérification.
- **EF-5** — Association : `quiz` = une ligne par élément gauche (libellé 170 px) + `Select` « Choisir… » ; `game` = deux colonnes de tuiles (gauche numérotées 1..n, droite avec pastille du numéro relié ou pastille pointillée vide), sélection gauche puis droite, re-sélection d'une droite déjà reliée la déplace, boutons « Vérifier » et « Recommencer » ; texte d'aide « Touchez une notion, puis la définition qui lui correspond. ».
- **EF-6** — Remise en ordre : liste numérotée, chaque ligne avec boutons « Monter »/« Descendre » (44 × 44 px, désactivés aux extrémités) ; clavier : `Alt+↑`/`Alt+↓` déplacent l'élément focalisé ; bouton « Vérifier l'ordre » en `game`.
- **EF-7** — Classement : paniers en pointillé (`1.5px dashed #C9C8C1`, rayon 18) listant les éléments rangés ; une ligne par élément avec `SegmentedControl` des catégories (`aria-pressed`) ; bouton « Vérifier le classement ».
- **EF-8** — Carte de rappel : recto (fond `#F8F8F6`, « Recto · cherchez de tête », bouton « Retourner la carte ») puis verso (fond `#111113`, « Verso · réponse » en `#C6F432`, source) et groupe « Aviez-vous trouvé ? » de 4 boutons (Raté, Difficile, Bon, Facile) avec l'échéance sous chaque libellé (prop `dueLabels` fournie par l'écran, ex. « Demain », « Dans 2 jours ») ; `Espace`/`Entrée` retourne la carte, touches `1`-`4` choisissent l'auto-évaluation.
- **EF-9** — Question ouverte : `Textarea` avec compteur « n / max caractères » ; en `review` : note du tuteur, critères (✓/✗ avec texte masqué « réussi »/« à revoir »), éléments manquants.
- **EF-10** — Consigne (`exercise`) : bloc sombre « Consigne » (Markdown), puces de données (`#1C1C20`), section « Votre saisie » avec champs d'en-tête, tableau `role="table"` (en-têtes de colonnes, cellules `Select`/`TextField` numériques alignés à droite, colonne dérivée « Sens » si `sideColumnLabel`), « + Ajouter un poste » (jusqu'à `maxRows`), « Retirer le poste n » (au-delà de `minRows`), totaux en direct (`aria-live`) avec l'état de `evaluateTableChecks` ; section « Expliquez avec vos mots » si `explanationPrompt` ; encadré d'indice (`role="status"`, `#F1FBD3`/`#3D5200`, « Indice n : … ») ; en `review` : « Correction du tuteur », note « n / 10 », verdict, critères. Productions `text`/`file`/`link` : Textarea, sélection de fichier (callback `onFileSelect`), champ URL.
- **EF-11** — Texte (`course`) : Markdown via `react-markdown` + `remark-gfm` + `rehype-sanitize` (ADR-0060), listes à puces carrées de 8 px, tableaux avec en-tête `#F4F4F1`, corps 17 px interligne 1,7.
- **EF-12** — Extrait de ressource : bouton en ligne (rayon 8 px, 12 px gras) coloré par type d'apport (ADR-0152), libellé `label` (ex. « Guide FI, p. 4 », « Note vocale, 1:42 », « Tutoriel vidéo, 5:10 ») ; clic → `onExcerptOpen` ; si la ressource est supprimée (`resourceId` absent dans la charge fournie) : « Source supprimée », non cliquable (ADR-0039).
- **EF-13** — Minuteur : `role="timer"`, `aria-label="Temps restant : n minutes"`, format `mm:ss` Space Grotesk 20 px, fond `#232328` puis `#F97316` sous `warnAtSec` ; annonce `aria-live="assertive"` une seule fois au passage sous 5 min (« Il reste 5 minutes »).
- **EF-14** — Barème : bloc « Barème · {total} points » listant les critères et « Chaque indice utilisé retire 1 point. » (consigne) ; pour une activité, « Seuil {threshold} % ».
- **EF-15** — Dialogue scénarisé : fiche de lecture (rôle, contexte, objectif, condition de fin) sans jeu interactif en V1 (ADR-0074).
- **EF-16** — Bloc de correction commun (`quiz`) : fond `#E1F4EF`/`#0B5C4D` (« Exact. ») ou `#FFEDE0`/`#8F3305` (« Pas tout à fait. »), explication 15 px ; annoncé par `aria-live="polite"`.

## 6. Exigences techniques

- **ET-1** Arborescence : `packages/bricks/src/types/<type>/view.tsx` (+ `view.test.tsx`), `packages/bricks/src/view/{BrickRenderer.tsx,QuestionHeader.tsx,FeedbackBox.tsx,ExcerptChip.tsx,labels.ts,index.ts}` exportés par `@learny/bricks/view` (`"use client"`). Les textes fixes sont dans `labels.ts` (français, vouvoiement) ; l'application peut les surcharger par la prop `labels` mais `apps/web/messages/fr.ts` les réexporte.
- **ET-2** Styles : classes Tailwind 4 issues des jetons `@learny/ui/tokens` uniquement (rem, échelle 90 %) ; aucune couleur en dur hors jetons ; styles en ligne seulement pour des valeurs dynamiques (largeur de barre). Les couleurs d'ADR-0152 doivent exister dans les jetons (`success`, `danger-soft`, `excerpt-*`) ; à défaut, les ajouter à `@learny/ui/tokens` dans cette spécification.
- **ET-3** Accessibilité : chaque groupe interactif a un nom accessible (`aria-labelledby` vers l'énoncé) ; focus visible (anneau 2 px `#111113`, décalage 2 px) ; cibles ≥ 44 px ; ordre de tabulation naturel ; `prefers-reduced-motion` désactive l'animation de retournement de carte ; aucune information portée par la couleur seule (icônes ✓/✗ et textes masqués).
- **ET-4** Mélange : la vue affiche l'ordre de la charge publique tel quel (déjà mélangé par le serveur) ; elle ne mélange jamais elle-même (déterminisme des captures).
- **ET-5** Galerie `/_dev/bricks` (`apps/web/app/_dev/bricks/page.tsx`, activée par `ENABLE_SDD_PAGES=true`, 404 sinon) : barre de filtres (type, variante, état) avec paramètres d'URL `?type=&variant=&state=` ; une section par type (`data-testid="gallery-<type>"`) montrant les exemples de SPEC-501 dans les états `idle`, `answered`, `corrected-ok`, `corrected-ko` (correction fabriquée par `gradeBrick` quand SPEC-502 est disponible, sinon par les objets statiques `examples.ts#corrections`) ; pages dédiées `/_dev/bricks/quiz`, `/_dev/bricks/jeux`, `/_dev/bricks/exercice`, `/_dev/bricks/examen` qui reproduisent les cartes des maquettes avec les mêmes données (questions 4, 5, 6 de `Quiz.dc.html`, les 5 jeux de `QuizGlobal.dc.html`, l'exercice « Saisir une pièce équilibrée », la question 1 de `ExamenBlanc.dc.html`) dans un conteneur de largeur identique (920 px, 1160 px).
- **ET-6** Performance : rendu initial d'une vue < 8 ms (Testing Library, moyenne de 50 rendus) ; aucune dépendance supplémentaire > 30 ko gzip.

## 7. Comportements attendus et cas limites

- **CL-1** `status = 'corrected'` sans `correction` → la vue affiche l'état `answered` et journalise un avertissement en développement.
- **CL-2** Énoncé très long (600 caractères) ou option de 200 caractères → retour à la ligne, aucune coupure ni débordement à 360 px.
- **CL-3** Texte Markdown contenant `<script>` ou `javascript:` → rendu inerte (sanitize), aucun lien `javascript:`.
- **CL-4** Double clic sur « Vérifier » (variant `game`) → un seul appel `onCheck` (bouton désactivé tant que `status = 'checking'`).
- **CL-5** Navigation clavier seule sur l'association `game` : Tab vers une tuile gauche, Entrée la sélectionne, Tab vers une tuile droite, Entrée relie ; Échap annule la sélection.
- **CL-6** `locked` pendant la saisie d'un trou (minuteur écoulé) → champs `disabled`, valeur conservée.
- **CL-7** Tableau au maximum de lignes → « + Ajouter un poste » masqué ; au minimum → boutons « Retirer » masqués.
- **CL-8** Extrait d'une vidéo YouTube sans `startSec` → libellé seul, `onExcerptOpen` reçoit la position 0.
- **CL-9** Mobile 390 px : grille de choix sur une colonne, tableau défilant horizontalement (`overflow-x: auto`, largeur min. 680 px), boutons d'auto-évaluation en 2 × 2.
- **CL-10** Contenu de brique contenant un faux bouton HTML (« <button>Valider</button> ») → affiché comme texte.

## 8. Instructions d'implémentation

1. Ajouter les jetons manquants d'ADR-0152 à `@learny/ui/tokens` (si absents) avec test de contraste AA. Commit `feat(SPEC-503): jetons des états de brique`.
2. Écrire les composants communs (`QuestionHeader`, `FeedbackBox`, `ExcerptChip`, `labels.ts`). Commit.
3. Écrire les vues dans l'ordre : choix, trous, association (2 variantes), remise en ordre, classement, carte de rappel, question ouverte, consigne (tableau, contrôle en direct via `evaluateTableChecks` si présent, sinon calcul local identique à ET-4 de SPEC-502 placé dans `packages/bricks/src/types/instruction/table-checks.ts`), texte, extrait, minuteur, barème, dialogue. Un commit par groupe de vues.
4. Écrire `BrickRenderer` et le registre `brickViews`. Commit.
5. Écrire la galerie et ses quatre pages de reproduction (ET-5). Commit.
6. Tests unitaires (Testing Library, axe), e2e, visuel. Commits `test(SPEC-503): …`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/bricks/src/types/*/view.tsx` (×13), `packages/bricks/src/view/*`, `packages/bricks/src/correction-view.ts` (si absent), `apps/web/app/_dev/bricks/{page.tsx,quiz/page.tsx,jeux/page.tsx,exercice/page.tsx,examen/page.tsx}`, `apps/web/e2e/specs/p5/spec-503-bricks-render.spec.ts`.
- **Modifiés** : `packages/bricks/package.json` (export `./view`, dépendances React), `packages/ui/src/tokens/*` (jetons d'états si absents), `apps/web/messages/fr.ts` (réexport des libellés).
- **Lus** : maquettes listées en §2, `design/references/` (captures de SPEC-005), composants SPEC-302/303.

## 10. Interface et conformité visuelle

Mode `tokens` (pas d'écran métier propre) ; les références sont les cartes des maquettes reproduites dans la galerie.
- **Structure attendue** : `/_dev/bricks/quiz` reproduit la `section` « question » de `Quiz.dc.html` (progression 12 segments, pastilles type/notion, énoncé, options, ligne « Correction immédiate · nouvelles questions à chaque tentative » + « Vérifier ») ; `/_dev/bricks/jeux` reproduit la section `t-jeu` de `QuizGlobal.dc.html` pour chacun des 5 jeux (paramètre `?jeu=1..5`) ; `/_dev/bricks/exercice` reproduit les sections Consigne, Votre saisie, Expliquez avec vos mots ; `/_dev/bricks/examen` reproduit la carte question et le chronomètre.
- `data-testid` : `brick-<type>` (racine), `brick-option-<id>`, `brick-gap-<id>`, `brick-check`, `brick-reset`, `brick-feedback`, `brick-flip`, `brick-grade-<again|hard|good|easy>`, `brick-move-up-<id>`, `brick-move-down-<id>`, `brick-table-add-row`, `brick-table-state`, `brick-timer`.
- **Contrôles automatisés** (testing.md §6) : (1) `expectTokens` : couleurs de sélection, juste, faux, citron `#C6F432`, polices Space Grotesk (énoncés) et Inter (corps), rayons 18/22/24/28 px convertis à l'échelle 90 % ; (2) structure : présence, ordre et textes exacts ci-dessus ; (3) comparaison côte à côte des pages de reproduction avec des recadrages des références `design/references/SCR-09-*`, `SCR-10-*`, `SCR-08-*`, `SCR-11-*` limités à la carte concernée — écart mesuré et consigné (indicatif, seuil 12 % appliqué) ; (4) `toHaveScreenshot` de chaque section de la galerie (`maxDiffPixelRatio: 0.01`).
- Axe : aucune violation serious/critical sur `/_dev/bricks` et ses quatre pages.
- Responsive : 1440 × 900 et 390 × 844.

## 11. Critères d'acceptation

- **CA-1** Les 13 types ont une vue enregistrée et `<BrickRenderer>` rend l'exemple valide de chacun sans erreur.
- **CA-2** Les 5 jeux et la question à choix se jouent entièrement au clavier (e2e) et à la souris.
- **CA-3** Les états corrigés appliquent exactement les couleurs d'ADR-0152 et une mention textuelle (vérifié par `expectTokens` et requête d'accessibilité).
- **CA-4** Aucune violation axe serious/critical sur la galerie et ses pages de reproduction (desktop et mobile).
- **CA-5** Les pages de reproduction respectent la structure et les textes des maquettes et l'écart pixel mesuré par carte est ≤ 12 %.
- **CA-6** Un Markdown piégé (`<script>`, `javascript:`, HTML brut) est rendu inerte.
- **CA-7** Le minuteur passe à l'orange et annonce « Il reste 5 minutes » exactement une fois.

## 12. Plan de tests

**Unitaires** (`describe('[SPEC-503] …')`, Testing Library + `vitest-axe`) :
- `packages/bricks/src/types/*/view.test.tsx` : rendu de l'exemple par état, `onChange` sur interaction souris et clavier, `locked` désactive la saisie, axe sans violation (CA-1, CA-3).
- `matching/view.test.tsx` : variantes `quiz` (selects) et `game` (tuiles), déplacement d'une paire, Échap (CL-5).
- `ordering/view.test.tsx` : Monter/Descendre, `Alt+↑`, extrémités désactivées.
- `recall-card/view.test.tsx` : retournement par Espace, touches 1-4, `prefers-reduced-motion`.
- `text/view.test.tsx` : **injection** Markdown (CA-6, CL-3, CL-10).
- `timer/view.test.tsx` : seuil orange, annonce unique (CA-7) avec horloge simulée.
- `view/registry.test.tsx` : 13 vues enregistrées.

**Intégration** (`apps/web/test/integration/bricks-gallery.test.ts`, `describe('[SPEC-503] galerie des briques')`) : la route `/_dev/bricks` répond 404 si `ENABLE_SDD_PAGES` est faux et 200 sinon ; le rendu serveur de chaque page de reproduction contient les textes exacts de la maquette.

**End-to-end** (`apps/web/e2e/specs/p5/spec-503-bricks-render.spec.ts`) :
- `test('jouer les cinq jeux au clavier @SPEC-503', …)` : `/_dev/bricks/jeux?jeu=1` → Espace retourne la carte, touche 3 « Bon » ; `?jeu=2` relie trois paires au clavier puis « Vérifier » ; `?jeu=3` remet en ordre via Alt+↑ ; `?jeu=4` classe ; `?jeu=5` saisit « tuile » et « interne ». Vidéo (CA-2).
- `test('question à choix corrigée @SPEC-503', …)` : `/_dev/bricks/quiz` → choix B, Vérifier, couleur juste ; galerie état `corrected-ko`.
- `test('exercice tableau en direct @SPEC-503', …)` : saisie 40/606400/120 et 50/512000/120 → « ✓ Pièce équilibrée ».
- Axe sur chaque page (CA-4), projet `mobile` inclus.

**Visuel** : `test('conformité des briques aux maquettes @SPEC-503 @visual', …)` : `expectTokens`, structure, comparaison avec recadrage des références (seuil 12 %, CA-5), `toHaveScreenshot` par section.

**Non-régression** : `@SPEC-303`, `@SPEC-302`, `[SPEC-501]`.

| Critère | Tests |
|---|---|
| CA-1 | `*/view.test.tsx`, `view/registry.test.tsx` |
| CA-2 | e2e « jouer les cinq jeux au clavier » |
| CA-3 | `*/view.test.tsx`, test @visual |
| CA-4 | e2e (axe desktop/mobile) |
| CA-5 | test @visual, `bricks-gallery.test.ts` |
| CA-6 | `text/view.test.tsx` |
| CA-7 | `timer/view.test.tsx` |

## 13. Preuves attendues

`evidence/SPEC-503/` : vidéos (jeux au clavier, quiz, exercice), captures de chaque section de la galerie en desktop et mobile, images côte à côte maquette/application et diff des quatre pages de reproduction (`visual/`), écarts mesurés dans `summary.md`, rapport axe dans `checks.json`.

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7) ; galerie complète (13 types × états) ; aucune couleur hors jetons (règle ESLint/stylelint du design system) ; lignes de base `toHaveScreenshot` enregistrées.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0034, ADR-0038, ADR-0059, ADR-0060, ADR-0150.
- Décision créée : **ADR-0152** (variantes `quiz`/`game`/`exam`/`review`/`course`/`exercise` et couleurs d'états et d'extraits ; couleur de l'image choisie neutre faute de maquette).
- Les vues sont contrôlées et sans appel réseau ; la persistance et la correction sont faites par les écrans (P6/P7) et SPEC-502.
- Le dialogue scénarisé n'a qu'une fiche de lecture en V1 ; le jeu interactif arrive avec SPEC-905.
