---
id: SPEC-104
title: Schéma ressources et passages vectoriels
phase: P1
priority: V1
depends_on: [SPEC-103]
business_rules: [BR-APP-06]
screens: []
adrs: [ADR-0056, ADR-0039, ADR-0008, ADR-0058, ADR-0112, ADR-0113, ADR-0238]
visual: demo
---

# SPEC-104 — Schéma ressources et passages vectoriels

## 1. Objectif

Créer les tables `resources` (apports et ressources suggérées, avec suppression logique et limites d'import) et `resource_chunks` (passages repérés avec embedding `vector(1024)` et index HNSW cosinus), base des citations et de la recherche sémantique.

## 2. Contexte

Section §3 de `docs/architecture/data-model.md`, ADR-0056 (Voyage `voyage-4-lite`, dimension 1024, cosinus, HNSW), ADR-0039 (limites, suppression), ADR-0008 (types par version : `audio`/`video` présents dans l'énumération dès V1), ADR-0058 (chemin de stockage `<userId>/<uuid>/<nom>`), ADR-0057 (découpage ~800 tokens). L'ingestion (SPEC-509/510) remplit ces tables ; la recherche (SPEC-511) les interroge ; le stockage des fichiers est SPEC-114.

## 3. Dépendances

- **SPEC-103** : `formations`, `chapters`, `programme_imports` (clé étrangère `resource_id` ajoutée ici).
- **SPEC-101** : extension `vector` (schéma `extensions`).
- Aucune dépendance externe : les embeddings de test sont des vecteurs déterministes fabriqués par le test (hachage, ADR-0056 mode `mock`).

## 4. Règles métier couvertes

- **BR-APP-06** (passages repérés) : chaque passage `resource_chunks` porte `position` (ordre dans l'apport), `text`, et `location` obligatoire `{ page?, startSec?, endSec?, anchor?, charStart, charEnd }` : page pour un PDF, horodatage pour une vidéo/YouTube/audio, ancre pour une page web, position de caractères pour une note ; l'`embedding` sert à la recherche sémantique et l'identifiant du passage aux citations (`citations.chunk_id`, SPEC-105).
- Les limites de BR-APP-02 (appliquées par ADR-0039) sont imposées en base en défense en profondeur (le service SPEC-206 les vérifie d'abord avec un message explicite) ; BR-APP-02 est implémentée fonctionnellement par SPEC-206/607.

## 5. Exigences fonctionnelles

- **EF-1** — Une ressource se crée avec `status = 'queued'`, `metadata = '{}'`, `origin = 'learner'` par défaut.
- **EF-2** — Cohérence par type : `note` → `content_text` obligatoire (≤ 100 000 caractères), pas de fichier ni d'URL ; `pdf`, `image`, `audio`, `video` → `storage_path` obligatoire ; `web`, `youtube` → `url` obligatoire en `https://` ; `exam_guide` → `storage_path` ou `url`. Une suggestion du tuteur (`origin = 'tutor_suggestion'`) a une `url` et un `suggestion_status` ; un apport de l'apprenant a `suggestion_status` nul.
- **EF-3** — Limites refusées en base (code d'erreur dans le message) : `pdf` > 52 428 800 octets ou `metadata.pages` > 500 (`resource_pdf_limit`) ; `image` > 10 485 760 octets (`resource_image_limit`) ; plus de 100 ressources non supprimées pour un même `(owner_id, chapter_id)` (`chapter_resource_limit`) ; somme des `size_bytes` des ressources non supprimées d'un utilisateur > 2 147 483 648 octets (`storage_quota_exceeded`).
- **EF-4** — Suppression logique : positionner `deleted_at` supprime immédiatement tous les passages de la ressource et efface `content_text` ; la ligne est conservée (titre, type) pour afficher « source supprimée » dans les citations ; la suppression physique du fichier est faite par le service (SPEC-206). Une ressource supprimée ne peut plus être modifiée (sauf par le service).
- **EF-5** — Les passages d'une ressource sont ordonnés et uniques par `(resource_id, position)` ; la recherche des plus proches voisins par distance cosinus (`embedding <=> $1`) utilise l'index `resource_chunks_embedding_hnsw_idx`.
- **EF-6** — `programme_imports.resource_id` référence `resources(id)` (`on delete set null`).

## 6. Exigences techniques

- **ET-1 — Énumérations** (`packages/db/src/schema/resources.ts`) : `resource_kind` (`note`,`pdf`,`web`,`youtube`,`image`,`audio`,`video`,`exam_guide`), `resource_origin` (`learner`,`tutor_suggestion`), `suggestion_status` (`pending`,`imported`,`dismissed`), `resource_status` (`queued`,`processing`,`ready`,`failed`).
- **ET-2 — Tables** (migration générée `resources_chunks`) :
  ```sql
  create table public.resources (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references public.profiles(id) on delete cascade,
    formation_id uuid not null references public.formations(id) on delete cascade,
    chapter_id uuid references public.chapters(id) on delete cascade,
    kind resource_kind not null,
    origin resource_origin not null default 'learner',
    suggestion_status suggestion_status,
    title text not null check (char_length(title) between 1 and 200),
    content_text text,
    storage_path text check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/.+$' and char_length(storage_path) <= 512),
    url text check (url ~ '^https://' and char_length(url) <= 2048),
    mime text check (char_length(mime) <= 127),
    size_bytes bigint check (size_bytes >= 0),
    status resource_status not null default 'queued',
    error_code text check (char_length(error_code) <= 64),
    error_message text check (char_length(error_message) <= 1000),
    metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint resources_note_shape check (kind <> 'note' or deleted_at is not null or (content_text is not null and char_length(content_text) <= 100000 and storage_path is null and url is null)),
    constraint resources_file_shape check (kind not in ('pdf','image','audio','video') or storage_path is not null),
    constraint resources_link_shape check (kind not in ('web','youtube') or url is not null),
    constraint resources_exam_guide_shape check (kind <> 'exam_guide' or storage_path is not null or url is not null),
    constraint resources_suggestion_shape check ((origin = 'tutor_suggestion') = (suggestion_status is not null) and (origin = 'learner' or url is not null)),
    constraint resources_failed_has_error check (status <> 'failed' or error_code is not null),
    constraint resources_content_max check (content_text is null or char_length(content_text) <= 2000000),
    constraint resources_pdf_size check (kind <> 'pdf' or size_bytes is null or size_bytes <= 52428800),
    constraint resources_image_size check (kind <> 'image' or size_bytes is null or size_bytes <= 10485760),
    constraint resources_pdf_pages check (kind <> 'pdf' or coalesce((metadata->>'pages')::int, 0) <= 500)
  );
  create index resources_owner_chapter_idx on public.resources (owner_id, chapter_id);
  create index resources_formation_id_idx on public.resources (formation_id);
  create index resources_status_idx on public.resources (status) where status in ('queued','processing');

  create table public.resource_chunks (
    id uuid primary key default gen_random_uuid(),
    resource_id uuid not null references public.resources(id) on delete cascade,
    owner_id uuid not null references public.profiles(id) on delete cascade,
    formation_id uuid not null references public.formations(id) on delete cascade,   -- ADR-0113
    chapter_id uuid references public.chapters(id) on delete cascade,                -- ADR-0113
    position integer not null check (position >= 0),
    text text not null check (char_length(text) between 1 and 20000),
    location jsonb not null check (jsonb_typeof(location) = 'object' and location ? 'charStart' and location ? 'charEnd'),
    token_count integer check (token_count >= 0),
    embedding extensions.vector(1024),
    created_at timestamptz not null default now(),
    unique (resource_id, position)
  );
  create index resource_chunks_owner_resource_idx on public.resource_chunks (owner_id, resource_id);
  create index resource_chunks_owner_formation_idx on public.resource_chunks (owner_id, formation_id);
  create index resource_chunks_chapter_idx on public.resource_chunks (chapter_id);
  alter table public.programme_imports add constraint programme_imports_resource_fk foreign key (resource_id) references public.resources(id) on delete set null;
  ```
  Drizzle : colonne `vector('embedding', { dimensions: 1024 })` (`drizzle-orm/pg-core`) ; la dimension provient de la constante `EMBEDDING_DIM = 1024` de `@learny/config` et un test vérifie leur égalité.
- **ET-3 — Migration personnalisée `resources_rules`** :
  - RLS activée sur les 2 tables ; `set_updated_at` sur `resources`.
  - Index : `create index resource_chunks_embedding_hnsw_idx on public.resource_chunks using hnsw (embedding extensions.vector_cosine_ops) with (m = 16, ef_construction = 64);`
  - Déclencheur `resources_enforce_limits` (`before insert or update of chapter_id, size_bytes, deleted_at`, `security definer`, `set search_path = ''`) : `perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 104))` puis contrôle des limites EF-3 sur les lignes `deleted_at is null` (hors la ligne courante) ; erreurs `raise exception using errcode = '23514', message = '<code>'`.
  - Déclencheur `resources_soft_delete` (`after update of deleted_at` quand `old.deleted_at is null and new.deleted_at is not null`) : `delete from public.resource_chunks where resource_id = new.id` ; et `before update` : `new.content_text := null` dans ce même cas.
  - Déclencheur `resources_deleted_frozen` (`before update`) : si `old.deleted_at is not null` et que l'appelant n'est pas le propriétaire de la table (`current_user <> 'postgres'`), refuse (`resource_deleted`, 42501).
  - Déclencheur `resource_chunks_consistency` (`before insert`) : copie `owner_id`, `formation_id`, `chapter_id` depuis la ressource si non fournis et refuse s'ils diffèrent, ou si la ressource est supprimée (`resource_deleted`).
- **ET-4 — Types** : `Resource`, `NewResource`, `ResourceChunk`, `NewResourceChunk`, `ResourceKind` ; schéma Zod `chunkLocationSchema` (`{ page?: int ≥1, startSec?: ≥0, endSec?: ≥ startSec, anchor?: string ≤ 200, charStart: int ≥0, charEnd: int > charStart }`) et `resourceMetadataSchema` (`pages?`, `durationSec?`, `language?`, `youtubeId?`, `siteName?`, `anthropicFileId?`, tous facultatifs) dans `resources.json-schemas.ts`.
- **ET-5 — Performance** : sur 5 000 passages aléatoires d'un utilisateur, une recherche des 8 plus proches voisins filtrée par `owner_id` (`order by embedding <=> $1 limit 8`, `set local hnsw.ef_search = 40`) répond en < 50 ms et son plan utilise l'index HNSW.

## 7. Comportements attendus et cas limites

- **CL-1** — Note de 100 001 caractères → `resources_note_shape` (23514).
- **CL-2** — PDF de 52 428 801 octets ou de 501 pages → 23514.
- **CL-3** — 101e ressource non supprimée dans un chapitre → `chapter_resource_limit` ; après suppression logique d'une ressource, l'insertion repasse.
- **CL-4** — Deux insertions concurrentes qui franchiraient ensemble le quota de 2 Go → la seconde échoue (`storage_quota_exceeded`) grâce au verrou consultatif.
- **CL-5** — Embedding de dimension 1 023 → erreur `expected 1024 dimensions` (22000).
- **CL-6** — Suppression logique d'une ressource à 40 passages → 0 passage restant, `content_text` nul, la ligne existe toujours.
- **CL-7** — Passage dont `owner_id` diffère de celui de la ressource → refusé.
- **CL-8** — Suggestion du tuteur sans URL → 23514 ; apport de l'apprenant avec `suggestion_status` → 23514.
- **CL-9** — Ressource `failed` sans `error_code` → 23514.
- **CL-10** — Chapitre supprimé → ses ressources et passages sont supprimés en cascade ; l'import de programme qui y pointait garde sa ligne avec `resource_id` nul.

## 8. Instructions d'implémentation

1. Écrire `packages/db/src/schema/resources.ts` (ET-1, ET-2, ET-4), exporter depuis `index.ts`.
2. `pnpm db:generate --name resources_chunks` ; vérifier le SQL (notamment `extensions.vector(1024)`).
3. `pnpm db:migration:custom resources_rules` (ET-3).
4. Ajouter à `packages/db/src/testing/` la fonction `fakeEmbedding(text: string): number[]` (1 024 composantes déterministes dérivées de SHA-256, normalisées L2) — la même règle que le mode `mock` d'ADR-0056, réutilisée par SPEC-509.
5. Tests (§12), page de démonstration, e2e.
6. Commits : `feat(SPEC-104): ajoute ressources et passages vectoriels` ; `feat(SPEC-104): applique limites et suppression logique en base` ; `test(SPEC-104): couvre limites, cascades et recherche vectorielle` ; `feat(SPEC-104): ajoute la page de démonstration`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/db/src/schema/resources.ts`, `resources.json-schemas.ts`, `resources.test.ts` ; `packages/db/src/testing/embedding.ts` ; migrations `NNNN_resources_chunks.sql`, `NNNN_resources_rules.sql` (+ copies) ; `packages/db/test/integration/resources.test.ts` ; `apps/web/app/_dev/sdd/SPEC-104/page.tsx` ; `apps/web/e2e/specs/p1/spec-104-resources.spec.ts`.
- **Modifiés** : `packages/db/src/schema/index.ts`, `packages/db/src/testing/index.ts`, `packages/config/src/product.ts` (constantes `RESOURCE_LIMITS = { pdfMaxBytes: 52428800, pdfMaxPages: 500, imageMaxBytes: 10485760, noteMaxChars: 100000, perChapter: 100, userQuotaBytes: 2147483648 }` si absentes).
- **Lus** : data-model §3, ADR-0039, ADR-0056.

## 10. Interface et conformité visuelle

Mode `demo`. Page `/_dev/sdd/SPEC-104` :
- `h1` « SPEC-104 · Ressources et passages ».
- Carte « Apport de démonstration » (`data-testid="resource-card"`) : note « Clés de comptabilisation : 40 = débit, 50 = crédit ? À vérifier » découpée en 3 passages (positions, `location.charStart/charEnd`).
- Carte « Recherche vectorielle » (`data-testid="vector-search"`) : requête « clé débit » (embedding factice) → 3 passages classés par distance cosinus (valeur affichée à 4 décimales) ; plan contenant `resource_chunks_embedding_hnsw_idx`.
- Carte « Limites » (`data-testid="limits-card"`) : résultats de CL-1, CL-2, CL-3, CL-8 (« Refusé comme attendu » + code).
- Carte « Suppression logique » (`data-testid="soft-delete-card"`) : passages avant/après (3 → 0), ligne conservée.
- Contrôles visuels : contrôles 1, 2, 4 ; distances et identifiants masqués dans la ligne de base.

## 11. Critères d'acceptation

- **CA-1** — Les tables, énumérations, contraintes, index (dont HNSW cosinus `m = 16, ef_construction = 64`) existent ; `EMBEDDING_DIM` = 1024 = dimension de la colonne.
- **CA-2** — Les formes par type (EF-2) et les limites EF-3 sont refusées avec le code attendu (CL-1 à CL-4, CL-8, CL-9).
- **CA-3** — La suppression logique supprime les passages et le contenu, conserve la ligne et la fige (EF-4, CL-6).
- **CA-4** — La cohérence propriétaire/formation/chapitre des passages est imposée (CL-7).
- **CA-5** — La recherche des 8 plus proches voisins utilise l'index HNSW et répond en < 50 ms sur 5 000 passages (ET-5).
- **CA-6** — Cascades conformes (CL-10) et clé `programme_imports.resource_id` en `set null`.
- **CA-7** — Page de démonstration filmée et `@visual` réussi.

## 12. Plan de tests

- **Unitaires** — `packages/db/src/schema/resources.test.ts`, `describe('[SPEC-104] schémas ressources')` : `chunkLocationSchema` (bornes `charEnd > charStart`, `endSec ≥ startSec`), `resourceMetadataSchema` ; `fakeEmbedding` : longueur 1024, norme 1 ± 1e-9, déterminisme, textes différents → vecteurs différents.
- **Intégration** — `packages/db/test/integration/resources.test.ts`, `describe('[SPEC-104] ressources et passages')` : CA-1 (introspection, `pg_indexes`), CA-2 (un cas par contrainte, CL-4 avec deux connexions concurrentes hors `withRollback` puis nettoyage), CA-3, CA-4, CA-5 (insertion de 5 000 passages, `EXPLAIN`, mesure), CA-6, CL-5.
- **End-to-end** — `apps/web/e2e/specs/p1/spec-104-resources.spec.ts`, `test('apports, passages et recherche vectorielle @SPEC-104', …)` : vérifier les 4 cartes, l'ordre des résultats, la suppression logique ; vidéo.
- **Visuel** — `test('page ressources conforme @SPEC-104 @visual', …)`.
- **Non-régression** : `[SPEC-101]` à `[SPEC-103]` et leurs e2e.
- **Traçabilité** : CA-1, CA-2, CA-3, CA-4, CA-5, CA-6 → intégration ; CA-2, CA-3, CA-5 → aussi e2e ; CA-7 → e2e + `@visual`.

## 13. Preuves attendues

Vidéo e2e, capture, plan `EXPLAIN` HNSW et latence p95 consignés dans `summary.md`.

## 14. Définition de terminé

Définition commune ; aucune régression du test générique de conventions ; `fakeEmbedding` documentée dans `packages/db/README.md`.

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0056 (dimension 1024, cosinus, HNSW), ADR-0039 (limites, citations conservées avec `chunk_id` nul), ADR-0008 (`audio`, `video` dans l'énumération dès V1, non proposés par l'interface V1), ADR-0058 (format du chemin), ADR-0112.
- **ADR-0113** : ajout de `resource_chunks.formation_id` et `resource_chunks.chapter_id` (filtrage de la recherche sans jointure), formes par type, limites en base, conservation de la ligne supprimée logiquement (le contenu est effacé), paramètres HNSW `m = 16`, `ef_construction = 64`.
- **ADR-0238** : page de démonstration servie par le registre de SPEC-006 ; qualification `extensions.vector(1024)` dans la migration générée ; codes d'erreur levés par le déclencheur avant les CHECK ; preuve HNSW filtrée par `owner_id` avec `hnsw.ef_search = 40` et planificateur contraint localement ; règle de `fakeEmbedding` partagée avec SPEC-509.
- Hypothèse : la valeur `hnsw.ef_search` est réglée par requête par SPEC-511 (40 par défaut).
