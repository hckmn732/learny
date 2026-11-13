---
id: SPEC-614
title: "Examen blanc"
phase: P6
priority: V1
depends_on: [SPEC-611, SPEC-407]
business_rules: [BR-PRA-02, BR-PRA-03, BR-PRA-04, BR-PRA-05]
screens: [SCR-11]
adrs: [ADR-0028]
visual: mockup
---

# SPEC-614 — Examen blanc

## 1. Objectif

Format (extraction depuis un guide, confirmation, défaut), introduction, épreuve sans aide (coquille masquée, chronomètre serveur, palette, marquage, confirmation, soumission automatique, reprise), résultats (global, étudiés, diagnostic, par module, lacunes, plan), revue filtrable, planification. Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. Écran concerné : SCR-11 : `/formations/[fid]/examen-blanc` , `/formations/[fid]/examen-blanc/[attemptId]`. Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-611** — Quiz de validation : passage ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-407** — Planificateur ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les services applicatifs utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201, le client utilisateur soumis à RLS de SPEC-113 et les événements de SPEC-203. Les composants interactifs réutilisent `@learny/ui` et les textes passent par `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-PRA-02** — Examen blanc : reproduit le format officiel (nombre de questions, durée, seuil) quand il est connu, extrait d'un apport (guide de certification) et confirmé par l'apprenant ; sinon : 20 questions, 2 minutes par question, seuil 70 %, chronométré, sans aide, corrigé à la fin.
- **BR-PRA-03** — Pendant l'examen : menu, en-tête, tuteur et cours masqués ; chronomètre visible (orange sous 5 min) ; navigation libre ; marquage « à revoir » ; confirmation avant de terminer (questions sans réponse et marquées) ; soumission automatique à la fin du temps ; la réouverture de la page reprend l'examen avec le temps restant réel.
- **BR-PRA-04** — Résultats d'examen : score global et seuil, score sur les modules étudiés, score diagnostic des modules non étudiés (compté à part, non pénalisant), détail par module, erreurs ajoutées aux lacunes (modules étudiés uniquement), plan du tuteur, revue des réponses filtrable (toutes / erreurs) avec explication.
- **BR-PRA-05** — Si un objectif « examen » existe, deux examens blancs sont planifiés : à la fin de l'avant-dernier module et le dernier jour de la formation ; un examen blanc de diagnostic peut être lancé à tout moment depuis le programme.

## 5. Exigences fonctionnelles

- **EF-1** — Si un guide fournit un format d’examen, extraire nombre de questions, durée et seuil, puis demander confirmation ; sinon utiliser 20 questions, 2 minutes par question, seuil 70 %.
- **EF-2** — Pendant l’épreuve, masquer menu, en-tête, tuteur et cours ; afficher chronomètre serveur, palette, réponses et marqueurs « à revoir ». Le chronomètre devient orange sous 5 minutes, et la soumission à expiration est automatique.
- **EF-3** — La fin volontaire demande confirmation avec nombre de questions sans réponse et marquées ; rouvrir la page reprend les réponses et le temps restant réel, jamais un nouveau délai.
- **EF-4** — Le résultat sépare score global, modules étudiés et diagnostic non pénalisant des modules non étudiés ; il affiche détail par module, lacunes des seuls modules étudiés, plan du tuteur et revue filtrée toutes/erreurs.
- **EF-5** — Pour un objectif examen, deux examens blancs sont planifiés : fin de l’avant-dernier module et dernier jour. Un diagnostic reste lançable depuis le programme.
- **EF-6** — Les règles métier BR-PRA-02, BR-PRA-03, BR-PRA-04, BR-PRA-05 de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.

## 6. Exigences techniques

- **ET-1** — Chaque lecture et mutation utilise le client de l’utilisateur soumis à RLS ; un autre utilisateur reçoit 404. Les entrées/sorties passent par les schémas Zod de `packages/contracts`, et les routes renvoient `application/problem+json` en erreur.
- **ET-2** — Les écritures multi-tables sont transactionnelles ; un événement est émis après commit et une clé d’idempotence empêche une double transition. Les dates passent par l’horloge injectable et le fuseau IANA du profil.
- **ET-3** — `ExamFormatSchema` porte `questionCount`, `secondsPerQuestion` ou durée totale, seuil et source `guide|default` ; format extrait non confirmé ne lance aucune épreuve. `ExamAttempt` persiste `startedAt`, `deadlineAt`, réponses, marqueurs et statut.
- **ET-4** — Le temps restant est `max(0, deadlineAt - clock.now())`, calculé côté serveur à chaque lecture et soumission. Le serveur refuse une réponse après échéance ; le job de fin est idempotent.
- **ET-5** — La correction répartit les questions par module et exclut du score étudié les notions non vues ; seuls les échecs étudiés alimentent `gap_events`. Les liens de revue conservent la version de question jouée.

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Onglet fermé puis rouvert à 10 minutes restantes : la même échéance est reprise.
- **CL-4** — Soumission simultanée du bouton et du job de délai : un seul résultat persiste.
- **CL-5** — Guide de format incomplet : afficher les valeurs proposées et demander confirmation ; ne pas supposer le format officiel.

## 8. Instructions d'implémentation

1. Définir format officiel proposé/confirmé et défaut 20 questions, 2 min chacune, seuil 70 %. Commit `feat(SPEC-614): définit les contrats`.
2. Implémenter tentative persistante, échéance serveur, réponse libre, marquage et soumission idempotente à la fin du temps. Commit `feat(SPEC-614): implémente les services`.
3. Corriger scores étudiés/diagnostic séparément, ajouter les seules erreurs étudiées aux lacunes et construire la revue filtrable. Commit `feat(SPEC-614): construit le parcours`.
4. Composer layout d’épreuve sans coquille et résultats conformes à `ExamenBlanc.dc.html`; planifier deux examens si objectif examen. Commit `test(SPEC-614): vérifie les cas`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-614`, renseigner les preuves réellement produites puis `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/mock-exams.ts`, `packages/services/src/mock-exams/{format,attempt,timer,grade,review}.ts`, `packages/services/test/integration/mock-exam.test.ts`, `apps/web/app/(exam)/formations/[fid]/examen-blanc/{page,[attemptId]/page}.tsx`, `apps/web/components/mock-exam/{ExamTimer,QuestionPalette,SubmitDialog,ExamResults}.tsx`, `apps/web/e2e/specs/p6/mock-exam.spec.ts`.
- **Modifiés** : `packages/jobs/src/functions/exam-deadline.ts`, `packages/services/src/planning/index.ts`, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `specs/p6-parcours/SPEC-611-quiz-de-validation-passage.md`, `specs/p4-moteur/SPEC-407-planificateur.md`.

