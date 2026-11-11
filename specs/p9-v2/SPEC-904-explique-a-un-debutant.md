---
id: SPEC-904
title: Explique à un débutant
phase: P9
priority: V2
depends_on: [SPEC-905]
business_rules: [BR-MEM-11]
screens: [SCR-10]
adrs: [ADR-0208]
visual: tokens
---

# SPEC-904 — Explique à un débutant

## 1. Objectif

Ajouter au quiz global un jeu de dialogue où l'apprenant explique une notion au tuteur qui joue un novice, puis reçoit une évaluation pédagogique. Le résultat nourrit la maîtrise et FSRS par notion une seule fois à la fin de la partie.

## 2. Contexte

Lire BR-MEM-01/02/03/04/11, `docs/product/vision.md` §2, `docs/architecture/ai.md` §3–§5, `docs/product/screens.md` SCR-10, SPEC-402/406/502/701/702/905 et ADR-0208. Le quiz global V1 propose plusieurs formats déterministes ; le jeu V2 s'ajoute à leur registre et respecte le plafond quotidien, l'entrelacement et les préférences. Le tuteur joue un novice, mais ses questions et la correction restent bornées par le code ; elles ne remplacent pas le moteur FSRS.

## 3. Dépendances

- **SPEC-905** : moteur de dialogue, reprise, plafond de 12 tours, stockage des messages et correction par barème.
- **SPEC-701/702** : session du quiz global, rail des jeux et rendu des activités.
- **SPEC-402/406/411** : note FSRS, sélection des notions et persistance unique d'une réponse.
- **SPEC-508** : ton/langue du tuteur, registre d'actions et garde contre les instructions contenues dans les sources.

## 4. Règles métier couvertes

- **BR-MEM-11** : « Explique à un débutant » fait expliquer une notion par l'apprenant à un tuteur jouant un novice ; le tuteur évalue cette explication. Le jeu participe aux révisions plutôt qu'à la simple lecture du cours.

## 5. Exigences fonctionnelles

- **EF-1** — Pour une notion déjà enseignée et due, le quiz global peut choisir le format `explain_to_beginner` si aucune règle de lacune n'impose un autre format. Le rail le nomme « Explique à un débutant », indique la notion et la durée estimée ; il compte dans le plafond de la session comme les autres jeux.
- **EF-2** — La carte de jeu présente la notion à expliquer, un rappel bref « Le tuteur découvre le sujet : expliquez-le avec vos mots », les critères d'évaluation et un bouton « Commencer ». Elle n'affiche pas l'explication du cours avant la tentative, pour préserver le rappel actif.
- **EF-3** — Le tuteur novice pose des questions de compréhension et de clarification liées à la notion, sans révéler la réponse ou changer de rôle. L'apprenant répond en texte libre ; chaque tour est conservé et le dialogue se clôt par condition de fin, « Terminer » ou 12 tours maximum selon ADR-0208. Une fermeture/reconnexion reprend au dernier tour sans réponse inventée.
- **EF-4** — Le barème sur 10 couvre exactitude, clarté et exemple concret, avec poids configurés dans le scénario et total exact 10. Le tuteur propose points, exemples de formulation et une notion à revoir ; le code borne les points, vérifie les tours cités et produit un score final.
- **EF-5** — Le score final est converti une seule fois en réussite/échec selon le seuil du jeu dans `packages/config/src/product.ts`, puis en note FSRS par la fonction SPEC-402 ; la date due et la maîtrise sont mises à jour par SPEC-411. Une tentative inachevée ou une correction invalide ne modifie pas FSRS.
- **EF-6** — Le résultat affiche score, trois critères, retour du tuteur, date prévue de révision et actions « Revoir le cours », « Réessayer » ou « Continuer ». Une notion ratée peut déclencher la détection de lacune existante ; le jeu n'invente pas une nouvelle catégorie de lacune.
- **EF-7** — Le jeu apparaît dans les statistiques et l'historique du quiz global sous son format propre. En mode micro-séance, il est exclu si sa durée prévue dépasserait le plafond ; la session sélectionne alors un autre format disponible.

## 6. Exigences techniques

