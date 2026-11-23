# ADR-3023 — Quiz de validation mobile : conformité visuelle et tentative préparée

- **Statut** : Acceptée — précise ADR-3003 § 2 et § 4 pour l'écran du quiz
- **Origine** : Déduite (mise en œuvre de SPEC-3304)
- **Date** : 2026-11-23
- **Liens** : ADR-0005, ADR-0047, ADR-3002, ADR-3003, ADR-3004, ADR-3018, SPEC-3301, SPEC-611, SPEC-612, SPEC-3304

## Contexte

La maquette mobile (`design/app-mobile/exports/screens/{ios,android}-05-quiz.png`) montre le quiz de
validation avec un **chronomètre** (« 08:42 ») et un bouton « Valider ». ADR-3003 § 2 corrige les
deux : pas de chronomètre (BR-QUI-07 ne porte aucune durée), « Vérifier » et correction immédiate
(BR-QUI-04). La maquette d'état `exports/states/ios-resultat.png` est explicitement une **démo
simulée** (« Démo : 2 questions jouées sur 10 ») : elle ne correspond ni aux données du serveur
(score par notion, lacunes, historique) ni au résultat d'une tentative réelle.

Le harnais de campagne (ADR-3018) ne dispose que d'un émulateur Android : aucun simulateur iOS.
Par ailleurs, la pile locale ne régénère plus la banque de questions (`requestQuestionBank` émet un
job Inngest, or ce mode est retiré, ADR-2006) : `POST /modules/:mid/quiz/attempts` répond 202
`preparing` indéfiniment, donc une tentative neuve ne peut pas être créée par l'application sur
cette pile.

## Décision

1. **Comparaison visuelle** — l'unique flux `@visual` de SPEC-3304 capture la question 3 sur 10,
   comparée à la ligne de base versionnée
   `apps/mobile/e2e/visual/baselines/SPEC-3304-quiz.png` (écart de pixels ≤ 12 %, ADR-3003 § 4).
   Aucun masque de flux n'est déclaré : le chronomètre ayant été **supprimé** (et non masqué), la
   seule zone non comparable est le chrome système, déjà masqué par les zones natives du harnais.
   Les contrôles structurels de la maquette sont vérifiés par le flux et par Jest : « Question n
   sur N », « Tentative 2 · seuil 80 % », « Vérifier », mention BR-QUI-07, absence de
   chronomètre.
2. **État résultat** — `ios-resultat.png` n'est pas comparé : c'est un état de démonstration
   simulé, dont le contenu (score, lacunes, historique) vient du serveur et non d'une maquette. La
   conformité est prouvée par les jetons du thème, la structure (anneau de score, bandeau, barres
   par notion, lacunes, historique, actions) et les tests d'écran.
3. **iOS** — aucune campagne iOS (pas de macOS, ADR-3018) : l'écran n'a aucun fichier
   `.ios.tsx`/`.android.tsx` et utilise les mêmes composants et les insets natifs.
4. **Tentative préparée** — la campagne joue une tentative **en cours** préparée par
   `apps/mobile/e2e/sql/SPEC-3304-seed-quiz.sql` (dix questions à choix, bonne option en tête),
   supprimée par `…-cleanup-quiz.sql`. C'est la même approche que la suite web (fabrique de
   `packages/testing`) et cela respecte la règle du porteur : **aucune mutation du jeu de
   démonstration** (progression des modules, historique, banque) n'est laissée derrière. Le flux ne
   soumet pas la tentative : la soumission et le résultat sont couverts par l'écran (Jest), la
   lecture serveur (intégration) et les suites web de SPEC-611/612.
5. **Délai de nouvelle tentative (CL-5)** — la décision appartient au serveur (SPEC-612/715). Le
   compte de démonstration autorise la reprise (automatisme de remédiation désactivé), donc le test
   d'intégration vérifie la **forme** de la décision (`allowed`, `reason`, `remediationRequired`)
   et le formatage de la date côté mobile (`useStartQuiz`), la refus `RETRY_NOT_YET_ALLOWED` étant
   prouvé par les suites serveur.

## Conséquences

- Une seule campagne visuelle par spécification (leçon 6 du BRIEF) : la question du quiz, l'écran le
  plus dense en jetons.
- Le seed est un fichier SQL versionné, rejouable et nettoyable : la campagne reste reproductible
  sans `db:reset`.
- À la fusion de SPEC-3302, l'entrée « depuis le cours » réutilise la route `quiz/[attemptId]` sans
  modification : l'écran est indépendant de son point d'entrée.
