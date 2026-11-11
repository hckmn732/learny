---
id: SPEC-608
title: "Génération du cours"
phase: P6
priority: V1
depends_on: [SPEC-607, SPEC-511, SPEC-508, SPEC-513]
business_rules: [BR-COU-01, BR-COU-02, BR-COU-03, BR-COU-04, BR-COU-05, BR-COU-06, BR-COU-10]
screens: [SCR-07]
adrs: [ADR-0026]
visual: demo
---

# SPEC-608 — Génération du cours

## 1. Objectif

Job chapter/contributions-completed : rédaction par chapitre avec citations vérifiées, sections typées (texte, question éclair, ne pas confondre, complété par le tuteur, à retenir avec schéma et moyen mnémotechnique, invitation au résumé), notions et liens (prérequis, confusion), cours de base signalé si aucun apport, version, déclenchement des banques, notification cours prêt. Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. Écran concerné : SCR-07 : `/formations/[fid]/modules/[mid]/cours?chapitre=[cid]`. Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-607** — Module et apports ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-511** — Recherche sémantique et sélection du contexte ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-508** — Paquet tutor : actions, boucle et consignes ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-513** — Banques de questions ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les services applicatifs utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201, le client utilisateur soumis à RLS de SPEC-113 et les événements de SPEC-203. Les composants interactifs réutilisent `@learny/ui` et les textes passent par `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-COU-01** — Un cours est généré par module, organisé par chapitre, en Markdown, dans une logique progressive, dans la langue des cours de l'apprenant.
- **BR-COU-02** — Chaque passage du cours tiré des apports cite ses sources (extrait, page/minute/ancre) ; un passage issu des connaissances du tuteur est signalé « Complété par le tuteur · à confirmer dans vos sources ».
- **BR-COU-03** — Un chapitre sans apport reçoit un cours de base rédigé par le tuteur, signalé comme tel, accompagné de suggestions de ressources.
- **BR-COU-04** — Chaque chapitre se termine par une fiche « À retenir » : 3 à 7 points clés, un schéma simple (blocs/flèches) quand pertinent, un moyen mnémotechnique si la notion est une liste, un ordre ou un chiffre.
- **BR-COU-05** — Un chapitre peut comporter une « question éclair » avant une section : question posée, réponse masquée derrière « Afficher la réponse ».
- **BR-COU-06** — Quand deux notions proches risquent d'être confondues, le cours contient un bloc « Ne pas confondre » qui les oppose.
- **BR-COU-10** — Le cours est stocké par version ; les résultats et citations restent liés à la version utilisée.

## 5. Exigences fonctionnelles

- **EF-1** — À `chapter/contributions-completed`, générer un cours par module, chapitre par chapitre, en Markdown dans la langue du profil ; les sections s’enchaînent selon le programme validé.
- **EF-2** — Une phrase issue d’un apport cite un `chunkId` vérifié appartenant au chapitre avec page, minute, ancre ou position ; tout passage sans apport est marqué « Complété par le tuteur · à confirmer dans vos sources ». Une citation absente ou d’un autre utilisateur rend la sortie invalide.
- **EF-3** — Chaque chapitre peut contenir une question éclair avec réponse masquée, un bloc « Ne pas confondre » pour les notions proches, puis une fiche « À retenir » de 3 à 7 points, schéma blocs/flèches quand pertinent et moyen mnémotechnique pour liste, ordre ou chiffre.
- **EF-4** — Sans apport, générer un cours de base explicitement signalé, accompagné de suggestions de ressources ; une nouvelle génération crée une version et préserve les résultats et citations liés à l’ancienne.
- **EF-5** — Après validation du cours, émettre `course/generated`, demander la préparation des banques de questions et `notification/requested` de type cours prêt.
- **EF-6** — Les règles métier BR-COU-01, BR-COU-02, BR-COU-03, BR-COU-04, BR-COU-05, BR-COU-06, BR-COU-10 de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.

## 6. Exigences techniques

- **ET-1** — Chaque lecture et mutation utilise le client de l’utilisateur soumis à RLS ; un autre utilisateur reçoit 404. Les entrées/sorties passent par les schémas Zod de `packages/contracts`, et les routes renvoient `application/problem+json` en erreur.
- **ET-2** — Les écritures multi-tables sont transactionnelles ; un événement est émis après commit et une clé d’idempotence empêche une double transition. Les dates passent par l’horloge injectable et le fuseau IANA du profil.
- **ET-3** — Schéma Zod `CourseDraft` : `chapters[]` et sections discriminées `markdown|quick_question|comparison|tutor_addition|takeaway|summary_prompt`, plus `sourceChunkIds[]`, `notionIds[]` et liens `prerequisite|confusion`.
- **ET-4** — Pipeline `packages/services/src/courses/generate-course.ts` : lecture RLS des passages `ready`, budget de contexte, appel `tutor.run(course)` hors transaction, validation du schéma et de chaque citation, transaction de versionnement et émission d’événements après commit.
- **ET-5** — La version active est atomique : une génération invalide ne remplace jamais la version précédente ; les sections signalées restent exclues des tirages jusqu’à correction (BR-MEM-09).

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Aucun passage prêt : cours de base indiqué, sans citation fictive.
- **CL-4** — Passage supprimé entre lecture et validation : vérification finale échoue ou marque la source supprimée avant publication.
- **CL-5** — Sortie du modèle invalide après deux corrections : statut `failed`, version active intacte et notification d’échec IA.

## 8. Instructions d'implémentation

1. Définir le schéma discriminé des sections de cours et les contraintes de citations et fiche À retenir. Commit `feat(SPEC-608): définit les contrats`.
2. Écrire `validateCitations` contre les passages prêts du propriétaire, puis la génération par chapitre avec tuteur mock et repli cours de base. Commit `feat(SPEC-608): implémente les services`.
3. Persister une nouvelle version atomique sans remplacer l’ancienne en cas d’échec ; émettre `course/generated`, banque et notification après commit. Commit `feat(SPEC-608): construit le parcours`.
4. Créer une page SDD ou l’état du cours SCR-07 montrant les sections générées et les sources vérifiées. Commit `test(SPEC-608): vérifie les cas`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-608`, renseigner les preuves réellement produites puis `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/course-draft.ts`, `packages/services/src/courses/{generate-course,validate-citations,version-course}.ts`, `packages/services/test/integration/course-generation.test.ts`, `packages/tutor/prompts/course.md`, `packages/llm/fixtures/course/*.json`, `packages/jobs/src/functions/generate-course.ts`, `apps/web/e2e/specs/p6/course-generation.spec.ts`.
- **Modifiés** : `packages/jobs/src/events.ts`, `packages/db/src/schema/courses.ts`, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `specs/p6-parcours/SPEC-607-module-et-apports.md`, `specs/p5-ia/SPEC-511-recherche-semantique-et-selection-du-contexte.md`, `specs/p5-ia/SPEC-508-paquet-tutor-actions-boucle-et-consignes.md`, `specs/p5-ia/SPEC-513-banques-de-questions.md`.