- **ET-1** — Le registre de formats de `packages/contracts/src/review.ts` ajoute `explain_to_beginner` et un `ScenarioDialogue` spécialisé avec `notionId`, `rubric` et version. Les variantes d'instruction tuteur sont des fixtures/prompts versionnés ; aucun texte de réponse correcte n'est injecté dans le message visible avant la fin.
- **ET-2** — `packages/learning-engine` reçoit le format, la durée prévue et la liste des formats autorisés comme entrées ; le tirage reste pur, déterministe et sans import de `packages/config` ni appel IA. Le service résout les paramètres et exclut ce format quand une autre règle impose un jeu ou le plafond micro est insuffisant.
- **ET-3** — Le service de jeu réutilise les routes de dialogue SPEC-905 et ajoute l'association `reviewSessionId`, `itemId`, `notionId`. La soumission finale écrit `review_logs`, `notion_states` et `daily_activity` dans une transaction idempotente sur `attemptId`; elle émet `review/answered` une seule fois.
- **ET-4** — La conversion score→justesse/note est une fonction pure testée aux bornes. Le score et la note restent séparés dans le DTO ; une réponse IA non conforme ne peut pas écrire directement une note FSRS.
- **ET-5** — Le composant du rail et la carte de jeu utilisent `@learny/ui`, rôles et labels accessibles, `aria-live` pour le prochain tour, focus conservé après envoi ; tous les libellés fixes sont dans `apps/web/messages/fr.ts`.
- **ET-6** — Les tests du fournisseur utilisent `LLM_MODE=mock`, deux scénarios (explication claire et confuse) et un scénario de sortie invalide ; les chaînes d'apport sont balisées comme données selon BR-IA-10.

## 7. Comportements attendus et cas limites

- **CL-1** — Notion pas encore enseignée ou non autorisée : le format n'est pas proposé.
- **CL-2** — Micro-séance presque pleine : le jeu est exclu plutôt que tronqué sans conclusion.
- **CL-3** — Question du tuteur répétée ou hors sujet : sortie rejetée et reprise selon SPEC-905, sans tour supplémentaire compté.
- **CL-4** — Douzième tour atteint : correction déclenchée, treizième refusé côté serveur.
- **CL-5** — Fermeture après un message apprenant : reprise sans double message ni double réponse.
- **CL-6** — Correction invalide/IA indisponible : tentative reprenable, pas de score ni mise à jour FSRS.
- **CL-7** — Double soumission du résultat : un seul `review_log`, une seule modification d'échéance et de série.
- **CL-8** — Changement de ton/profil pendant tentative : la version de scénario reste fixe ; les nouveaux messages utilisent le ton actuel sans réécrire les anciens.

## 8. Instructions d'implémentation

1. Ajouter le format au contrat et au tirage déterministe avec exclusion micro/format imposé ; tests de bornes et ordre stable. Commit `feat(SPEC-904): sélectionne le jeu d'explication`.
2. Spécialiser le dialogue SPEC-905 avec rôle novice, barème et prompts/fixtures ; écrire la conversion score/FSRS et la persistance idempotente. Commit `feat(SPEC-904): évalue l'explication et révise la notion`.
3. Ajouter le rail, la carte de jeu et le résultat au quiz global ; états chargement, reprise et échec. Commit `feat(SPEC-904): affiche Explique à un débutant`.
4. Tester intégration, e2e filmé, visuel et non-régression des cinq jeux V1 ; exécuter `validate.mjs` et consigner les preuves réelles.

## 9. Fichiers et composants concernés

- **Créés** : `packages/services/src/review/explain-to-beginner.ts`, `packages/services/src/review/explain-to-beginner.test.ts`, `packages/services/test/integration/explain-to-beginner.test.ts`, `packages/tutor/prompts/explain-to-beginner.md`, `packages/llm/fixtures/tutor/explain-beginner-*.json`, `apps/web/components/review/explain-to-beginner.tsx`, `apps/web/components/review/explain-result.tsx`, `apps/web/e2e/specs/p9/spec-904.spec.ts`.
- **Modifiés** : `packages/contracts/src/review.ts`, `packages/learning-engine/src/session/format-choice.ts`, `packages/services/src/review/build-session.ts`, `packages/services/src/dialogue/`, `packages/config/src/product.ts`, rail/écran quiz global SPEC-701/702, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : moteur FSRS SPEC-402, persistance SPEC-411, dialogue SPEC-905, `QuizGlobal.dc.html` pour régions communes.

