---
id: SPEC-905
title: Mises en situation
phase: P9
priority: V2
depends_on: [SPEC-508, SPEC-503]
business_rules: [BR-PRA-06]
screens: []
adrs: [ADR-0208]
visual: tokens
---

# SPEC-905 — Mises en situation

## 1. Objectif

Ajouter une activité de dialogue scénarisé où l'apprenant joue un rôle dans une situation professionnelle, reçoit des réponses du tuteur et une correction selon un barème. La situation est planifiée pour les objectifs « être opérationnel » ou « dialoguer avec des experts » et peut être reprise sans perdre les tours déjà joués.

## 2. Contexte

Lire BR-PRA-06 et BR-PRA-01 dans `docs/product/business-rules.md`, `docs/product/vision.md` §2–§5, `docs/architecture/ai.md` §3–§5, `docs/architecture/data-model.md` §4–§6, SPEC-501/503/508/613/407 et ADR-0208. Les exercices V1 corrigent une production ; la mise en situation V2 entraîne la décision et l'explication dans un dialogue. Le modèle propose scénario, réponse et correction, mais les services valident chaque action et calculent le score final. Aucune maquette dédiée n'existe : l'interface suit les motifs de `Exercice.dc.html` et les jetons de `@learny/ui`.

## 3. Dépendances

- **SPEC-508** : boucle tuteur, actions strictes, ton/langue et garde contre injection de consignes.
- **SPEC-503** : registre/rendu des briques et composants de réponse.
- **SPEC-407/613** : planificateur et service d'exercice pour affecter une situation à un module et une notion.
- **SPEC-411** : persistance de maîtrise et de lacunes après une tentative évaluée ; aucune mise à jour sur un tour incomplet.
- **IA** : `LLM_MODE=mock` et fixtures déterministes en test ; un modèle personnel défaillant suit ADR-0013, sans bascule payante implicite.

## 4. Règles métier couvertes

- **BR-PRA-06** : une mise en situation est un dialogue scénarisé avec rôle, contexte, objectif, condition de fin et critères ; elle est jouée avec le tuteur puis évaluée par barème.

## 5. Exigences fonctionnelles

- **EF-1** — Pour une formation dont l'objectif comprend `operational` ou `dialogue`, le tuteur peut proposer une activité `scenario_dialogue` attachée à un module et à 1–3 notions déjà enseignées. Le scénario affiche rôle de l'apprenant, rôle du tuteur, contexte, objectif, condition de fin et 2–5 critères de correction totalisant 10 points ; l'apprenant peut refuser ou commencer.
- **EF-2** — Le planificateur place une mise en situation dans un créneau compatible après le cours correspondant ; elle apparaît dans le module et l'agenda avec durée prévue. Une formation uniquement orientée examen n'en reçoit pas automatiquement, mais l'apprenant peut en lancer une depuis le module.
- **EF-3** — La page de dialogue présente le contexte et les critères avant le premier tour, puis un historique ordonné de messages. L'apprenant envoie un message texte, le tuteur répond dans le ton et la langue des cours, sans révéler le barème caché de correction. Un message envoyé deux fois avec la même clé d'idempotence n'apparaît qu'une fois.
- **EF-4** — La tentative se termine si la condition de fin structurée est validée, si l'apprenant choisit « Terminer » ou après 12 tours maximum (ADR-0208). Un abandon avant le premier tour ne produit aucun score ; un abandon après des tours conserve la tentative reprenable jusqu'à sa clôture explicite.
- **EF-5** — À la fin, le tuteur propose pour chaque critère une note bornée, une justification citant les tours concernés, un point fort, un point à améliorer et une prochaine action. Le code vérifie la somme ≤ 10, les références de tours et la conformité du schéma ; le score final est la somme validée, jamais une valeur libre du modèle.
- **EF-6** — La correction met à jour la maîtrise des notions par le service SPEC-411 une seule fois pour la tentative ; une faiblesse crée/maintient une lacune selon le moteur déterministe. La page affiche la maîtrise avant/après et propose « Revoir le cours », « Réessayer » ou « Continuer » selon le résultat.
- **EF-7** — Une tentative en cours reste accessible après fermeture, changement de navigateur ou panne IA. En cas de panne, les messages précédents restent visibles et l'envoi peut être réessayé ; aucune réponse ou note de tuteur n'est inventée.

## 6. Exigences techniques

