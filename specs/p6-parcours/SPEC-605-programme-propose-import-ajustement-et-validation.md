---
id: SPEC-605
title: "Programme proposé, import, ajustement et validation"
phase: P6
priority: V1
depends_on: [SPEC-604, SPEC-512, SPEC-407]
business_rules: [BR-FOR-04, BR-FOR-05, BR-FOR-06]
screens: [SCR-05]
adrs: [ADR-0014, ADR-0310]
visual: mockup
---

# SPEC-605 — Programme proposé, import, ajustement et validation

## 1. Objectif

Génération du programme (tâche programme + recherche web), écran Programme en mode proposé (?proposition de la maquette : étape 2 sur 2, source proposé/importé, calendrier proposé, modules et chapitres), import fichier/texte structuré par le tuteur, Ajuster avec le tuteur, Valider → formation active, modules/notions créés, planification initiale, événement programme-validated, limite de 3 formations. Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. Écran concerné : SCR-05 : `/formations/[fid]/programme`. Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-604** — Nouvelle formation : cadrage par chat ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-512** — Recherche web ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-407** — Planificateur ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les services applicatifs utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201, le client utilisateur soumis à RLS de SPEC-113 et les événements de SPEC-203. Les composants interactifs réutilisent `@learny/ui` et les textes passent par `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-FOR-04** — Le programme est soit **proposé** par le tuteur (analyse du cadrage + recherche web), soit **importé** (fichier PDF/DOCX/TXT/MD ou texte collé, structuré par le tuteur). L'apprenant peut demander des ajustements en langage naturel (« Ajuster avec le tuteur ») ; il doit **valider** le programme avant le démarrage.
- **BR-FOR-05** — Un programme est une liste ordonnée de **modules** (titre, objectifs pédagogiques, dates prévues, seuil de validation), chacun divisé en **chapitres** ordonnés. Chaque chapitre porte une liste de **notions** (intitulé, définition courte).
- **BR-FOR-06** — Seuil de validation d'un module : 80 % par défaut ; le tuteur peut l'ajuster selon l'objectif, entre 60 % et 95 %.

## 5. Exigences fonctionnelles

- **EF-1** — « Générer le programme » déclenche une seule tâche `programme` à partir du cadrage figé ; le résultat reste en `programme_proposed` tant que l’apprenant n’a pas validé. La recherche web sert à la proposition, jamais comme source brute d’un cours.
- **EF-2** — L’import accepte PDF, DOCX, TXT, MD ou texte collé. L’extraction garde le fichier d’origine privé ; le tuteur structure modules, chapitres et notions, puis la même vue de prévisualisation affiche « Importé » au lieu de « Proposé ». Un import vide ou illisible donne une erreur lisible et n’écrase pas une proposition existante.
- **EF-3** — « Ajuster avec le tuteur » enregistre la demande et produit une nouvelle version de proposition ; l’ancienne version reste consultable. Un ajustement ne modifie ni les modules actifs ni le planning avant validation.
- **EF-4** — « Valider le programme » exige au moins un module, un chapitre par module, une notion par chapitre, dates cohérentes, seuil 60–95 % (80 % par défaut) et capacité de trois formations actives. L’opération crée la structure en transaction, ouvre le premier module, verrouille les autres, planifie puis émet une fois `formation/programme-validated`.
- **EF-5** — Les règles métier BR-FOR-04, BR-FOR-05, BR-FOR-06 de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.

## 6. Exigences techniques

- **ET-1** — Chaque lecture et mutation utilise le client de l’utilisateur soumis à RLS ; un autre utilisateur reçoit 404. Les entrées/sorties passent par les schémas Zod de `packages/contracts`, et les routes renvoient `application/problem+json` en erreur.
- **ET-2** — Les écritures multi-tables sont transactionnelles ; un événement est émis après commit et une clé d’idempotence empêche une double transition. Les dates passent par l’horloge injectable et le fuseau IANA du profil.
- **ET-3** — Contrats `GenerateProgrammeInput`, `ImportProgrammeInput`, `AdjustProgrammeInput`, `ValidateProgrammeInput` et `ProgrammeProposalDto` dans `packages/contracts/src/formations.ts` : version, source `generated|imported`, statut, modules ordonnés, chapitres ordonnés, notions, dates et seuil. Rejeter les doublons d’ordre et de notion dans un même chapitre.
- **ET-4** — Service `packages/services/src/programme/` : `generateProposal`, `importProposal`, `adjustProposal`, `validateProposal`. Le traitement IA est hors transaction ; l’écriture de la version et la validation sont transactionnelles. La validation verrouille la proposition par version attendue pour refuser deux clics concurrents.
- **ET-5** — Routes `POST /formations/:fid/programme/generate|import|adjust|validate` et `GET /formations/:fid/programme` ; `POST validate` répond 409 si version obsolète, 422 si structure incomplète ou limite de trois atteinte. Le job de planification reçoit l’identifiant validé une seule fois.

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Proposition modifiée dans un autre onglet : version attendue discordante → 409, prévisualisation rechargée, aucune activation partielle.
- **CL-4** — Trois formations déjà actives : présenter le dialogue de SPEC-618 ; ne pas valider la quatrième avant pause explicite d’une formation.
- **CL-5** — Modèle IA indisponible après import : conserver le fichier en attente et permettre « Réessayer » ; ne pas prétendre qu’il est structuré.

## 8. Instructions d'implémentation

1. Définir `ProgrammeProposalSchema` et `ValidateProgrammeInput` puis tester ordres, dates et seuil 60–95 %. Commit `feat(SPEC-605): définit les contrats`.
2. Implémenter génération, import et ajustement versionnés dans `packages/services/src/programme/`, avec tuteur mock et recherche web limitée au programme. Commit `feat(SPEC-605): implémente les services`.
3. Implémenter `validateProposal` transactionnel : limite de trois, modules/chapitres/notions, premier module ouvert, planification et événement unique. Commit `feat(SPEC-605): construit le parcours`.
4. Construire le mode `?proposition` de la maquette et les dialogues Ajuster/Valider ; relier les cinq routes de programme. Commit `test(SPEC-605): vérifie les cas`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-605`, renseigner les preuves réellement produites puis `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/programme.ts`, `packages/services/src/programme/{generate,import,adjust,validate}.ts`, `packages/services/test/integration/programme.test.ts`, `apps/web/app/(app)/formations/[fid]/programme/page.tsx`, `apps/web/components/programme/{ProposalHeader,ProgrammeTimeline,ProgrammeModuleList,AdjustDialog,ValidateDialog}.tsx`, `apps/web/e2e/specs/p6/programme-proposal.spec.ts`.
- **Modifiés** : `packages/tutor/prompts/programme.md`, `packages/jobs/src/functions/programme.ts`, `packages/jobs/src/events.ts`, `apps/web/messages/fr.ts`, `docs/architecture/api.md`.
- **Lus / réutilisés** : `specs/p6-parcours/SPEC-604-nouvelle-formation-cadrage-par-chat.md`, `specs/p5-ia/SPEC-512-recherche-web.md`, `specs/p4-moteur/SPEC-407-planificateur.md`.