## 10. Interface et conformité visuelle

Mode `tokens` dans SCR-10. Le rail conserve sa structure de `QuizGlobal.dc.html` et ajoute « Explique à un débutant » avec une icône et la notion. La carte de dialogue se place dans le panneau principal à la place d'une question classique : en-tête de notion, critère de réussite, messages alignés par rôle, champ « Votre explication » et bouton « Envoyer ». Le résultat reprend le motif des cartes de correction du quiz global. `data-testid` : `beginner-game-rail`, `beginner-game-prompt`, `beginner-game-messages`, `beginner-game-send`, `beginner-game-result`.

Les régions V1 du rail sont comparées à la référence quand elles sont inchangées (≤ 12 %) ; le nouveau panneau passe jetons, structure, axe et `toHaveScreenshot('explique-debutant.png', { maxDiffPixelRatio: 0.01 })` desktop/mobile. Le focus revient au champ après chaque réponse, et l'état en cours est annoncé sans lecture automatique intrusive.

## 11. Critères d'acceptation

- **CA-1** — Le tirage choisit `explain_to_beginner` uniquement pour une notion enseignée, due, sans format imposé et avec temps disponible ; il reste déterministe.
- **CA-2** — Le dialogue novice respecte rôle et plafond de 12 tours, reprend après fermeture et conserve les messages sans doublon.
- **CA-3** — Une correction valide produit score/barème, une seule mise à jour FSRS/maîtrise et une date due ; une correction invalide n'en produit aucune.
- **CA-4** — Le jeu est exclu d'une micro-séance trop courte et ne régresse pas les formats V1 ou les garde-fous de lacune.
- **CA-5** — Le rail et le panneau passent axe, jetons, structure et captures desktop/mobile, avec vidéo e2e.

## 12. Plan de tests

- **Unitaires** — `explain-to-beginner.test.ts`, `describe('[SPEC-904] novice explanation')` : tirage, exclusion, score/justesse, plafond et ordre déterministe (CA-1, CA-3, CA-4).
- **Intégration** — `test/integration/explain-to-beginner.test.ts`, `describe('[SPEC-904] novice dialogue lifecycle')` : dialogue mock, fermeture/reprise, barème, double soumission, FSRS unique, sortie invalide (CA-2, CA-3).
- **End-to-end** — `apps/web/e2e/specs/p9/spec-904.spec.ts`, `test('explique une notion à un débutant @SPEC-904')` : ouvrir le quiz global, choisir le jeu, jouer trois tours, terminer, lire score/date et consulter l'historique ; vidéo (CA-2, CA-3, CA-5).
- **Visuel** — `test('jeu novice conforme @SPEC-904 @visual')` : rail, carte, résultat, jetons, axe et captures desktop/mobile ≤ 1 % (CA-5).
- **Non-régression** — SPEC-402, 406, 701, 702, 703, 716 et 905.

| Critère | Tests |
|---|---|
| CA-1 | unitaires tirage |
| CA-2 | intégration dialogue ; e2e |
| CA-3 | unitaires score ; intégration FSRS ; e2e |
| CA-4 | unitaires micro ; tests SPEC-701/703/716 |
| CA-5 | e2e `@SPEC-904 @visual` |

## 13. Preuves attendues

`evidence/SPEC-904/` contient rapports, sortie de tirage avec seed, trace anonymisée des tours, score par critère, preuve d'une seule mise à jour FSRS, vidéo et captures du jeu, `checks.json`, `acceptance.md`. Les réponses tuteur sont des fixtures mock nommées.

## 14. Définition de terminé

Toutes les conditions de `docs/engineering/testing.md` §7 passent. Le jeu respecte plafond, rappel actif, notation validée et persistance unique ; les jeux V1 et la micro-séance restent verts.

## 15. Décisions et hypothèses

ADR-0208 fixe le contrat du dialogue, ses 12 tours et sa notation ; ADR-0020 réserve FSRS et tirage au moteur déterministe. La réussite du jeu est calculée par le code à partir du score validé, jamais décidée directement par le modèle. Le format est réservé à V2 selon ADR-0074.
