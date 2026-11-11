---
id: SPEC-903
title: Détection des liens entre ressources et entre modules
phase: P9
priority: V2
depends_on: [SPEC-616, SPEC-511]
business_rules: [BR-CAR-06]
screens: [SCR-14]
adrs: [ADR-0207]
visual: mockup
---

# SPEC-903 — Détection des liens entre ressources et entre modules

## 1. Objectif

Repérer des liens pédagogiques entre ressources personnelles et entre notions de modules différents, les faire valider par le tuteur puis les rendre visibles avec leur justification dans la carte des notions et le cours. Les liens issus d'apports privés restent privés, même dans une formation à plusieurs.

## 2. Contexte

BR-CAR-06 ajoute en V2 les liens « repérés » déjà prévus par la légende SCR-14. Lire `docs/product/business-rules.md` BR-CAR-01/04/06 et BR-APP-03/06/10, `docs/architecture/data-model.md` §2–§3 et §11, `docs/architecture/ai.md` §3–§4, `docs/product/screens.md` SCR-14 et SCR-07, SPEC-511 (recherche sémantique), SPEC-616 (API et graphe SVG), SPEC-609 (cours) et ADR-0207. La disposition du graphe reste déterministe selon ADR-0036 ; l'ajout de liens ne doit pas dépendre de l'ordre de réponse du fournisseur IA.

## 3. Dépendances

- **SPEC-616** : API `GET /formations/:fid/notion-graph`, nœuds/liens, panneau détail et interactions du graphe.
- **SPEC-511** : passages et embeddings filtrés par utilisateur/formation/chapitre, budget de contexte et identifiants de passage.
- **SPEC-508** : action structurée du tuteur avec schéma, `guard` et exécution côté code ; aucune écriture directe du modèle.
- **SPEC-104/113/509** : ressources/passages, RLS et événements de disponibilité/suppression ; les traitements en mode mock restent déterministes.

## 4. Règles métier couvertes

- **BR-CAR-06** : le tuteur détecte et enrichit automatiquement les liens entre ressources et entre modules. Un lien visible n'est créé qu'après validation structurée de sa justification et de ses passages source par le code.

## 5. Exigences fonctionnelles

- **EF-1** — À la mise à disposition d'une ressource et à la génération d'un cours, un job cherche des passages proches dans les autres ressources du même apprenant et des notions d'autres modules de la même formation ; il propose au plus cinq candidats par ressource, triés de façon stable par score puis ID.
- **EF-2** — Le tuteur reçoit uniquement ces candidats et les passages autorisés, puis retourne pour chaque proposition `fromId`, `toId`, `kind`, `rationale` et `supportingChunkIds`. Le code refuse un identifiant absent, un passage d'un autre propriétaire, un lien vers soi, un module identique pour le type intermodule, une justification vide ou une action non autorisée.
- **EF-3** — Les liens acceptés entre ressources sont stockés dans `resource_links` avec paire canonique et propriétaire. Les liens entre notions de modules différents utilisent `notion_links.kind='tutor'` et `owner_id` personnel quand ils découlent des apports privés. Un second traitement de la même paire met à jour sa justification versionnée ou ne change rien ; il ne crée pas de doublon.
- **EF-4** — SCR-14 affiche les liens tuteur en pointillé distinct des prérequis/confusions, puis le panneau détail groupe « Lien repéré par le tuteur » et « Dans vos apports » avec justification courte et sources cliquables. La liste textuelle accessible reprend les mêmes liens pour les utilisateurs qui ne manipulent pas le graphe.
- **EF-5** — Le cours affiche sous une notion liée une carte « À rapprocher » indiquant l'autre notion ou ressource, son module, la justification et les extraits cités ; le clic ne révèle qu'un extrait autorisé et ouvre la source selon son type.
- **EF-6** — L'apprenant peut écarter un lien personnel jugé faux ; son statut devient `rejected`, il disparaît de la carte et du cours et n'est pas reproposé par un nouveau job sur la même version de passages. Une nouvelle version de ressource peut produire une nouvelle proposition.
- **EF-7** — La suppression d'une ressource retire les liens actifs qui l'utilisent et marque les renvois de cours historiques « source supprimée ». Les liens programmatiques partagés qui ne reposent pas sur cet apport ne sont pas effacés.

## 6. Exigences techniques

