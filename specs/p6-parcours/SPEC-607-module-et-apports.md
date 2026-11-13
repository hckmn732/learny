---
id: SPEC-607
title: "Module et apports"
phase: P6
priority: V1
depends_on: [SPEC-606, SPEC-509, SPEC-510, SPEC-512]
business_rules: [BR-APP-01, BR-APP-02, BR-APP-04, BR-APP-05, BR-APP-07, BR-APP-10, BR-NAV-04]
screens: [SCR-06]
adrs: [ADR-0039, ADR-0065]
visual: mockup
---

# SPEC-607 — Module et apports

## 1. Objectif

Écran Module.dc.html : fil d'Ariane, chapitres et statuts, dépôt (PDF, audio/vidéo masqués en V1, lien web, YouTube, image, note), idées et brouillons, liste des apports avec statut de traitement, renommer/supprimer/réessayer, suggestions du tuteur, J'ai terminé ce chapitre, génération du cours. Cette spécification livre le contrat, le service, les états d’interface ou de démonstration et les validations nécessaires pour que la capacité soit utilisable et prouvée sans appel à un service réel dans les tests.

## 2. Contexte

Lire `docs/product/vision.md`, `docs/product/business-rules.md`, `docs/product/screens.md`, `docs/architecture/overview.md`, `docs/architecture/data-model.md`, `docs/architecture/api.md`, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. Écran concerné : SCR-06 : `/formations/[fid]/modules/[mid]`. Les maquettes sont en lecture seule ; le jeu de données SPEC-115 et l’horloge du 11 novembre 2026 permettent des captures reproductibles. Les ADR listés en section 15 priment sur ce texte en cas de conflit.

## 3. Dépendances

- **SPEC-606** — Programme en cours ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-509** — Ingestion : notes et PDF, découpage, embeddings ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-510** — Ingestion : pages web, YouTube et images ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **SPEC-512** — Recherche web ; réutiliser ses contrats publics, schémas et services sans les dupliquer.
- **Architecture transversale** — Les services applicatifs utilisent les contrats Zod de `packages/contracts`, `handler()` de SPEC-201, le client utilisateur soumis à RLS de SPEC-113 et les événements de SPEC-203. Les composants interactifs réutilisent `@learny/ui` et les textes passent par `apps/web/messages/fr.ts`.
- **Services externes** — Les tests utilisent Supabase local et `LLM_MODE=mock`; tout secret réel reste côté serveur. Si un service tiers est indisponible, exécuter les parties mock, consigner le blocage externe selon `sdd-process.md` §3, sans inventer de résultat.

## 4. Règles métier couvertes

- **BR-APP-01** — Types d'apports V1, déposés par chapitre : note (idées, brouillon, texte brut ou Markdown), PDF, page web (par URL), vidéo YouTube (par URL ; sous-titres importés avec minutage), image ou capture (lue automatiquement).
- **BR-APP-02** — Limites : PDF ≤ 50 Mo et ≤ 500 pages ; image ≤ 10 Mo (JPEG, PNG, WebP, HEIC) ; note ≤ 100 000 caractères ; 100 apports par chapitre ; stockage total ≤ 2 Go par utilisateur. Un dépassement est refusé avec un message explicite.
- **BR-APP-04** — Chaque chapitre a un statut d'apports : « en cours » ou « terminé ». L'apprenant déclare un chapitre terminé ; quand tous les chapitres d'un module sont terminés (ou sur demande « Générer le cours maintenant »), la génération du cours est lancée.
- **BR-APP-05** — Le tuteur peut suggérer des ressources trouvées sur le web pour un chapitre (titre, URL, raison) ; l'apprenant les importe ou les ignore.
- **BR-APP-07** — Statut de traitement d'un apport : en file, en cours, prêt, échec (avec raison lisible et bouton « Réessayer »).
- **BR-APP-10** — Un apport peut être renommé ou supprimé ; sa suppression retire ses passages et marque les citations correspondantes « source supprimée ».
- **BR-NAV-04** — Les modules s'ouvrent depuis le Programme ; Module, Cours, Exercice, Quiz affichent un fil d'Ariane (Programme / Module n · titre / page).

## 5. Exigences fonctionnelles

- **EF-1** — L’ajout d’un apport se fait dans le chapitre sélectionné : note texte/Markdown, PDF, page web, URL YouTube, image JPEG/PNG/WebP/HEIC. Les entrées audio et vidéo fichier restent masquées en V1.
- **EF-2** — Refuser PDF > 50 Mo ou > 500 pages, image > 10 Mo, note > 100 000 caractères, 101e apport d’un chapitre ou dépassement du quota utilisateur de 2 Go avec un message indiquant la limite atteinte.
- **EF-3** — Chaque apport affiche `queued|processing|ready|failed`, raison lisible et « Réessayer » pour l’échec. Renommer conserve les passages ; supprimer retire les passages et remplace les citations existantes par « source supprimée ».
- **EF-4** — « J’ai terminé ce chapitre » passe son état à terminé ; tous les chapitres terminés ou « Générer le cours maintenant » émettent une seule demande de génération. Une suggestion de ressource peut être importée ou ignorée sans importer silencieusement.
- **EF-5** — Les règles métier BR-APP-01, BR-APP-02, BR-APP-04, BR-APP-05, BR-APP-07, BR-APP-10, BR-NAV-04 de la section 4 sont obligatoires dans tous les états, y compris les erreurs et la reprise.