## 10. Interface et conformité visuelle

Démonstration sur le cours SCR-07 : section sourcée avec lien de page, section « Complété par le tuteur », question éclair, bloc « Ne pas confondre », fiche « À retenir ». Comparer l’état lecture de `Cours.dc.html` en excluant le panneau de discussion de SPEC-610.

- **Contrôles** — vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — La fixture du chapitre SAP produit des citations résolues et une fiche de 3 à 7 points ; chaque `chunkId` appartient au propriétaire.
- **CA-2** — Un chapitre sans apport est marqué cours de base et contient des suggestions, sans citation inventée.
- **CA-3** — Une régénération crée la version N+1 sans changer les résultats liés à N ; une sortie IA invalide laisse N active.
- **CA-4** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
- **CA-5** — La démonstration suit les jetons et la structure prescrits ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

**Unitaires** (2 fichiers, `[SPEC-608]`) :
- `packages/services/src/courses/validate-citations.test.ts` — `[SPEC-608]` : chunk valide, absent, supprimé, d’un autre utilisateur ; phrase non sourcée marquée comme complément tuteur.
- `packages/contracts/src/course-draft.test.ts` — `[SPEC-608]` : 2/3/7/8 points À retenir, question éclair, comparaison, schéma et moyen mnémotechnique.

**Intégration** (Supabase local, `LLM_MODE=mock`, `[SPEC-608]`) :
- `packages/services/test/integration/course-generation.test.ts` — `[SPEC-608]` : événement chapitre terminé, fixture SAP, version N+1, résultats de N préservés, cours sans apport, sortie invalide après deux corrections et événement unique.

**End-to-end** (`apps/web/e2e/specs/p6/course-generation.spec.ts`, vidéo) :
- **Scénario** — `cours généré avec sources @SPEC-608` : terminer les apports, attendre job mock, ouvrir le cours, vérifier citation PDF et complément tuteur.
- **Scénario** — `cours de base sans apport @SPEC-608` : déclencher le cours et voir avertissement et suggestions.

**Visuel** — `test('conformité SPEC-608 @SPEC-608 @visual')` : État de lecture SCR-07 : sections Markdown, question éclair, Ne pas confondre, À retenir et pastille « Complété par le tuteur » ; diff de référence ≤ 12 %, axe, capture ≤ 1 %.

**Non-régression** — Rejouer `[SPEC-607]` et `@SPEC-607`, `[SPEC-511]` et `@SPEC-511`, `[SPEC-508]` et `@SPEC-508`, `[SPEC-513]` et `@SPEC-513` et les suites complètes unitaires/intégration.

| Critère | Tests |
|---|---|
| CA-1 | unitaires et intégration ciblés ; e2e `@SPEC-608` |
| CA-2 | unitaires et intégration ciblés ; e2e `@SPEC-608` |
| CA-3 | unitaires et intégration ciblés ; e2e `@SPEC-608` |
| CA-4 | intégration RLS/idempotence, e2e erreur |
| CA-5 | `@SPEC-608 @visual`, axe, vidéo |

## 13. Preuves attendues

`evidence/SPEC-608/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-5. Conserver la capture de la page de démonstration ou de l’écran sans maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- **ADR-0026 — Banques de questions propres à chaque apprenant** : Les banques sont générées à partir du cours privé de chaque apprenant et ne sont jamais partagées. 4 variantes minimum par notion et par format pertinent ; génération en lot (API Batches) la nuit ; régénération quand toutes les variantes ont été vues.
- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification du périmètre.

