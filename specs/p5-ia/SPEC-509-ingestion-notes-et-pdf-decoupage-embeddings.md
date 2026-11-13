---
id: SPEC-509
title: "Ingestion : notes et PDF, découpage, embeddings"
phase: P5
priority: V1
depends_on: [SPEC-104, SPEC-203, SPEC-504, SPEC-206]
business_rules: [BR-APP-01, BR-APP-06, BR-APP-07]
screens: []
adrs: [ADR-0056, ADR-0057]
visual: demo
---

# SPEC-509 — Ingestion : notes et PDF, découpage, embeddings

## 1. Objectif

Job resource/uploaded : extraction (unpdf), envoi API Files si Anthropic, découpage ~800 tokens avec emplacements, embeddings Voyage (mock déterministe), statuts et erreurs lisibles, réessai. La livraison est vérifiable par les contrats, les états d’interface et les critères de la section 11.

## 2. Contexte

Lire `docs/product/business-rules.md` (BR-APP-01, BR-APP-06, BR-APP-07), `docs/architecture/ai.md`, `docs/architecture/data-model.md` §3, §5 et §9, `docs/architecture/overview.md` §4, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. ADR applicables : ADR-0056, ADR-0057. Les appels modèle passent par `@learny/llm` ; les tests emploient seulement `LLM_MODE=mock`.

## 3. Dépendances

- **SPEC-104** — ressources et passages.
- **SPEC-203** — événements et jobs.
- **SPEC-504** — embeddings/Files via les fournisseurs.
- **SPEC-206** — fichiers signés et contrôlés.
- Les tests automatiques utilisent `LLM_MODE=mock`, des fixtures versionnées et une horloge fixée à `2026-11-11T12:20:00Z`. Aucune clé personnelle ni appel réel à un fournisseur n’entre dans les preuves.

## 4. Règles métier couvertes

- **BR-APP-01** — Types d'apports V1, déposés par chapitre : note (idées, brouillon, texte brut ou Markdown), PDF, page web (par URL), vidéo YouTube (par URL ; sous-titres importés avec minutage), image ou capture (lue automatiquement).
- **BR-APP-06** — Chaque apport est découpé en passages repérés (page pour un PDF, horodatage pour une vidéo, ancre pour une page web, position pour une note) ; ces passages servent aux citations et à la recherche sémantique.
- **BR-APP-07** — Statut de traitement d'un apport : en file, en cours, prêt, échec (avec raison lisible et bouton « Réessayer »).

## 5. Exigences fonctionnelles

- **EF-1** — Consommer `resource/uploaded` pour une note ou un PDF privé, passer le statut en file → en cours → prêt, ou échec avec code et message lisible permettant Réessayer.
- **EF-2** — Extraire une note en conservant ses positions et un PDF par page avec `unpdf`; si le modèle Anthropic est choisi, envoyer aussi le PDF à son API Files côté serveur et conserver l’identifiant dans les métadonnées privées.
- **EF-3** — Découper sur limites de paragraphes en passages d’environ 800 tokens avec chevauchement 100 et emplacement `{page?,charStart,charEnd}` vérifiable ; chaque passage cite l’apport propriétaire.
- **EF-4** — Créer un embedding Voyage `voyage-4-lite` de dimension 1024 par passage ; en mock, produire un vecteur déterministe dérivé d’un hachage du texte, sans réseau.
- **EF-5** — Réessayer une erreur transitoire sans créer deux ensembles de passages ; une erreur permanente laisse l’apport en `failed` et explique le prochain geste.

## 6. Exigences techniques

- **ET-1** — `processResource(ctx, resourceId)` verrouille la ressource propriétaire, choisit l’extracteur par `kind`, écrit les `resource_chunks` et statut dans une transaction, puis émet `resource/ready|failed`.
- **ET-2** — `chunkText({ text, locations, targetTokens=800, overlapTokens=100 })` est pure et conserve offsets et page ; les embeddings vérifient exactement 1024 dimensions.
- **ET-3** — Le job Inngest possède des étapes idempotentes extraction, découpage, embedding et finalisation ; les passages antérieurs sont remplacés atomiquement seulement après succès complet.
- **ET-4** — Les entrées et sorties sont validées par Zod ; l’accès aux données passe par le client utilisateur et RLS, les opérations système par un service explicitement autorisé. Les secrets et contenus d’apports ne figurent pas dans les journaux.
- **ET-5** — Les scénarios de test utilisent des fixtures déterministes, un fournisseur simulé et l’horloge injectable. Les échecs externes rendent un code et un message sûrs, sans bascule payante automatique ni résultat inventé.

## 7. Comportements attendus et cas limites

- **CL-1** — PDF sans texte : `failed` avec raison lisible, pas de passage vide.
- **CL-2** — PDF chiffré ou corrompu : échec contrôlé sans contenu partiel.
- **CL-3** — Voyage indisponible : reprise de l’étape embedding, statut non `ready`.
- **CL-4** — Même événement reçu deux fois : aucun doublon de passage ou vecteur.
- **CL-5** — Apport supprimé pendant le traitement : arrêt sans le recréer.

## 8. Instructions d'implémentation