- **ET-1** — Migration `resource_links` selon ADR-0207 : `id`, `owner_id`, `formation_id`, `from_resource_id`, `to_resource_id`, `rationale`, `supporting_chunk_ids`, `status`, `created_at`, `updated_at`, unicité de la paire canonique par propriétaire et contrôle `from_resource_id < to_resource_id`. RLS limite lecture/écriture au propriétaire ; le service, pas le modèle, écrit la table.
- **ET-2** — `packages/services/src/links/find-candidates.ts` utilise la recherche SPEC-511 avec filtre `owner_id`, `formation_id` et exclusion du même `resource_id`, puis trie `(score desc, id asc)` avant de limiter à cinq. Les scores ne sont pas exposés comme vérité pédagogique dans l'interface.
- **ET-3** — `packages/tutor/src/tools/validate-link.ts` définit le schéma de sortie ; `guard` vérifie les entités et passages dans une transaction utilisateur. Le job `resource/ready` peut être relancé sans double lien et journalise uniquement IDs, statut et durée, jamais le texte privé.
- **ET-4** — Le contrat `NotionGraphDto` ajoute `tutorLinks` et `resourceLinks` avec `id`, `label`, `rationale`, `sourceRefs`, `status`, sans casser les champs V1. Une route de rejet `POST /formations/:fid/links/:id/reject` valide la propriété et l'idempotence ; elle est ajoutée à `docs/architecture/api.md` dans le même commit.
- **ET-5** — La disposition SVG de SPEC-616 reçoit les nouveaux liens dans un ordre stable ; les positions d'une même version du graphe restent identiques sur deux chargements. Le détail du lien est accessible au clavier et ne dépend pas du survol.
- **ET-6** — Les fixtures IA en `LLM_MODE=mock` couvrent lien valable, faux passage, autre propriétaire et sortie invalide ; les tests n'appellent pas un fournisseur live.

## 7. Comportements attendus et cas limites

- **CL-1** — Moins de deux ressources prêtes ou aucune similarité utile : aucun lien, aucun message d'erreur pour l'apprenant.
- **CL-2** — Deux jobs concurrents sur la même paire : un seul lien par contrainte unique et transaction.
- **CL-3** — Tuteur propose une source d'un autre membre : refus et aucune fuite de texte ou d'URL dans le rapport.
- **CL-4** — Sortie tuteur invalide après les corrections autorisées : job en échec sûr, aucune persistance partielle.
- **CL-5** — Lien écarté puis job rejoué : le lien reste masqué pour cette version de source.
- **CL-6** — Ressource supprimée : lien actif retiré, citation historique signalée, aucune URL signée délivrée.
- **CL-7** — Nouveau lien ajouté au graphe : coordonnées reproductibles pour une même version et liste textuelle de même contenu.

## 8. Instructions d'implémentation

1. Ajouter la table, contraintes et RLS `resource_links`, contrats Zod et tests d'isolation ; mettre à jour `docs/architecture/data-model.md`. Commit `feat(SPEC-903): stocke les liens personnels entre ressources`.
2. Écrire sélection déterministe des candidats, schéma/guard du tuteur et job de validation ; ajouter les fixtures de succès et d'injection invalide. Commit `feat(SPEC-903): détecte et valide les liens tuteur`.
3. Étendre l'API et le graphe SCR-14, la liste accessible, le panneau détail et la carte du cours ; brancher le rejet de lien. Commit `feat(SPEC-903): affiche les liens repérés et leurs sources`.
4. Tester concurrence, autre membre, suppression, rendu et non-régression V1 ; exécuter `validate.mjs` et renseigner les preuves mesurées.

## 9. Fichiers et composants concernés

- **Créés** : `packages/db/src/schema/resource-links.ts`, migration `packages/db/migrations/<n>_resource_links.sql` et copie Supabase, `packages/services/src/links/find-candidates.ts`, `packages/services/src/links/create-links.ts`, `packages/services/src/links/reject-link.ts`, `packages/services/src/links/find-candidates.test.ts`, `packages/services/test/integration/resource-links.test.ts`, `packages/tutor/src/tools/validate-link.ts`, `packages/jobs/src/functions/detect-links.ts`, `apps/web/app/api/v1/formations/[fid]/links/[id]/reject/route.ts`, `apps/web/e2e/specs/p9/spec-903.spec.ts`.
- **Modifiés** : schéma/API du graphe SPEC-616, composant du graphe et panneau détail, cours SPEC-609, `docs/architecture/api.md`, `docs/architecture/data-model.md`, `apps/web/messages/fr.ts`.
- **Lus / réutilisés** : `search_user_content`/recherche sémantique SPEC-511, `resource_chunks`, `notion_links`, RLS SPEC-113, maquette `Carte.dc.html`.

