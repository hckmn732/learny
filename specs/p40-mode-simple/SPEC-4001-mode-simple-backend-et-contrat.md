---
id: SPEC-4001
title: Mode simple — backend et contrat (dépôt, analyse, programme, diagnostic, génération progressive)
phase: P40
priority: mode-simple
depends_on: []
business_rules: [BR-FOR-01, BR-FOR-02, BR-FOR-04, BR-FOR-05, BR-FOR-10, BR-FOR-16, BR-APP-01, BR-APP-02, BR-APP-03, BR-APP-04, BR-APP-06, BR-APP-07, BR-IA-06, BR-IA-08, BR-IA-10, BR-IA-11, BR-IA-12, BR-IA-13, BR-MEM-03]
screens: []
adrs: [ADR-4001, ADR-4002, ADR-4003, ADR-0008, ADR-0039, ADR-0340, ADR-2011, ADR-2014]
visual: demo
---

# SPEC-4001 — Mode simple : backend et contrat

## 1. Objectif

Livrer côté serveur le mode simple d'ADR-4003 : créer une formation à partir d'un ou plusieurs documents déposés, l'analyser, proposer un programme tiré du document, proposer un diagnostic global, puis générer les cours progressivement. Le contrat est commun au web (SPEC-4002) et au mobile (SPEC-4003).

## 2. Contexte