- **ET-1** — Le schéma `ScenarioDialogue` dans `packages/bricks` ou `packages/contracts` porte `role`, `tutorRole`, `context`, `objective`, `endCondition`, `notionIds`, `rubric[]` et `version`. Zod exige 2–5 critères, poids entiers positifs dont la somme vaut exactement 10, 1–3 notions appartenant au module et textes non vides bornés.
- **ET-2** — Les tables/colonnes de tentative conservent `scenario_version`, `status` (`in_progress|grading|completed|failed`), `turns` ordonnés, `score`, `graded_at` et une clé d'idempotence par message. La correction lie le résultat à la version de scénario jouée ; aucune modification de scénario ne réécrit une tentative passée.
- **ET-3** — Routes API sous `/api/v1/activities/:aid/dialogue`: `POST /attempts` (201 ou reprise de tentative ouverte), `GET /attempts/:id`, `POST /attempts/:id/messages` (réponse tuteur), `POST /attempts/:id/finish`, `GET /attempts/:id/result`. Les entrées/sorties sont Zod et les erreurs `problem+json`; ajouter les routes à `docs/architecture/api.md`.
- **ET-4** — `packages/services/src/dialogue/` valide propriété, état et plafond de tours dans une transaction, appelle `tutor.run(task='tutor')` seulement pour le prochain tour et la correction, puis persiste par `userDb(ctx)`. La sortie de tuteur est considérée non fiable jusqu'à validation ; aucun SDK fournisseur n'est importé dans l'UI ou le service.
- **ET-5** — Le service de notation demande une sortie structurée avec `criterionId`, `points`, `evidenceTurnIds`, `explanation`; il vérifie `0≤points≤weight`, somme et IDs présents, puis émet une seule mise à jour d'apprentissage identifiée par `attemptId`.
- **ET-6** — Le client affiche états chargement/erreur/reprise, `aria-live` pour nouvelle réponse et focus conservé dans le champ après envoi ; les textes fixes sont dans `apps/web/messages/fr.ts`.

## 7. Comportements attendus et cas limites

- **CL-1** — Objectif hors `operational|dialogue` : pas de planification automatique ; lancement manuel permis si notions enseignées.
- **CL-2** — Douzième tour atteint : bouton d'envoi désactivé et correction déclenchée ; treizième message refusé côté serveur.
- **CL-3** — Double envoi après perte de réponse réseau : une seule ligne de message et une seule réponse du tuteur.
- **CL-4** — Tuteur renvoie un score > poids ou cite un tour inexistant : correction refusée, tentative en `failed` reprenable, aucune maîtrise mise à jour.
- **CL-5** — Panne IA après stockage du message apprenant : réponse non inventée, même tour repris avec la même clé.
- **CL-6** — Un autre utilisateur connaît `attemptId` : 404/403 selon contrat, aucun message ou barème livré.
- **CL-7** — Scénario modifié après démarrage : tentative continue avec la version figée.

## 8. Instructions d'implémentation

1. Définir le schéma, le barème et les contrats de tentative ; migrations et tests RLS pour messages/notes. Commit `feat(SPEC-905): définit les dialogues scénarisés`.
2. Créer les services démarrer/envoyer/terminer/noter avec transaction et idempotence ; fixtures tuteur pour succès, panne et score invalide. Commit `feat(SPEC-905): exécute et corrige les mises en situation`.
3. Brancher la planification et l'interface module/agenda/dialogue/résultat avec les composants UI et les textes français. Commit `feat(SPEC-905): affiche les mises en situation`.
4. Écrire unitaires, intégration, e2e filmés et visuels ; rejouer moteur d'apprentissage et sécurité, valider les preuves réelles.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/scenario-dialogue.ts`, `packages/services/src/dialogue/start.ts`, `packages/services/src/dialogue/send-message.ts`, `packages/services/src/dialogue/finish.ts`, `packages/services/src/dialogue/grade.ts`, `packages/services/src/dialogue/grade.test.ts`, `packages/services/test/integration/scenario-dialogue.test.ts`, `packages/tutor/prompts/scenario-dialogue.md`, `packages/llm/fixtures/tutor/scenario-*.json`, `apps/web/app/(app)/formations/[fid]/modules/[mid]/situations/[aid]/page.tsx`, `apps/web/components/dialogue/scenario-chat.tsx`, `apps/web/e2e/specs/p9/spec-905.spec.ts`.
- **Modifiés** : schéma `activities`/`attempts` et migrations associées, `packages/bricks/src/registry.ts`, `packages/jobs` planification, `docs/architecture/api.md`, `apps/web/messages/fr.ts`, écran Module et Agenda.
- **Lus / réutilisés** : `tutor.run`, `userDb(ctx)`, SPEC-407/411, `@learny/ui`, `Exercice.dc.html` comme motif visuel.