## 6. Exigences techniques

- **ET-1** — Chaque lecture et mutation utilise le client de l’utilisateur soumis à RLS ; un autre utilisateur reçoit 404. Les entrées/sorties passent par les schémas Zod de `packages/contracts`, et les routes renvoient `application/problem+json` en erreur.
- **ET-2** — Les écritures multi-tables sont transactionnelles ; un événement est émis après commit et une clé d’idempotence empêche une double transition. Les dates passent par l’horloge injectable et le fuseau IANA du profil.
- **ET-3** — Contrats Zod de note/URL/renommage et états d’apport dans `packages/contracts/src/resources.ts`; utiliser le service d’envoi signé SPEC-206 pour les fichiers, puis finaliser seulement après contrôle MIME et quota côté serveur.
- **ET-4** — Le service `packages/services/src/resources/` vérifie propriétaire et chapitre, tient le compteur d’apports et le quota dans une transaction, émet `resource/uploaded` après commit et `chapter/contributions-completed` une seule fois par version de chapitre.
- **ET-5** — Les ressources suggérées sont marquées `suggested|imported|dismissed` ; l’URL est validée contre les règles anti-SSRF de SPEC-510 lors de son ingestion, jamais téléchargée par le navigateur comme preuve de traitement.

## 7. Comportements attendus et cas limites

- **CL-1** — Identifiant ou donnée hors schéma : 400 `VALIDATION_FAILED`, sans écriture ni événement ; ressource d’un autre propriétaire : 404 sans révéler son existence.
- **CL-2** — Deux demandes concurrentes identiques ne créent qu’un effet ; une version d’objet devenue obsolète renvoie 409 `CONFLICT` et restitue l’état actuel.
- **CL-3** — Fichier dont extension et MIME réel diffèrent : finalisation refusée, objet temporaire purgé.
- **CL-4** — Suppression pendant une ingestion : le job ne restaure pas les passages et aucune citation ne pointe vers un contenu supprimé.
- **CL-5** — Deux clics « J’ai terminé » concurrents : un seul changement d’état et une seule génération du cours.

## 8. Instructions d'implémentation

1. Définir schémas des notes, URL et états de ressource, plus limites exactes de BR-APP-02 dans `product.ts`. Commit `feat(SPEC-607): définit les contrats`.
2. Implémenter dépôt signé/finalisation, notes/URL, liste, renommage, suppression et suggestions dans les services RLS. Commit `feat(SPEC-607): implémente les services`.
3. Émettre `resource/uploaded` et `chapter/contributions-completed` après commit avec déduplication ; brancher les statuts d’ingestion. Commit `feat(SPEC-607): construit le parcours`.
4. Composer `Module.dc.html` : fil d’Ariane, chapitres, dépôt V1, liste, suggestions et actions de fin. Commit `test(SPEC-607): vérifie les cas`.
5. Exécuter `node tools/sdd/validate.mjs SPEC-607`, renseigner les preuves réellement produites puis `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/contracts/src/resources.ts`, `packages/services/src/resources/{create,rename,delete,complete-chapter,suggestions}.ts`, `packages/services/test/integration/module-resources.test.ts`, `apps/web/app/(app)/formations/[fid]/modules/[mid]/page.tsx`, `apps/web/components/module/{ChapterTabs,ResourceDropzone,ResourceList,ResourceSuggestion}.tsx`, `apps/web/e2e/specs/p6/module-resources.spec.ts`.
- **Modifiés** : `packages/jobs/src/events.ts`, `packages/db/src/schema/resources.ts`, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `specs/p6-parcours/SPEC-606-programme-en-cours.md`, `specs/p5-ia/SPEC-509-ingestion-notes-et-pdf-decoupage-embeddings.md`, `specs/p5-ia/SPEC-510-ingestion-pages-web-youtube-et-images.md`, `specs/p5-ia/SPEC-512-recherche-web.md`.

## 10. Interface et conformité visuelle

`Module.dc.html` : fil d’Ariane, chapitres avec états, zone de dépôt, formulaires note/URL, liste d’apports avec statut, suggestions et action de fin. `data-testid` : `module-chapters`, `resource-dropzone`, `resource-status`, `chapter-complete`, `course-generate`.

- **Contrôles** — Utiliser la référence du SCR-06 dans `design/references/` et mesurer ≤ 12 % de pixels différents ; vérifier les jetons, l’ordre des régions, les textes, axe sans violation serious/critical et la ligne de base `toHaveScreenshot` ≤ 1 % à 1440 × 900 et 390 × 844. Les états chargement, vide, erreur et permission refusée sont distincts, accessibles au clavier et annoncés sans dépendre de la seule couleur.

