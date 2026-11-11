---
id: SPEC-609
title: "Lecture du cours"
phase: P6
priority: V1
depends_on: [SPEC-608, SPEC-503]
business_rules: [BR-COU-02, BR-COU-05, BR-COU-06, BR-COU-07, BR-COU-08, BR-COU-09, BR-COU-11, BR-MEM-09]
screens: [SCR-07]
adrs: [ADR-0060]
visual: mockup
---

# SPEC-609 — Lecture du cours

## 1. Objectif

Écran Cours.dc.html (sans le panneau tuteur) : sommaire, métadonnées, sections, extraits cliquables (PDF page, note vocale, vidéo minute), progression de lecture, résumé corrigé, signaler/corriger une section, navigation chapitres, carte quiz. Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. Écran concerné : SCR-07 : `/formations/[fid]/modules/[mid]/cours?chapitre=[cid]`. Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-608** — Génération du cours ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-503** — Rendu des briques ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les services applicatifs utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201, le client utilisateur soumis à RLS de SPEC-113 et les événements de SPEC-203. Les composants interactifs réutilisent `@learny/ui` et les textes passent par `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-COU-02** — Chaque passage du cours tiré des apports cite ses sources (extrait, page/minute/ancre) ; un passage issu des connaissances du tuteur est signalé « Complété par le tuteur · à confirmer dans vos sources ».
- **BR-COU-05** — Un chapitre peut comporter une « question éclair » avant une section : question posée, réponse masquée derrière « Afficher la réponse ».
- **BR-COU-06** — Quand deux notions proches risquent d'être confondues, le cours contient un bloc « Ne pas confondre » qui les oppose.
- **BR-COU-07** — En fin de chapitre, l'apprenant rédige un résumé avec ses mots (3 à 4 phrases suggérées) ; le tuteur le corrige et signale ce qui manque.
- **BR-COU-08** — La progression de lecture (% par chapitre et par cours) est enregistrée et affichée.
- **BR-COU-09** — L'apprenant peut corriger ou compléter une section, ou signaler une erreur ; toute modification crée une nouvelle version ; un contenu signalé sort des tirages jusqu'à correction.
- **BR-COU-11** — Le cours affiche : sommaire (chapitres et sections), badge « Chapitre n sur N », temps de lecture estimé (200 mots/min), « Construit à partir de N apports », liens vers les extraits (note vocale, vidéo, page PDF), navigation chapitre précédent/suivant, carte « Prêt pour le quiz de validation ? ».
- **BR-MEM-09** — Une brique signalée erronée sort du quiz global jusqu'à sa correction.

## 5. Exigences fonctionnelles

- **EF-1** — La page Cours affiche sommaire de chapitres/sections, badge « Chapitre n sur N », durée à 200 mots/min, « Construit à partir de N apports », article Markdown sûr, navigation précédent/suivant et carte de quiz.
- **EF-2** — Cliquer une citation ouvre l’extrait du bon propriétaire à sa page PDF, ancre web ou minutage vidéo/note vocale ; une source supprimée affiche « source supprimée » sans lien brisé.
- **EF-3** — La progression de lecture par chapitre et cours se met à jour de manière monotone et se retrouve après rechargement. Le résumé de fin de chapitre accepte le texte de l’apprenant, le fait corriger par le tuteur et montre ce qui manque.
- **EF-4** — Corriger/compléter une section crée une nouvelle version ; signaler une erreur retire le contenu concerné des tirages jusqu’à correction et conserve l’historique.
- **EF-5** — Les règles métier BR-COU-02, BR-COU-05, BR-COU-06, BR-COU-07, BR-COU-08, BR-COU-09, BR-COU-11, BR-MEM-09 de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.

## 6. Exigences techniques

- **ET-1** — Chaque lecture et mutation utilise le client de l’utilisateur soumis à RLS ; un autre utilisateur reçoit 404. Les entrées/sorties passent par les schémas Zod de `packages/contracts`, et les routes renvoient `application/problem+json` en erreur.
- **ET-2** — Les écritures multi-tables sont transactionnelles ; un événement est émis après commit et une clé d’idempotence empêche une double transition. Les dates passent par l’horloge injectable et le fuseau IANA du profil.
- **ET-3** — Rendre Markdown par `react-markdown` + `rehype-sanitize`, sans HTML brut, liens `javascript:` ni scripts. Les citations sont des composants contrôlés recevant un identifiant de passage, pas une URL libre produite par le modèle.
- **ET-4** — `PUT /courses/:cid/progress`, `POST /chapters/:cid/summary`, `PATCH /course-sections/:sid`, `POST /course-sections/:sid/report` passent par services RLS et créent versions/événements idempotents.
- **ET-5** — Le pourcentage de lecture vient d’un suivi de sections visibles, borné à 0–100 et monotone ; une correction du résumé stocke sa version de cours et ne modifie pas une tentative passée.

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Lien source dont l’apport est supprimé : étiquette « source supprimée », aucune URL signée demandée.
- **CL-4** — Résumé soumis sans IA disponible : texte conservé en brouillon, correction différée ou erreur explicite, pas de faux retour.
- **CL-5** — Section signalée puis chargée dans un quiz préexistant : question exclue des nouveaux tirages, tentative existante reste consultable.

## 8. Instructions d'implémentation

1. Définir DTO de lecture et liens de citations contrôlés ; installer rendu Markdown sanitisé. Commit `feat(SPEC-609): définit les contrats`.
2. Implémenter suivi monotone de lecture, résumé corrigé et édition/signalement versionnés dans les services RLS. Commit `feat(SPEC-609): implémente les services`.
3. Construire le sommaire, article, extraits, question éclair, résumé, navigation et carte de quiz de `Cours.dc.html` sans panneau tuteur. Commit `feat(SPEC-609): construit le parcours`.
4. Tester l’ancre exacte de source, le contenu supprimé et l’injection HTML/URL. Commit `test(SPEC-609): vérifie les cas`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-609`, renseigner les preuves réellement produites puis `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/course-reading.ts`, `packages/services/src/courses/{read-course,progress,summary,edit-section,report-section}.ts`, `packages/services/test/integration/course-reading.test.ts`, `apps/web/app/(app)/formations/[fid]/modules/[mid]/cours/page.tsx`, `apps/web/components/course/{CourseArticle,CourseToc,SourceLink,SummaryEditor,QuickQuestion}.tsx`, `apps/web/e2e/specs/p6/course-reading.spec.ts`.
- **Modifiés** : `apps/web/messages/fr.ts`, `docs/architecture/api.md`, `packages/db/src/schema/courses.ts`.
- **Lus / réutilisés** : `specs/p6-parcours/SPEC-608-generation-du-cours.md`, `specs/p5-ia/SPEC-503-rendu-des-briques.md`.