## 10. Interface et conformité visuelle

`ExamenBlanc.dc.html` : introduction/format, épreuve isolée, palette et chronomètre, dialogue de fin, résultats et revue. Vérifier que la coquille normale est réellement absente de l’état épreuve. `data-testid` : `exam-timer`, `exam-palette`, `exam-submit`, `exam-result`.

- **Contrôles** — Utiliser la référence du SCR-11 dans `design/references/` et mesurer ≤ 12 % de pixels différents ; vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — Sans guide, l’introduction affiche 20 questions, 40 minutes et seuil 70 % ; avec guide, le format reste inactif avant confirmation.
- **CA-2** — À moins de 5 minutes le compteur devient orange ; à l’échéance serveur la tentative est soumise une fois, même après rechargement.
- **CA-3** — Les erreurs d’un module non étudié apparaissent en diagnostic mais ne diminuent pas le score étudié et ne créent pas de lacune.
- **CA-4** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
- **CA-5** — L’écran respecte la maquette avec un écart ≤ 12 % ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

**Unitaires** (2 fichiers, `[SPEC-614]`) :
- `packages/services/src/mock-exams/timer.test.ts` — `[SPEC-614]` : 40 min par défaut, orange sous 5 min, rechargement et échéance au changement de fuseau.
- `packages/services/src/mock-exams/grade.test.ts` — `[SPEC-614]` : score étudié vs diagnostic, seuil, questions sans réponse, modules non vus exclus des lacunes.

**Intégration** (Supabase local, `LLM_MODE=mock`, `[SPEC-614]`) :
- `packages/services/test/integration/mock-exam.test.ts` — `[SPEC-614]` : guide confirmé, tentative/reprise, bouton et cron concurrents → un résultat, lacunes étudiées seulement, deux créneaux planifiés, RLS.

**End-to-end** (`apps/web/e2e/specs/p6/mock-exam.spec.ts`, vidéo) :
- **Scénario** — `examen blanc sans aide @SPEC-614` : ouvrir introduction 20/40/70, démarrer, répondre, marquer, recharger et vérifier temps restant, confirmer la fin.
- **Scénario** — `expiration et revue @SPEC-614` : avancer horloge, soumission automatique, voir scores séparés et filtre Erreurs.

**Visuel** — `test('conformité SPEC-614 @SPEC-614 @visual')` : `SCR-11-introduction`, `SCR-11-epreuve`, `SCR-11-resultat` desktop/mobile : coquille absente en épreuve, palette, compteur, tableau de résultats ; diff ≤ 12 %, axe, capture ≤ 1 %.

**Non-régression** — Rejouer `[SPEC-611]` et `@SPEC-611`, `[SPEC-407]` et `@SPEC-407` et les suites complètes unitaires/intégration.

| Critère | Tests |
|---|---|
| CA-1 | unitaires et intégration ciblés ; e2e `@SPEC-614` |
| CA-2 | unitaires et intégration ciblés ; e2e `@SPEC-614` |
| CA-3 | unitaires et intégration ciblés ; e2e `@SPEC-614` |
| CA-4 | intégration RLS/idempotence, e2e erreur |
| CA-5 | `@SPEC-614 @visual`, axe, vidéo |

## 13. Preuves attendues

`evidence/SPEC-614/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-5. Conserver la comparaison côte à côte et le diff avec la référence de maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- **ADR-0028 — Examens blancs** : Le format (questions, durée, seuil) est extrait par le tuteur d'un apport `exam_guide` puis confirmé par l'apprenant ; à défaut : 20 questions, 2 min/question, seuil 70 %. Planification par défaut quand l'objectif `exam` existe : fin de l'avant-dernier module et dernier jour. Examen diagnostic possible à tout moment ; questions des modules non étudiés comptées à part. Soumission automatique à échéance, côté serveur (`deadline_at`).
- **ADR-0317 — Décisions d’implémentation de l’examen blanc** : questions corrigées par le code uniquement, format respecté dans la limite de la banque, marqueurs dans `attempts.review_feedback`, positions diagnostiques exclues de `gap_events`, réconciliation idempotente des deux créneaux `mock_exam`.
- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification du périmètre.