## 10. Interface et conformité visuelle

Mode `tokens`, sans maquette dédiée. La page reprend le motif d'`Exercice.dc.html` : sur-titre « Mise en situation », titre du scénario, carte de contexte, bandeau rôle/objectif, discussion et carte de correction. `data-testid` : `scenario-context`, `scenario-objective`, `scenario-messages`, `scenario-send`, `scenario-result`. Le barème complet est visible avant lancement ; pendant le dialogue, seule la consigne reste affichée. Sur mobile, les messages occupent une colonne, le champ reste accessible sans masquer le dernier tour.

`expectTokens` contrôle cartes, messages, boutons et focus ; les tests vérifient ordre, chargement/erreur/reprise, axe puis `toHaveScreenshot('mise-en-situation.png', { maxDiffPixelRatio: 0.01 })` à 1440×900 et 390×844. Aucune image de maquette V1 n'est utilisée comme référence de cet écran nouveau.

## 11. Critères d'acceptation

- **CA-1** — Un scénario valide a 2–5 critères totalisant 10 et se planifie seulement automatiquement pour les objectifs opérationnel/dialogue après le cours.
- **CA-2** — La tentative accepte au plus 12 tours, conserve l'ordre et reprend après fermeture/panne sans double message.
- **CA-3** — La correction est bornée par critère, cite des tours réels et met à jour la maîtrise une seule fois ; une sortie invalide ne produit aucun score.
- **CA-4** — Un autre utilisateur n'accède pas aux tours, scénario ou résultat ; aucun appel IA réel n'est fait en test.
- **CA-5** — L'écran dialogue/résultat passe axe, jetons, structure et captures desktop/mobile, avec vidéo e2e.

## 12. Plan de tests

- **Unitaires** — `grade.test.ts`, `describe('[SPEC-905] scenario grading')` : barème 10, poids, IDs de tours, plafond 12 et condition de fin (CA-1, CA-2, CA-3).
- **Intégration** — `scenario-dialogue.test.ts`, `describe('[SPEC-905] dialogue lifecycle')` : planification selon objectif, start/send/finish, double clé, panne mock, reprise, RLS et unique mise à jour de maîtrise (CA-1–CA-4).
- **End-to-end** — `apps/web/e2e/specs/p9/spec-905.spec.ts`, `test('joue une mise en situation @SPEC-905')` : ouvrir depuis le module, lire contexte/barème, jouer trois tours, fermer/revenir, terminer, lire correction ; vidéo (CA-2, CA-3, CA-5).
- **Visuel** — `test('dialogue scénarisé conforme @SPEC-905 @visual')` : jetons, structure, axe, captures desktop/mobile ≤ 1 % (CA-5).
- **Non-régression** — SPEC-503, 508, 613, 407, 411 et sécurité SPEC-805.

| Critère | Tests |
|---|---|
| CA-1 | unitaires schéma ; intégration planification |
| CA-2 | unitaires plafond ; intégration reprise ; e2e |
| CA-3 | unitaires note ; intégration maîtrise ; e2e |
| CA-4 | intégration RLS/mock |
| CA-5 | e2e `@SPEC-905 @visual` |

## 13. Preuves attendues

`evidence/SPEC-905/` contient rapports, trace d'une tentative mock avec tours anonymisés, score par critère et unique mise à jour de maîtrise, vidéo/captures du dialogue, `checks.json` et `acceptance.md`. La fixture IA est nommée dans le rapport ; aucune réponse live n'est revendiquée.

## 14. Définition de terminé

Les conditions de `docs/engineering/testing.md` §7 passent. Le barème et le nombre de tours sont imposés par le code, les tentatives interrompues restent reprenables, les données privées demeurent isolées et les exercices V1 ne régressent pas.

## 15. Décisions et hypothèses

ADR-0208 fixe le contrat commun des dialogues, le plafond de tours et la notation. ADR-0021 impose la validation des actions du tuteur ; ADR-0013 empêche une bascule payante implicite. Les mises en situation ne sont disponibles qu'en V2 selon ADR-0074.