## 11. Critères d'acceptation

- **CA-1** — Les six types V1 sont proposés et les deux types V2 ne le sont pas ; les cinq limites numériques sont refusées au delà de la borne.
- **CA-2** — Un apport qui échoue présente sa raison et « Réessayer » ; après réussite il est `ready`, et sa suppression marque la citation « source supprimée ».
- **CA-3** — Terminer tous les chapitres émet exactement un événement de génération ; une suggestion ignorée ne crée aucun apport.
- **CA-4** — Un second utilisateur reçoit 404 pour les données du premier ; deux requêtes identiques ne dupliquent ni écriture ni événement, et une requête invalide ne crée rien.
- **CA-5** — L’écran respecte la maquette avec un écart ≤ 12 % ; axe ne signale aucune violation serious/critical, les captures desktop/mobile restent ≤ 1 % et une vidéo e2e est conservée.

## 12. Plan de tests

**Unitaires** (2 fichiers, `[SPEC-607]`) :
- `packages/services/src/resources/limits.test.ts` — `[SPEC-607]` : PDF 50 Mo/500 pages, image 10 Mo, note 100 000 caractères, 100 apports, quota 2 Go : bornes acceptées puis dépassement refusé.
- `apps/web/components/module/ResourceList.test.tsx` — `[SPEC-607]` : queued/processing/ready/failed, raison et bouton Réessayer ; audio/vidéo fichier absents.

**Intégration** (Supabase local, `LLM_MODE=mock`, `[SPEC-607]`) :
- `packages/services/test/integration/module-resources.test.ts` — `[SPEC-607]` : ajout, renommage, suppression avec passages et citations « source supprimée », import/ignorance d’une suggestion, fin de chapitre et événement unique, RLS entre membres de groupe.

**End-to-end** (`apps/web/e2e/specs/p6/module-resources.spec.ts`, vidéo) :
- **Scénario** — `dépose des apports et termine un chapitre @SPEC-607` : Alex ouvre module, ajoute note et PDF de test, suit statuts, termine les chapitres et voit Générer le cours.
- **Scénario** — `erreur et reprise d’un apport @SPEC-607` : fixture ingestion échouée, raison visible puis Réessayer et état prêt.

**Visuel** — `test('conformité SPEC-607 @SPEC-607 @visual')` : `SCR-06-desktop.png` et mobile : fil d’Ariane, chapitres, dépôt, liste d’apports et suggestions ; état processing et failed ; diff ≤ 12 %, axe et capture ≤ 1 %.

**Non-régression** — Rejouer `[SPEC-606]` et `@SPEC-606`, `[SPEC-509]` et `@SPEC-509`, `[SPEC-510]` et `@SPEC-510`, `[SPEC-512]` et `@SPEC-512` et les suites complètes unitaires/intégration.

| Critère | Tests |
|---|---|
| CA-1 | unitaires et intégration ciblés ; e2e `@SPEC-607` |
| CA-2 | unitaires et intégration ciblés ; e2e `@SPEC-607` |
| CA-3 | unitaires et intégration ciblés ; e2e `@SPEC-607` |
| CA-4 | intégration RLS/idempotence, e2e erreur |
| CA-5 | `@SPEC-607 @visual`, axe, vidéo |

## 13. Preuves attendues

`evidence/SPEC-607/` contient les rapports réels `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, au moins une vidéo Playwright, les captures finales et `acceptance.md` avec preuve vérifiable pour CA-1 à CA-5. Conserver la comparaison côte à côte et le diff avec la référence de maquette. Une pièce manquante fait échouer la validation ; aucune preuve n’est fabriquée.

## 14. Définition de terminé

Toutes les validations de `docs/engineering/testing.md` §7 passent : lint, typecheck, build, unitaires, intégration, e2e avec vidéo, `@visual`, axe, non-régression et CA cochés avec preuve. Les limites et cas d’échec de cette spécification sont couverts, les contrats API restent documentés, et aucune donnée d’un autre utilisateur n’est rendue.

## 15. Décisions et hypothèses

- **ADR-0039 — Limites d'import et suppression d'apports** : Limites de BR-APP-02. Suppression d'un apport : suppression du fichier et des passages ; les citations qui y pointaient sont conservées avec `chunk_id = null` et affichées « source supprimée ».
- **ADR-0065 — Suivi des traitements asynchrones dans l'interface** : Interrogation périodique (TanStack Query, intervalle 3 s tant que le statut est `queued|processing|generating|running`), pas de temps réel WebSocket en V1.
- **ADR-0312 — Génération du cours et reprise d’un apport** : émission unique à la transition vers tous les chapitres terminés ou sur demande explicite, identifiant d’événement déterministe par version, reprise d’un apport en échec avec un événement suffixé par la tentative, guide d’examen V1 marqué sur un PDF ou une page web, fichiers audio/vidéo absents de l’interface.
- Aucune décision ouverte : une ambiguïté découverte pendant l’implémentation suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification du périmètre.