## 10. Interface et conformité visuelle

`Cours.dc.html` sans panneau tuteur : sommaire à gauche, métadonnées et article central, citations, question éclair fermée/ouverte, résumé et carte quiz. `data-testid` : `course-toc`, `course-source`, `course-progress`, `chapter-summary`, `course-quiz-card`.

- **Contrôles** — Utiliser la référence du SCR-07 dans `design/references/` et mesurer ≤ 12 % de pixels différents ; vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — Le chapitre démo affiche temps calculé à 200 mots/min, nombre d’apports exact et citation « Guide FI, p. 4 » ouvrant le passage correspondant.
- **CA-2** — Une progression de 60 % puis 40 % reste 60 % après rechargement ; le résumé corrigé montre les points manquants.
- **CA-3** — Un Markdown contenant un script ou lien `javascript:` n’exécute rien ; un signalement retire la brique du nouveau quiz.
- **CA-4** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
- **CA-5** — L’écran respecte la maquette avec un écart ≤ 12 % ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

**Unitaires** (2 fichiers, `[SPEC-609]`) :
- `packages/services/src/courses/progress.test.ts` — `[SPEC-609]` : 0/60/40/100 %, monotonicité et durée à 200 mots/min.
- `apps/web/components/course/CourseArticle.test.tsx` — `[SPEC-609]` : Markdown dangereux supprimé, question éclair masquée puis révélée, citation supprimée sans lien.

**Intégration** (Supabase local, `LLM_MODE=mock`, `[SPEC-609]`) :
- `packages/services/test/integration/course-reading.test.ts` — `[SPEC-609]` : progression persistée, résumé et correction mock, section éditée → version N+1, signalement exclu des nouveaux tirages, ancien résultat lié à N, 404 RLS.

**End-to-end** (`apps/web/e2e/specs/p6/course-reading.spec.ts`, vidéo) :
- **Scénario** — `lit et résume un chapitre @SPEC-609` : Alex ouvre le cours, suit sommaire, citation Guide FI p. 4, révèle question, écrit résumé et voit retour.
- **Scénario** — `signale et corrige une section @SPEC-609` : signaler, voir état, corriger, vérifier nouvelle version après rechargement.

**Visuel** — `test('conformité SPEC-609 @SPEC-609 @visual')` : `SCR-07-sans-tuteur-desktop.png` et mobile : sommaire, badge chapitre, métadonnées, article et carte quiz ; diff ≤ 12 %, axe, capture ≤ 1 %.

**Non-régression** — Rejouer `[SPEC-608]` et `@SPEC-608`, `[SPEC-503]` et `@SPEC-503` et les suites complètes unitaires/intégration.

| Critère | Tests |
|---|---|
| CA-1 | unitaires et intégration ciblés ; e2e `@SPEC-609` |
| CA-2 | unitaires et intégration ciblés ; e2e `@SPEC-609` |
| CA-3 | unitaires et intégration ciblés ; e2e `@SPEC-609` |
| CA-4 | intégration RLS/idempotence, e2e erreur |
| CA-5 | `@SPEC-609 @visual`, axe, vidéo |

## 13. Preuves attendues

`evidence/SPEC-609/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-5. Conserver la comparaison côte à côte et le diff avec la référence de maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- **ADR-0060 — Rendu Markdown sécurisé** : `react-markdown` + `remark-gfm` + `rehype-sanitize` (liste blanche) ; pas de HTML brut ; formules non prises en charge en V1 (texte brut).
- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification du périmètre.