1. Définir les contrats Zod et les fixtures `LLM_MODE=mock` du scénario ; vérifier les décisions ADR avant toute nouvelle valeur.
2. Implémenter `packages/ingestion/src/process-resource.ts` et ses services en séparant validation, accès aux données et appel à `@learny/llm`. Commits atomiques `feat(SPEC-509): …`.
3. Ajouter la page de démonstration SDD avec états succès, absence de données et erreur sûre ; aucune clé ni donnée privée n’est rendue.
4. Écrire tests unitaires, intégration avec RLS et e2e filmé, puis contrôle visuel et axe. Commit `test(SPEC-509): …`.
5. Exécuter `validate.mjs SPEC-509`, renseigner chaque CA avec une preuve réelle et terminer par `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/ingestion/src/process-resource.ts`, `packages/ingestion/src/extract/pdf.ts`, `packages/ingestion/src/extract/note.ts`, `packages/ingestion/src/chunk.ts`, `packages/ingestion/src/embeddings.ts`, `packages/ingestion/src/process-resource.test.ts`, `packages/jobs/src/functions/ingest-resource.ts`, `packages/ingestion/test/integration/resource.test.ts`, `apps/web/components/sdd-demos/spec-509.tsx`, `apps/web/e2e/specs/p5/spec-509.spec.ts`.
- **Modifiés** : `packages/contracts/src/index.ts`, `packages/jobs/src/functions/index.ts` si un job est introduit, `apps/web/app/%5Fdev/sdd/registry.ts`, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `@learny/llm`, `@learny/contracts`, `@learny/db`, fixtures mock et services des dépendances ; dépendances SPEC-104, SPEC-203, SPEC-504, SPEC-206.

## 10. Interface et conformité visuelle

Mode `demo`. Page SDD : note et PDF fictifs, étapes extraction/découpage/embedding, tableau de passages avec page et offset, vecteur résumé par dimension ; états prêt/échec et Réessayer. Page `/_dev/sdd/SPEC-509` : afficher le scénario simulé, le contrat d’entrée, le résultat validé et un échec lisible, sans clé ni contenu privé. Mode `demo` : jetons, structure, axe et capture desktop/mobile à 1 %. Aucun appel à un fournisseur réel dans le navigateur.

## 11. Critères d'acceptation

- **CA-1** — Une note et un PDF de test créent des passages avec positions et pages permettant de retrouver l’extrait exact.
- **CA-2** — Chaque vecteur a 1024 dimensions et le mock donne le même vecteur pour le même texte à deux exécutions.
- **CA-3** — Un événement livré deux fois ne duplique ni passages ni appel d’embedding déjà terminé.
- **CA-4** — PDF vide/corrompu et fournisseur indisponible donnent un statut/raison visibles et un bouton de réessai exploitable.
- **CA-5** — La démonstration montre statuts et passages mock, avec vidéo, axe et `@visual`.

## 12. Plan de tests

- **Unitaires** — `packages/ingestion/src/process-resource.test.ts`, `describe('[SPEC-509] Ingestion : notes et PDF, découpage, embeddings')` : découpage, chevauchement et vecteur déterministe, validation Zod et erreurs simulées (CA-1 à CA-3).
- **Intégration** — `packages/ingestion/test/integration/resource.test.ts`, `describe('[SPEC-509] service')` : job idempotent et statuts en base, RLS de deux utilisateurs, fournisseur simulé et reprise idempotente (CA-2 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p5/spec-509.spec.ts`, `test('Ingestion : notes et PDF, découpage, embeddings @SPEC-509')` : lancement de deux apports et lecture des passages dans la démonstration, vidéo et capture (CA-1, CA-5).
- **Visuel** — `test('Ingestion : notes et PDF, découpage, embeddings @SPEC-509 @visual')` : jetons, structure, axe, desktop/mobile à 1 % (CA-5).
- **Non-régression** — rejouer les étiquettes `[SPEC-104]` / `@SPEC-104`, `[SPEC-203]` / `@SPEC-203`, `[SPEC-504]` / `@SPEC-504`, `[SPEC-206]` / `@SPEC-206`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; e2e |
| CA-2 | unitaires ; intégration |
| CA-3 | unitaires ; intégration |
| CA-4 | intégration |
| CA-5 | e2e ; @visual |

## 13. Preuves attendues

`evidence/SPEC-509/` contient `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, une vidéo réelle du scénario `@SPEC-509`, captures desktop/mobile, comparaisons visuelles applicables et `acceptance.md` reliant chaque CA au test et à sa sortie. Aucune capture ou réussite n’est déclarée sans fichier effectivement généré.

## 14. Définition de terminé

La définition commune de `docs/engineering/testing.md` §7 est remplie : lint, typecheck, build, tests unitaires et d’intégration filtrés, e2e avec vidéo, au moins un test `@visual`, axe, preuves et absence de régression. Le fournisseur simulé couvre le succès et les erreurs ; aucune clé ou donnée privée n’apparaît dans les preuves et aucun appel réel n’a lieu en CI.

## 15. Décisions et hypothèses

Décisions appliquées : ADR-0056, ADR-0057, ADR-0297. Les valeurs normatives viennent des règles métier et de la maquette ; aucune valeur produit n’est introduite hors du catalogue. Toute ambiguïté d’implémentation découverte ensuite suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification de la spécification.
