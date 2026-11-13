---
id: SPEC-513
title: "Banques de questions"
phase: P5
priority: V1
depends_on: [SPEC-508, SPEC-501, SPEC-511]
business_rules: [BR-MEM-07, BR-IA-13]
screens: []
adrs: [ADR-0026]
visual: demo
---

# SPEC-513 — Banques de questions

## 1. Objectif

Génération par notion et format (≥ 4 variantes), en lot nocturne, déclenchement à la génération du cours et à l'épuisement, distracteurs annotés, empreintes, validation des briques. La livraison est vérifiable par les contrats, les états d’interface et les critères de la section 11.

## 2. Contexte

Lire `docs/product/business-rules.md` (BR-MEM-07, BR-IA-13), `docs/architecture/ai.md`, `docs/architecture/data-model.md` §3, §5 et §9, `docs/architecture/overview.md` §4, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. ADR applicables : ADR-0026. Les appels modèle passent par `@learny/llm` ; les tests emploient seulement `LLM_MODE=mock`.

## 3. Dépendances

- **SPEC-508** — action prepare_question_bank.
- **SPEC-501** — briques et empreintes valides.
- **SPEC-511** — contexte du cours privé.
- Les tests automatiques utilisent `LLM_MODE=mock`, des fixtures versionnées et une horloge fixée à `2026-11-11T12:20:00Z`. Aucune clé personnelle ni appel réel à un fournisseur n’entre dans les preuves.

## 4. Règles métier couvertes

- **BR-MEM-07** — Banques de questions : plusieurs variantes par notion et par format (au moins 4 variantes par notion), générées en lot la nuit précédant le besoin ; régénérées quand l'apprenant a vu toutes les variantes. Les banques sont **propres à chaque apprenant** (issues de son cours privé).
- **BR-IA-13** — Le contexte stable d'une formation (instructions, outils, programme) est mis en cache côté fournisseur quand c'est possible ; les générations non urgentes (banques de questions) passent par l'API de traitement par lots.

## 5. Exigences fonctionnelles

- **EF-1** — Créer pour chaque apprenant et chaque notion de son cours privé au moins quatre variantes valides par format pertinent, avec empreinte de contenu et distracteurs annotés par notion confondue.
- **EF-2** — Déclencher la préparation à `course/generated` et lors de l’épuisement déclaré par SPEC-405/406 ; générer les banques non urgentes en lot la nuit précédant le besoin.
- **EF-3** — Ne partager ni question, ni empreinte visible, ni passage source entre membres d’un groupe ; chaque banque dépend de la version du cours de son propriétaire.
- **EF-4** — Valider chaque brique par SPEC-501 et retirer les doublons d’empreinte avant d’insérer la banque ; une brique invalide suit les deux corrections de SPEC-508 puis échoue lisiblement.
- **EF-5** — Quand toutes les variantes d’une notion et d’un format sont vues, demander une nouvelle génération et marquer l’épuisement ; ne pas reposer une empreinte déjà vue en attendant.

## 6. Exigences techniques

- **ET-1** — `prepareQuestionBank(ctx, {notionId, formats, courseVersionId, reason})` lit les passages du seul propriétaire via SPEC-511, appelle `tutor.prepare_question_bank` et persiste des `bricks/brick_versions` après validation.
- **ET-2** — La clé de job regroupe utilisateur, notion, format et version de cours ; une seconde livraison n’ajoute pas les mêmes empreintes.
- **ET-3** — Le lot fournisseur suit BR-IA-13 et ADR-0026 ; le mock renvoie quatre variantes par format avec distracteurs annotés et empreintes stables.
- **ET-4** — Les entrées et sorties sont validées par Zod ; l’accès aux données passe par le client utilisateur et RLS, les opérations système par un service explicitement autorisé. Les secrets et contenus d’apports ne figurent pas dans les journaux.
- **ET-5** — Les scénarios de test utilisent des fixtures déterministes, un fournisseur simulé et l’horloge injectable. Les échecs externes rendent un code et un message sûrs, sans bascule payante automatique ni résultat inventé.

## 7. Comportements attendus et cas limites

- **CL-1** — Cours privé absent : aucune banque générée et erreur `COURSE_NOT_READY`.
- **CL-2** — Moins de quatre variantes uniques après deux corrections : banque incomplète signalée, pas de statut prêt.
- **CL-3** — Deux jobs concurrents pour même notion/version : empreintes uniques, aucun doublon.
- **CL-4** — Version de cours remplacée : conserver les tentatives liées à l’ancienne version, générer banque de la nouvelle.
- **CL-5** — Fournisseur lot indisponible : job différé/repris, aucune question fictive.

## 8. Instructions d'implémentation

