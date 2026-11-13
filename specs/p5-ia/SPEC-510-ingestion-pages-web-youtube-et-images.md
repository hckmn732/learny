---
id: SPEC-510
title: "Ingestion : pages web, YouTube et images"
phase: P5
priority: V1
depends_on: [SPEC-509]
business_rules: [BR-APP-01]
screens: []
adrs: [ADR-0057, ADR-0302]
visual: demo
---

# SPEC-510 — Ingestion : pages web, YouTube et images

## 1. Objectif

Récupération sécurisée des pages (anti-SSRF, timeout, taille), Readability ; sous-titres YouTube avec horodatage ; lecture des images par vision (tâche light) ; erreurs explicites (pas de sous-titres, page inaccessible). La livraison est vérifiable par les contrats, les états d’interface et les critères de la section 11.

## 2. Contexte

Lire `docs/product/business-rules.md` (BR-APP-01), `docs/architecture/ai.md`, `docs/architecture/data-model.md` §3, §5 et §9, `docs/architecture/overview.md` §4, `docs/engineering/conventions.md` et `docs/engineering/testing.md`. ADR applicables : ADR-0057. Les appels modèle passent par `@learny/llm` ; les tests emploient seulement `LLM_MODE=mock`.

## 3. Dépendances

- **SPEC-509** — pipeline de statut, passage et embedding.
- Les tests automatiques utilisent `LLM_MODE=mock`, des fixtures versionnées et une horloge fixée à `2026-11-11T12:20:00Z`. Aucune clé personnelle ni appel réel à un fournisseur n’entre dans les preuves.

## 4. Règles métier couvertes

- **BR-APP-01** — Types d'apports V1, déposés par chapitre : note (idées, brouillon, texte brut ou Markdown), PDF, page web (par URL), vidéo YouTube (par URL ; sous-titres importés avec minutage), image ou capture (lue automatiquement).

## 5. Exigences fonctionnelles

- **EF-1** — Importer une page web après validation de l’URL publique, respect de robots.txt, délai de 15 s et limite de 5 Mo ; extraire titre, texte principal et ancrages avec Readability/linkedom.
- **EF-2** — Importer les sous-titres publics d’une vidéo YouTube avec horodatages de début/fin ; si aucun sous-titre n’est disponible, marquer l’apport en échec avec raison explicite.
- **EF-3** — Lire une image ou capture par la tâche IA `light` avec vision, conserver le texte/description comme passage lié à la ressource et signaler son origine modèle.
- **EF-4** — Découper les textes extraits et créer les embeddings par le pipeline SPEC-509, sans dupliquer logique de statut ou de reprise.
- **EF-5** — Refuser les adresses locales, privées, de métadonnées cloud, redirections vers ces adresses et URL de protocole non HTTP(S), avant toute récupération de contenu.

## 6. Exigences techniques

- **ET-1** — `assertPublicUrl(url)` valide DNS et adresse IP de chaque redirection ; la connexion utilise l’adresse vérifiée pour prévenir une résolution différente entre contrôle et requête.
- **ET-2** — `extractWeb(url)` retourne `{title,text,anchors,sourceUrl}` avec limite 5 Mo/15 s ; `extractYoutube(url)` retourne des segments `{startSec,endSec,text}` ; `extractImage(resource, llm)` retourne texte et métadonnées d’origine.
- **ET-3** — Les sorties sont converties en `resource_chunks` via SPEC-509 ; aucune recherche web générale ou contenu non demandé ne s’ajoute à un cours.
- **ET-4** — Les entrées et sorties sont validées par Zod ; l’accès aux données passe par le client utilisateur et RLS, les opérations système par un service explicitement autorisé. Les secrets et contenus d’apports ne figurent pas dans les journaux.
- **ET-5** — Les scénarios de test utilisent des fixtures déterministes, un fournisseur simulé et l’horloge injectable. Les échecs externes rendent un code et un message sûrs, sans bascule payante automatique ni résultat inventé.

## 7. Comportements attendus et cas limites

- **CL-1** — URL redirigeant vers 127.0.0.1 ou une IP privée : refus avant seconde requête.
- **CL-2** — Page interdite par robots.txt : `failed` avec `ROBOTS_DISALLOWED`.
- **CL-3** — Délai ou taille dépassés : erreur bornée sans contenu partiel.
- **CL-4** — YouTube sans sous-titres publics : `NO_CAPTIONS` et bouton Réessayer seulement si la source peut changer.
- **CL-5** — Image illisible ou modèle absent : erreur lisible ; aucune description inventée.

## 8. Instructions d'implémentation