## 10. Interface et conformité visuelle

État `?proposition` de `Programme.dc.html` : étape « 2 sur 2 », badge « Proposé par le tuteur » ou « Importé », calendrier proposé, liste ordonnée de modules et chapitres, boutons « Ajuster avec le tuteur » et « Valider le programme ». `data-testid` : `programme-proposal`, `programme-source`, `programme-modules`, `programme-adjust`, `programme-validate`.

- **Contrôles** — Utiliser la référence du SCR-05 dans `design/references/` et mesurer ≤ 12 % de pixels différents ; vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — Le scénario mock SAP crée la proposition sans activer la formation ; après validation, le module 1 est ouvert, les suivants verrouillés et un seul événement de planification existe.
- **CA-2** — Un seuil de 59 % ou 96 % est refusé, 60 % et 95 % sont acceptés ; la valeur omise devient 80 %.
- **CA-3** — Un import DOCX et un ajustement créent deux versions distinctes ; l’ancienne proposition reste lisible et un double clic « Valider » ne crée pas deux structures.
- **CA-4** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
- **CA-5** — L’écran respecte la maquette avec un écart ≤ 12 % ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

**Unitaires** (2 fichiers, `[SPEC-605]`) :
- `packages/services/src/programme/validate-proposal.test.ts` — `[SPEC-605]` : 59/60/80/95/96 %, ordre des modules, chapitre ou notion manquants, dates inversées, version obsolète.
- `packages/services/src/programme/import.test.ts` — `[SPEC-605]` : PDF/DOCX/TXT/MD et texte collé, import vide, conservation du fichier original.

**Intégration** (Supabase local, `LLM_MODE=mock`, `[SPEC-605]`) :
- `packages/services/test/integration/programme.test.ts` — `[SPEC-605]` : cadrage validé → proposition mock, ajustement N+1, import distinct, double validation → une structure et un événement, limites de trois et 404 RLS.

**End-to-end** (`apps/web/e2e/specs/p6/programme-proposal.spec.ts`, vidéo) :
- **Scénario** — `programme proposé, ajusté puis validé @SPEC-605` : Alex ouvre l’étape 2/2, voit calendrier et modules, demande un ajustement, compare les versions, valide et voit le module 1 ouvert.
- **Scénario** — `programme importé @SPEC-605` : importer un texte structuré, vérifier badge « Importé », puis valider ; vidéo sur chaque parcours.

**Visuel** — `test('conformité SPEC-605 @SPEC-605 @visual')` : `SCR-05-proposition-desktop.png` et mobile : en-tête étape 2/2, source, calendrier, modules, boutons Ajuster/Valider ; `expectTokens`, diff ≤ 12 %, axe, capture de non-régression ≤ 1 %.

**Non-régression** — Rejouer `[SPEC-604]` et `@SPEC-604`, `[SPEC-512]` et `@SPEC-512`, `[SPEC-407]` et `@SPEC-407` et les suites complètes unitaires/intégration.

| Critère | Tests |
|---|---|
| CA-1 | unitaires et intégration ciblés ; e2e `@SPEC-605` |
| CA-2 | unitaires et intégration ciblés ; e2e `@SPEC-605` |
| CA-3 | unitaires et intégration ciblés ; e2e `@SPEC-605` |
| CA-4 | intégration RLS/idempotence, e2e erreur |
| CA-5 | `@SPEC-605 @visual`, axe, vidéo |

## 13. Preuves attendues

`evidence/SPEC-605/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-5. Conserver la comparaison côte à côte et le diff avec la référence de maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- **ADR-0014 — Seuils et taille des quiz** : Seuil de validation par défaut 80 %, ajustable par le tuteur entre 60 et 95 % selon l'objectif (examen exigeant → 85 %). Quiz de validation : 12 questions par défaut, entre 10 et 20 (une par notion au minimum, plafonné à 20), environ 70 % questions à choix et 30 % questions ouvertes (au moins une ouverte).
- **ADR-0310 — Versions de proposition et génération du programme** : table `programme_proposals` (une ligne par version, source `generated|imported`), fichier importé conservé dans `programme_imports.original_content`, génération initiale unique sur la page Programme après un cadrage terminé, ajustement/import créant N+1 sans toucher la structure active, validation sous verrou avec version attendue, limite de trois et événement déterministe, puis planification unique par `plan-programme`.
- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification du périmètre.