## 10. Interface et conformité visuelle

Mode `mockup` sur SCR-14 (`design/maquettes/Carte.dc.html`) : conserver nœuds, filtres, légende et interactions V1. Les nouveaux liens utilisent le style pointillé « Lien repéré par le tuteur » déjà présent ; le panneau notion affiche la justification et les sources sous cette rubrique, et un bouton « Écarter ce lien » pour un lien personnel. `data-testid` : `notion-graph-tutor-link`, `notion-detail-tutor-links`, `resource-link-source`, `resource-link-reject`. À 390 px, la liste textuelle et le panneau restent utilisables sans glisser un nœud.

`expectTokens` vérifie ligne, texte, bouton et focus ; comparer les régions communes de SCR-14 à la référence ≤ 12 % et figer la nouvelle rubrique par `toHaveScreenshot('carte-liens-tuteur.png', { maxDiffPixelRatio: 0.01 })` en desktop/mobile. Axe n'a aucune violation serious/critical ; les sources privées d'un autre membre n'apparaissent pas dans la capture.

## 11. Critères d'acceptation

- **CA-1** — Le job propose au plus cinq candidats par ressource dans un ordre stable, valide les passages et écrit un seul lien par paire autorisée.
- **CA-2** — La carte et le cours affichent type, justification et sources exactes d'un lien tuteur ; un rejet le masque sans modifier les liens V1.
- **CA-3** — Deux membres d'une formation partagée ne voient pas les liens fondés sur les apports privés de l'autre ; une ressource supprimée n'est plus ouvrable.
- **CA-4** — Sortie IA invalide, double job et relance d'un lien rejeté ne créent ni doublon ni exposition de données.
- **CA-5** — SCR-14 passe structure, jetons, axe, comparaison de maquette et non-régression desktop/mobile, avec vidéo e2e.

## 12. Plan de tests

- **Unitaires** — `find-candidates.test.ts`, `describe('[SPEC-903] link candidates')` : filtrage, limite cinq, tri stable, paire canonique, sortie du tuteur invalide (CA-1, CA-4).
- **Intégration** — `resource-links.test.ts`, `describe('[SPEC-903] private links')` : deux utilisateurs du même groupe, RLS, concurrence, rejet, suppression, API de carte/cours et citations (CA-1–CA-4).
- **End-to-end** — `apps/web/e2e/specs/p9/spec-903.spec.ts`, `test('explore un lien repéré @SPEC-903')` : seed de deux modules et deux apports, attendre le job mock, ouvrir la carte, sélectionner le lien, ouvrir la source, l'écarter et vérifier sa disparition ; vidéo (CA-2, CA-3, CA-5).
- **Visuel** — `test('liens tuteur conformes @SPEC-903 @visual')` : région SCR-14, jetons/structure/axe, captures desktop/mobile ≤ 1 % (CA-5).
- **Non-régression** — SPEC-511, SPEC-616, SPEC-609, SPEC-113 et SPEC-805.

| Critère | Tests |
|---|---|
| CA-1 | unitaires candidats ; intégration liens |
| CA-2 | intégration API ; e2e graphe/cours |
| CA-3 | intégration RLS/suppression ; e2e |
| CA-4 | unitaires sortie ; intégration concurrence |
| CA-5 | e2e `@SPEC-903 @visual` |

## 13. Preuves attendues

`evidence/SPEC-903/` contient rapports de sélection/validation, tests RLS avec IDs anonymisés, vidéo de navigation et rejet, captures et diff SCR-14, `checks.json` et `acceptance.md`. La sortie du tuteur est une fixture mock étiquetée ; elle n'est pas présentée comme une découverte live.

## 14. Définition de terminé

Toutes les conditions de `docs/engineering/testing.md` §7 passent. Les liens sont expliqués et reliés à des passages existants, les données personnelles restent isolées, les positions du graphe sont déterministes et les parcours V1 de carte/cours demeurent verts.

## 15. Décisions et hypothèses

ADR-0207 fixe table, propriété, candidats et validation. ADR-0035 protège les ressources personnelles des groupes ; ADR-0036 fixe la disposition du graphe. Un score de similarité ne vaut jamais acceptation pédagogique : seule une sortie tuteur validée par le code crée un lien visible.