1. Définir les contrats Zod et les fixtures `LLM_MODE=mock` du scénario ; vérifier les décisions ADR avant toute nouvelle valeur.
2. Implémenter `packages/services/src/questions/prepare-bank.ts` et ses services en séparant validation, accès aux données et appel à `@learny/llm`. Commits atomiques `feat(SPEC-513): …`.
3. Ajouter la page de démonstration SDD avec états succès, absence de données et erreur sûre ; aucune clé ni donnée privée n’est rendue.
4. Écrire tests unitaires, intégration avec RLS et e2e filmé, puis contrôle visuel et axe. Commit `test(SPEC-513): …`.
5. Exécuter `validate.mjs SPEC-513`, renseigner chaque CA avec une preuve réelle et terminer par `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/services/src/questions/prepare-bank.ts`, `packages/services/src/questions/fingerprint.ts`, `packages/services/src/questions/prepare-bank.test.ts`, `packages/jobs/src/functions/prepare-question-bank.ts`, `packages/services/test/integration/question-bank.test.ts`, `apps/web/components/sdd-demos/spec-513.tsx`, `apps/web/e2e/specs/p5/spec-513.spec.ts`.
- **Modifiés** : `packages/contracts/src/index.ts`, `packages/jobs/src/functions/index.ts` si un job est introduit, `apps/web/app/%5Fdev/sdd/registry.ts`, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `@learny/llm`, `@learny/contracts`, `@learny/db`, fixtures mock et services des dépendances ; dépendances SPEC-508, SPEC-501, SPEC-511.

## 10. Interface et conformité visuelle

Mode `demo`. Page SDD : notion et version de cours fictives, tableau de quatre variantes avec format/statut/distracteurs, compteur vues/disponibles et état épuisé ; aucun passage privé rendu en clair. Page `/_dev/sdd/SPEC-513` : afficher le scénario simulé, le contrat d’entrée, le résultat validé et un échec lisible, sans clé ni contenu privé. Mode `demo` : jetons, structure, axe et capture desktop/mobile à 1 %. Aucun appel à un fournisseur réel dans le navigateur.

## 11. Critères d'acceptation

- **CA-1** — Une notion et un format pertinents du mock donnent au moins quatre variantes valides d’empreintes distinctes.
- **CA-2** — Un second membre du groupe ne peut lire ni utiliser la banque du premier ; les sources renvoient à son cours privé.
- **CA-3** — Après épuisement, une nouvelle génération est demandée sans resservir une empreinte déjà vue.
- **CA-4** — Deux livraisons du même job ou deux jobs concurrents n’insèrent pas de doublon ; brique invalide reste exclue.
- **CA-5** — La démonstration montre variantes, empreintes masquées et état d’épuisement, avec vidéo, axe et `@visual`.

## 12. Plan de tests

- **Unitaires** — `packages/services/src/questions/prepare-bank.test.ts`, `describe('[SPEC-513] Banques de questions')` : quatre variantes, empreintes et validation, validation Zod et erreurs simulées (CA-1 à CA-3).
- **Intégration** — `packages/services/test/integration/question-bank.test.ts`, `describe('[SPEC-513] service')` : job en lot idempotent et isolation RLS, RLS de deux utilisateurs, fournisseur simulé et reprise idempotente (CA-2 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p5/spec-513.spec.ts`, `test('Banques de questions @SPEC-513')` : préparation de la banque puis épuisement simulé dans la démonstration, vidéo et capture (CA-1, CA-5).
- **Visuel** — `test('Banques de questions @SPEC-513 @visual')` : jetons, structure, axe, desktop/mobile à 1 % (CA-5).
- **Non-régression** — rejouer les étiquettes `[SPEC-508]` / `@SPEC-508`, `[SPEC-501]` / `@SPEC-501`, `[SPEC-511]` / `@SPEC-511`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; e2e |
| CA-2 | unitaires ; intégration |
| CA-3 | unitaires ; intégration |
| CA-4 | intégration |
| CA-5 | e2e ; @visual |

## 13. Preuves attendues

`evidence/SPEC-513/` contient `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, une vidéo réelle du scénario `@SPEC-513`, captures desktop/mobile, comparaisons visuelles applicables et `acceptance.md` reliant chaque CA au test et à sa sortie. Aucune capture ou réussite n’est déclarée sans fichier effectivement généré.

## 14. Définition de terminé

La définition commune de `docs/engineering/testing.md` §7 est remplie : lint, typecheck, build, tests unitaires et d’intégration filtrés, e2e avec vidéo, au moins un test `@visual`, axe, preuves et absence de régression. Le fournisseur simulé couvre le succès et les erreurs ; aucune clé ou donnée privée n’apparaît dans les preuves et aucun appel réel n’a lieu en CI.

## 15. Décisions et hypothèses

Décisions appliquées : ADR-0026, ADR-0301. Les valeurs normatives viennent des règles métier et de la maquette ; aucune valeur produit n’est introduite hors du catalogue. Toute ambiguïté d’implémentation découverte ensuite suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification de la spécification.

Décisions d’implémentation complémentaires (ADR-0301) : les formats pertinents sont la question à
choix, la question ouverte, le texte à trous et l’association ; la clé d’idempotence de
`question_bank_jobs` regroupe apprenant, notion, format et version de cours ; les empreintes sont
dédupliquées sur toutes les briques de la notion, y compris celles déjà vues hors banque ; une
banque incomplète conserve ses variantes valides mais n’est jamais marquée prête.