À lire :
- `docs/product/mode-simple.md` (cadrage, décisions D1 à D7) ;
- `design/mode-simple/index.html` (parcours) ;
- ADR-4003 (décisions normatives) ;
- `docs/architecture/python-backend/00-conventions.md` (canevas obligatoire : cas d'usage en fonctions async, `Deps` gelé, SQL Core sans ORM, `AppError`, anglais dans le code, libellés dans `learny/shared/locale_fr/`) ;
- `docs/architecture/data-model.md` §2 et §3 ;
- `docs/architecture/ai.md`.

Le mode simple **réutilise** l'existant :
- extraction et découpage des apports (`learny/content/infrastructure/extract/*`, `content/application/ingestion.py`) ;
- propositions de programme (`programme_proposals`, `formation/application/programme.py`) ;
- validation du programme (`programme.validate`) ;
- génération du cours (`content/application/generate.py`) ;
- banque de questions (`tutor/application/question_bank.py`) ;
- tentatives (`/api/v1/attempts/{aid}/…`) ;
- planificateur (`learning`).

## 3. Dépendances

- La piste Python est close (CP-23) ; aucun prérequis de spécification dans la piste.
- Externes : le fournisseur d'IA de l'utilisateur (BR-IA-06). En test, `LLM_MODE=mock` (ADR-0048) avec des réponses déterministes ajoutées aux fixtures du mock. Stockage : le bucket `resources` existant.

## 4. Règles métier couvertes

- **BR-FOR-01 et BR-FOR-02** : le cadrage n'est pas demandé quand `creation_mode = 'simple'` ; les rubriques de `cadrage_profile` sont remplies par l'analyse avec `state: 'done'`.
- **BR-FOR-04** : nouvelle origine `programme_source = 'document'` ; l'ajustement (`programme.adjust`) et la validation (`programme.validate`) sont inchangés.
- **BR-FOR-05** : le programme proposé respecte le contrat existant (modules, chapitres, notions), plus les plages de pages.
- **BR-FOR-10** : la création en mode simple applique la limite de trois formations actives au moment de la validation, comme le mode tuteur.
- **BR-FOR-16** : `formations.list` expose `creationMode` et `simpleStatus` pour le « Continuer » de l'accueil.
- **BR-APP-01, BR-APP-02, BR-APP-03, BR-APP-06, BR-APP-07** : les documents sont des `resources` de la formation (`chapter_id` nul), soumis aux mêmes limites, privés, découpés en passages repérés, avec les mêmes statuts de traitement.
- **BR-APP-04** : en mode simple, la génération est déclenchée par le serveur (EF-9) sans « chapitre terminé ».
- **BR-IA-06** : sans modèle choisi pour les tâches `simple_analysis`, `programme` et `course`, l'analyse est refusée (`AI_NOT_CONFIGURED`).
- **BR-IA-08** : chaque appel est journalisé avec ses nouvelles tâches.
- **BR-IA-10** : le contenu des documents est transmis balisé comme donnée.
- **BR-IA-11** : le plan, le diagnostic et les briques sont validés par schéma.
- **BR-IA-12** : aucune recherche web dans l'analyse.
- **BR-IA-13** : la génération de fond passe par l'API de traitement par lots quand le fournisseur la propose.
- **BR-MEM-03** : un module validé par le diagnostic ajoute ses notions au quiz global.

## 5. Exigences fonctionnelles

- **EF-1. Création.** `POST /api/v1/formations/simple` crée une formation :
  - `creation_mode = 'simple'`, `status = 'cadrage'`, titre provisoire « Nouvelle formation » ;
  - motivation facultative (texte de 300 caractères au plus) ;
  - crée la ligne `simple_analyses` au statut `collecting`.
- **EF-2. Dépôt d'un fichier.**
  - `POST /api/v1/formations/{fid}/sources/uploads` renvoie une URL de téléversement signée, comme `uploads.create`, pour une ressource de la formation (`chapter_id` nul) qui porte `metadata.role`. Le fichier est confirmé par `resources.finalize`, inchangé.
  - Formats : PDF, DOCX, TXT, Markdown, JPEG, PNG, WebP, HEIC.
  - Limites de BR-APP-02. Au plus **10 documents** par formation en mode simple.
- **EF-3. Dépôt d'un lien.** `POST /api/v1/formations/{fid}/sources/links` (`{url, role?}`) crée une ressource `web` ou `youtube` avec les extracteurs existants.
- **EF-4. Rôle deviné.** À la confirmation, le serveur devine le rôle par règles de code, sans IA. Les marqueurs sont cherchés dans le nom et dans les 2 premières pages (insensible à la casse et aux accents) :
  - `exam_papers` si l'on trouve `annale`, `sujet`, `examen`, `session 20` ;
  - `exercises` si l'on trouve `td`, `exercice`, `corrigé`, `travaux dirigés` ;
  - sinon `course` pour le premier document, `other` pour les suivants ;
  - si aucun document n'est `course`, le plus long le devient.

  `PATCH /api/v1/resources/{rid}/role` (`{role}`) le modifie tant que l'analyse n'a pas commencé.
- **EF-5. Lancement de l'analyse.** `POST /api/v1/formations/{fid}/simple/analysis` (202) :
  - exige au moins un document `ready` de rôle `course` ;
  - vérifie que les tâches `simple_analysis`, `programme` et `course` ont un modèle choisi ;
  - passe `simple_analyses.status` à `analysing` ;
  - émet l'événement d'outbox `simple.analysis.requested`.
- **EF-6. Suivi de l'analyse.** `GET /api/v1/formations/{fid}/simple` renvoie :
  - `status` : `collecting|analysing|proposed|failed` ;
  - `steps` : quatre étapes ordonnées, `read`, `structure`, `practice`, `programme`, chacune `{key, state: 'todo'|'running'|'done', detail}`. Les libellés sont dans `locale_fr` ;
  - `chaptersFound` : `[{position, title}]`, alimenté au fil de la détection ;
  - `sources` : `[{resourceId, title, kind, role, pages, status}]` ;
  - `error` : `{code, message}` ou `null` ;
  - `proposalVersion` : version de la proposition, ou `null`.

  Le client interroge cette ressource toutes les 2 s pendant l'analyse.
- **EF-7. Analyse (worker).** Le consommateur de `simple.analysis.requested` exécute, dans l'ordre, en mettant `steps` à jour après chaque étape :
  1. **`read`** : attend que les documents soient `ready` (ingestion existante), avec un délai de 10 min au plus.
  2. **`structure`** : détecte les sections du document `course`, dans l'ordre signets PDF, table des matières, titres, découpage de 15 pages, puis écrit `chaptersFound`. Chaque section est résumée en 150 mots au plus (tâche `simple_analysis`).
  3. **`practice`** : compte et rattache les exercices et sujets des documents `exercises` et `exam_papers` aux sections, par similarité des embeddings existants.
  4. **`programme`** : construit le programme (tâche `programme`) à partir des seuls résumés, selon les bornes de D7 (module de 2 à 8 h, chapitre de 20 à 45 min), avec `pageFrom` et `pageTo` par module et par chapitre. Il enregistre une `programme_proposals` (`source = 'document'`), remplit `cadrage_profile`, `title` (titre du document nettoyé, 120 caractères au plus), `volume_hours`, `objectives = ['operational']`, puis passe `formations.status` à `programme_proposed` et `simple_analyses.status` à `proposed`.
- **EF-8. Échéance.** `PATCH /api/v1/formations/{fid}` (existant) accepte `endDate`.
  - En mode simple, une échéance fixe `objectives = ['exam']` et recalcule la fin du planning à **14 jours avant** l'échéance. `programme.get` renvoie alors les indicateurs recalculés : `volumeHours`, `hoursPerDay`, `endDate`.
  - Retirer l'échéance rétablit `['operational']` et la fin calculée au rythme du profil.
- **EF-9. Validation et génération progressive.** `programme.validate` (existant), en mode simple :
  - crée la structure active ;
  - remplit `chapter_sources` à partir des plages de pages ;
  - marque `chapter_progress.contributions_status = 'done'` pour tous les chapitres ;
  - émet `simple.generation.requested`.

  Le consommateur génère alors le cours des deux premiers modules non validés en priorité (génération directe), puis enfile les autres (génération par lots si possible). Il maintient en permanence au moins deux modules prêts en avance sur le premier module ouvert. La génération utilise le texte des seuls passages du chapitre, plus le résumé global.
- **EF-10. Diagnostic.**
  - `POST /api/v1/formations/{fid}/diagnostic` (201) crée une activité `diagnostic` et une tentative. Elle contient une question par module de 4 h au plus et deux au-delà, choisies parmi les formats à choix (`choice_question`, `cloze`) et générées depuis les résumés (tâche `simple_analysis`). Le corps de réponse est celui de `quiz.attempts.create`.
  - Les réponses passent par `/api/v1/attempts/{aid}/answers/{pos}` et `/submit`, sans correction immédiate (`check` refusé avec `DIAGNOSTIC_NO_CHECK`).
  - Le résultat (`/result`) renvoie `acquiredModuleIds`. Un module est acquis si **toutes** ses questions sont justes ; il passe alors à `validated` et ses notions sont initialisées dans FSRS comme après un quiz réussi. Le planning est recalculé.
- **EF-11. Passer le diagnostic.** `POST /api/v1/formations/{fid}/diagnostic/skip` (204) l'abandonne (tentative `abandoned`) sans rien valider. Le diagnostic n'est proposé qu'une fois : après `submit` ou `skip`, `POST …/diagnostic` renvoie `409 DIAGNOSTIC_ALREADY_DONE`.
- **EF-12. Préparation.** `GET /api/v1/formations/{fid}/simple` renvoie, après validation, `generation` : `[{moduleId, position, title, state: 'acquired'|'ready'|'generating'|'queued'}]`.

## 6. Exigences techniques

- **ET-1. Contrat.** Les opérations sont définies dans `packages/contracts/src/simple-mode.ts`, avec des schémas Zod et `defineRoute` comme les autres fichiers du dossier, puis exportées par `index.ts` :

  | Identifiant | Méthode et chemin | Réponse |
  |---|---|---|
  | `formations.simple.create` | `POST /api/v1/formations/simple` | 201 |
  | `formations.simple.get` | `GET /api/v1/formations/{fid}/simple` | 200 |
  | `formations.simple.analysis` | `POST /api/v1/formations/{fid}/simple/analysis` | 202 |
  | `sources.uploads.create` | `POST /api/v1/formations/{fid}/sources/uploads` | 201 |
  | `sources.links.create` | `POST /api/v1/formations/{fid}/sources/links` | 201 |
  | `resources.role` | `PATCH /api/v1/resources/{rid}/role` | 200 |
  | `diagnostic.create` | `POST /api/v1/formations/{fid}/diagnostic` | 201 |
  | `diagnostic.skip` | `POST /api/v1/formations/{fid}/diagnostic/skip` | 204 |

  Après modification, régénérer les artefacts : `pnpm openapi:generate`, `pnpm contract:export`, `pnpm sdk:generate`, `pnpm py:contract:generate`, puis `node tools/migration/inventory.mjs`.
- **ET-2. Codes d'erreur** (libellés français dans `learny/shared/locale_fr/`) :

  | Code | Statut | Situation |
  |---|---|---|
  | `AI_NOT_CONFIGURED` | 409 | Aucun modèle choisi pour une tâche requise. `details.tasks` liste les tâches manquantes. |
  | `SIMPLE_NO_COURSE_SOURCE` | 422 | Aucun document `course` prêt au lancement de l'analyse. |
  | `SIMPLE_TOO_MANY_SOURCES` | 422 | Plus de 10 documents. |
  | `SIMPLE_ANALYSIS_LOCKED` | 409 | Changement de rôle ou ajout de document pendant ou après l'analyse. |
  | `SIMPLE_NOT_SIMPLE` | 409 | Opération du mode simple sur une formation en mode tuteur. |
  | `DIAGNOSTIC_ALREADY_DONE` | 409 | Diagnostic déjà rendu ou passé. |
  | `DIAGNOSTIC_NO_CHECK` | 409 | Correction immédiate demandée pendant le diagnostic. |

  Les erreurs existantes (`PAYLOAD_TOO_LARGE`, `EXTRACTION_FAILED`, `FORMATION_LIMIT_REACHED`…) gardent leurs codes.
- **ET-3. Schéma.** Une migration Drizzle dans `packages/db`, avec RLS propriétaire sur les nouvelles tables :
  - `formations.creation_mode formation_creation_mode not null default 'tutor'` (`tutor|simple`) et `formations.simple_motivation text null check(≤ 300)` ;
  - enum `programme_source` + `document` ; enum `activity_kind` + `diagnostic` ; enum `ai_task` + `simple_analysis` ;
  - `simple_analyses` : `formation_id pk → formations on delete cascade`, `owner_id`, `status simple_status` (`collecting|analysing|proposed|failed`), `steps jsonb not null`, `chapters_found jsonb not null default '[]'`, `section_summaries jsonb not null default '[]'`, `error_code text`, `error_message text`, `diagnostic_status text check('none'|'done'|'skipped') default 'none'`, timestamps ;
  - `chapter_sources` : `chapter_id → chapters on delete cascade`, `resource_id → resources on delete cascade`, `page_from int`, `page_to int check(page_to >= page_from)`, `pk(chapter_id, resource_id)` ;
  - `resources.metadata.role` : clé documentée, sans colonne.

  Mettre à jour `docs/architecture/data-model.md` et `pnpm rls:export`.
- **ET-4. Code Python** (canevas ADR-2011) :
  - nouveau sous-module `learny/formation/application/simple/` : `create.py`, `sources.py`, `analysis.py`, `status.py`, `diagnostic.py` ;
  - `learny/formation/domain/simple.py` : règles pures du rôle deviné, bornes de modules, recalcul d'échéance ;
  - `learny/content/application/section_detection.py` : détection des sections ; la lecture des signets PDF passe par `pypdf` (ADR-2015) ;
  - handlers dans `apps/api/src/learny_api/handlers/simple.py` ;
  - consommateurs `simple.analysis.requested` et `simple.generation.requested` dans `apps/worker` (`consumers.py`), délai de 30 min, idempotents par `formation_id`.
- **ET-5. IA.** Prompts dans `learny/tutor/` comme les existants. Sorties validées par schéma, au plus 2 corrections (BR-IA-11). Le contenu est balisé comme donnée (BR-IA-10). Les réponses du mock sont déterministes et ajoutées à ses fixtures.
- **ET-6. Performances.** Pour un PDF de 300 pages en mock, l'analyse doit se terminer en moins de 60 s dans la suite d'intégration. `GET …/simple` doit répondre en moins de 200 ms au p95.
- **ET-7. Sécurité.** Toutes les opérations exigent l'authentification et vérifient la propriété de la formation (RLS et service). Les documents ne sont jamais renvoyés en clair ; on y accède par `resources.readUrl`.

## 7. Comportements attendus et cas limites

- **CL-1.** Extraction en échec (PDF corrompu, image illisible) : la ressource passe en `failed` avec sa raison (BR-APP-07). L'analyse ne démarre pas tant qu'un document `course` n'est pas `ready`. Un document `exercises` en échec est ignoré et signalé dans `steps.practice.detail`.
- **CL-2.** Aucune structure détectable : découpage par blocs de 15 pages ; titres générés depuis les résumés.
- **CL-3.** Modèle indisponible ou sortie invalide après 2 corrections : `simple_analyses.status = 'failed'`, `error = {code: 'AI_TASK_FAILED', message}`. Relancer `POST …/simple/analysis` reprend depuis la première étape non terminée.
- **CL-4.** Double lancement de l'analyse : le second appel renvoie 202 sans créer de second événement (idempotence par `formation_id` et statut).
- **CL-5.** Quatrième formation active à la validation : `FORMATION_LIMIT_REACHED` (comportement existant).
- **CL-6.** Document supprimé après la validation : passages retirés, citations « source supprimée » (BR-APP-10) ; les cours déjà générés restent.
- **CL-7.** Diagnostic sur un programme d'un seul module : une ou deux questions ; tout juste valide le module, ce qui ouvre le bilan si la formation est terminée (BR-FOR-12).
- **CL-8.** Échéance passée ou à moins de 15 jours : `422 VALIDATION_ERROR` avec le libellé existant des dates.

## 8. Instructions d'implémentation

1. Migration et types : enums, colonnes et tables d'ET-3, RLS et matrice RLS. Commit `feat(SPEC-4001): schema du mode simple`.
2. Contrat : `simple-mode.ts`, régénération des artefacts (ET-1). Commit séparé.
3. Domaine pur (`domain/simple.py`) et ses tests unitaires : rôle deviné, bornes de modules, recalcul d'échéance.
4. Cas d'usage de création, de dépôt et de rôle, avec leurs handlers.
5. Détection des sections, résumés et consommateur d'analyse, avec les fixtures du mock.
6. Validation en mode simple : `chapter_sources`, chapitres marqués « terminés », consommateur de génération progressive.
7. Diagnostic : création, refus du `check`, résultat qui valide les modules, `skip`.
8. Mise à jour de `docs/product/business-rules.md` (tableau d'ADR-4003) et de `docs/architecture/api.md`.

## 9. Fichiers et composants concernés

- **Créés** :
  - `packages/contracts/src/simple-mode.ts` ;
  - `python/learny/src/learny/formation/application/simple/*.py` ;
  - `python/learny/src/learny/formation/domain/simple.py` ;
  - `python/learny/src/learny/content/application/section_detection.py` ;
  - `apps/api/src/learny_api/handlers/simple.py` ;
  - la migration `packages/db` ;
  - les tests (section 12).
- **Modifiés** :
  - `packages/contracts/src/index.ts` ;
  - `formation/application/programme.py` (validation en mode simple) ;
  - `apps/worker/.../consumers.py` ;
  - `learny/shared/locale_fr/` ;
  - les artefacts générés (`api/openapi.yaml`, `apps/api/.../generated/*`, SDK, inventaire) ;
  - `docs/architecture/{data-model,api,ai}.md` et `docs/product/business-rules.md`.
- **Réutilisés** : extracteurs, ingestion, embeddings, `programme_proposals`, génération du cours, banque de questions, tentatives, planificateur, FSRS.

## 10. Interface et conformité visuelle

Aucun écran : mode `demo` sans page `/_dev` (ADR-2041). La conformité visuelle est portée par SPEC-4002 et SPEC-4003.

## 11. Critères d'acceptation

- **CA-1.** Un PDF de cours et un PDF de TD déposés, puis l'analyse lancée, donnent un statut `proposed` avec quatre étapes `done`, des `chaptersFound` non vides et une proposition `source = 'document'` dont chaque module porte `pageFrom` et `pageTo`.
- **CA-2.** Sans modèle choisi pour une tâche requise, l'analyse renvoie `409 AI_NOT_CONFIGURED`, `details.tasks` liste les tâches manquantes, et les documents restent présents.
- **CA-3.** Le rôle deviné suit EF-4 sur les cas « Annales DCG 2023 », « TD corrigés » et un document neutre, et `PATCH …/role` est refusé après le lancement (`SIMPLE_ANALYSIS_LOCKED`).
- **CA-4.** Après validation, les deux premiers modules non acquis ont un cours `ready` et les suivants sont `queued` ou `generating` ; aucun chapitre ne demande « chapitre terminé ».
- **CA-5.** Un diagnostic tout juste sur le module 1 valide ce module, et lui seul : ses notions apparaissent dans le quiz global du lendemain. `check` est refusé (`DIAGNOSTIC_NO_CHECK`) et un second diagnostic aussi (`DIAGNOSTIC_ALREADY_DONE`).
- **CA-6.** Une échéance fixe `objectives = ['exam']` et une fin de planning 14 jours avant ; la retirer rétablit `['operational']`.
- **CA-7.** Un utilisateur ne peut ni lire ni modifier l'analyse, les sources ou le diagnostic d'une formation d'un autre (RLS et service).

## 12. Plan de tests

- **Unitaires** (pytest, `[SPEC-4001]`) :
  - `python/learny/tests/unit/formation/test_simple_domain.py` : rôle deviné, bornes de modules (fusion et découpe), recalcul d'échéance ;
  - `…/content/test_section_detection.py` : signets, table des matières, titres, repli à 15 pages.
- **Intégration** (pytest avec base, `[SPEC-4001]`) :
  - `apps/api/tests/integration/test_simple_mode.py` : parcours complet en mock (CA-1, CA-4, CA-6), refus sans clé (CA-2), verrouillage des rôles (CA-3), RLS (CA-7) ;
  - `apps/worker/tests/integration/test_simple_consumers.py` : idempotence (CL-4), reprise après échec (CL-3) ;
  - diagnostic (CA-5).
- **Contrat** : `pnpm contract:check`, `pnpm py:contract:check` et `tools/migration/inventory.mjs --check` passent.
- **End-to-end** (Playwright `@SPEC-4001`, vidéo) dans `apps/web/e2e/specs/SPEC-4001-mode-simple-api.spec.ts` :
  - le parcours API complet (création, dépôt, analyse, validation, diagnostic) est rejoué en mock contre la façade ;
  - les parcours existants touchés par la validation (`@SPEC-605`, `@SPEC-607`) restent verts.
- **Visuel** (`@SPEC-4001 @visual`) : l'écran Programme existant (SCR-05, `Programme.dc.html?proposition`) affiche sans écart une proposition `source = 'document'` créée par l'API. Viewport, données et horloge figés ; écart de 12 % au plus.
- Le parcours visuel complet du mode simple est porté par SPEC-4002 (web) et SPEC-4003 (mobile).
- **Non-régression** : rejouer SPEC-605, SPEC-607, SPEC-608, SPEC-611 et SPEC-618.

| Critère | Tests |
|---|---|
| CA-1 | `test_simple_mode.py::test_full_flow_mock` |
| CA-2 | `test_simple_mode.py::test_analysis_refused_without_model` |
| CA-3 | `test_simple_domain.py::test_guess_role_*`, `test_simple_mode.py::test_role_locked` |
| CA-4 | `test_simple_mode.py::test_progressive_generation` |
| CA-5 | `test_simple_mode.py::test_diagnostic_*` |
| CA-6 | `test_simple_domain.py::test_deadline_*`, `test_simple_mode.py::test_deadline_patch` |
| CA-7 | `test_simple_mode.py::test_rls_other_user` |

## 13. Preuves attendues

`evidence/SPEC-4001/` :
- rapports pytest unitaires et d'intégration ;
- trace JSON d'un parcours complet en mock (réponses de `GET …/simple` à chaque étape) ;
- sortie de `inventory.mjs --check` ;
- `acceptance.md` avec CA-1 à CA-7 cochés et leurs preuves.

## 14. Définition de terminé

Définition commune (`docs/engineering/testing.md` §7), avec en plus :
- le contrat est régénéré et vérifié ;
- les règles modifiées sont reportées dans `business-rules.md` ;
- aucune régression des spécifications listées en section 12.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-4001, ADR-4002, ADR-4003, ADR-4008 (noms d'événements pointés acceptés par `enqueue_event` ; tâche `simple_analysis` hors du sélecteur à cinq tâches, ajoutée par SPEC-4002).
- Le plafond de 10 documents par formation en mode simple et les marqueurs du rôle deviné sont des décisions de cette spécification, consignées dans ADR-4003 au titre du dépôt.
- Hypothèse : les extracteurs existants couvrent PDF, DOCX (via l'import de programme), images, pages web et YouTube ; l'extraction DOCX des apports est ajoutée si elle manque, sur le modèle de `import_file.py`.