1. Définir les contrats Zod et les fixtures `LLM_MODE=mock` du scénario ; vérifier les décisions ADR avant toute nouvelle valeur.
2. Implémenter `packages/ingestion/src/extract/remote.ts` et ses services en séparant validation, accès aux données et appel à `@learny/llm`. Commits atomiques `feat(SPEC-510): …`.
3. Ajouter la page de démonstration SDD avec états succès, absence de données et erreur sûre ; aucune clé ni donnée privée n’est rendue.
4. Écrire tests unitaires, intégration avec RLS et e2e filmé, puis contrôle visuel et axe. Commit `test(SPEC-510): …`.
5. Exécuter `validate.mjs SPEC-510`, renseigner chaque CA avec une preuve réelle et terminer par `complete.mjs`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/ingestion/src/extract/remote.ts`, `packages/ingestion/src/extract/web.ts`, `packages/ingestion/src/extract/youtube.ts`, `packages/ingestion/src/extract/image.ts`, `packages/ingestion/src/extract/remote.test.ts`, `packages/ingestion/test/integration/remote.test.ts`, `apps/web/components/sdd-demos/spec-510.tsx`, `apps/web/e2e/specs/p5/spec-510.spec.ts`.
- **Modifiés** : `packages/contracts/src/index.ts`, `packages/jobs/src/functions/index.ts` si un job est introduit, `apps/web/app/%5Fdev/sdd/registry.ts`, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `@learny/llm`, `@learny/contracts`, `@learny/db`, fixtures mock et services des dépendances ; dépendances SPEC-509.

## 10. Interface et conformité visuelle

Mode `demo`. Page SDD : onglets Page web, YouTube, Image avec source de fixture, statut, extrait et localisation (ancre/minute), plus refus SSRF et absence de sous-titres clairement étiquetés. Page `/_dev/sdd/SPEC-510` : afficher le scénario simulé, le contrat d’entrée, le résultat validé et un échec lisible, sans clé ni contenu privé. Mode `demo` : jetons, structure, axe et capture desktop/mobile à 1 %. Aucun appel à un fournisseur réel dans le navigateur.

## 11. Critères d'acceptation

- **CA-1** — Une page publique de fixture produit titre, texte principal et ancrages, puis des passages citables sans contenu de navigation parasite.
- **CA-2** — Une vidéo de fixture produit des segments horodatés et une vidéo sans sous-titres produit `NO_CAPTIONS`.
- **CA-3** — URL privée directe ou après redirection, robots refusé, dépassement de 15 s ou 5 Mo sont bloqués avec le code attendu.
- **CA-4** — Une image traitée en `LLM_MODE=mock` produit un passage marqué comme lecture IA, stable à répétition, sans appel réel.
- **CA-5** — La démonstration compare les trois types et erreurs, avec vidéo, axe et `@visual`.

## 12. Plan de tests

- **Unitaires** — `packages/ingestion/src/extract/remote.test.ts`, `describe('[SPEC-510] Ingestion : pages web, YouTube et images')` : validation URL et extraction des trois types, validation Zod et erreurs simulées (CA-1 à CA-3).
- **Intégration** — `packages/ingestion/test/integration/remote.test.ts`, `describe('[SPEC-510] service')` : pipeline de passages et refus SSRF avec serveur de fixture, RLS de deux utilisateurs, fournisseur simulé et reprise idempotente (CA-2 à CA-4).
- **End-to-end** — `apps/web/e2e/specs/p5/spec-510.spec.ts`, `test('Ingestion : pages web, YouTube et images @SPEC-510')` : sélection des trois sources et lecture des erreurs dans la démonstration, vidéo et capture (CA-1, CA-5).
- **Visuel** — `test('Ingestion : pages web, YouTube et images @SPEC-510 @visual')` : jetons, structure, axe, desktop/mobile à 1 % (CA-5).
- **Non-régression** — rejouer les étiquettes `[SPEC-509]` / `@SPEC-509`.

| Critère | Tests |
|---|---|
| CA-1 | unitaires ; e2e |
| CA-2 | unitaires ; intégration |
| CA-3 | unitaires ; intégration |
| CA-4 | intégration |
| CA-5 | e2e ; @visual |

## 13. Preuves attendues

`evidence/SPEC-510/` contient `unit.json`, `integration.json`, `e2e.json`, `e2e.xml`, `checks.json`, une vidéo réelle du scénario `@SPEC-510`, captures desktop/mobile, comparaisons visuelles applicables et `acceptance.md` reliant chaque CA au test et à sa sortie. Aucune capture ou réussite n’est déclarée sans fichier effectivement généré.

## 14. Définition de terminé

La définition commune de `docs/engineering/testing.md` §7 est remplie : lint, typecheck, build, tests unitaires et d’intégration filtrés, e2e avec vidéo, au moins un test `@visual`, axe, preuves et absence de régression. Le fournisseur simulé couvre le succès et les erreurs ; aucune clé ou donnée privée n’apparaît dans les preuves et aucun appel réel n’a lieu en CI.

## 15. Décisions et hypothèses

Décisions appliquées : ADR-0057, ADR-0302. Les valeurs normatives viennent des règles métier et de la maquette ; aucune valeur produit n’est introduite hors du catalogue. Toute ambiguïté d’implémentation découverte ensuite suit `docs/engineering/sdd-process.md` §4 et produit un ADR avant modification de la spécification.
