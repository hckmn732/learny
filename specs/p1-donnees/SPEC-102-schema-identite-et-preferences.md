---
id: SPEC-102
title: Schéma identité et préférences
phase: P1
priority: V1
depends_on: [SPEC-101]
business_rules: [BR-ACC-08, BR-ACC-12, BR-NOT-04]
screens: []
adrs: [ADR-0022, ADR-0030, ADR-0112, ADR-0113, ADR-0114]
visual: demo
---

# SPEC-102 — Schéma identité et préférences

## 1. Objectif

Créer les tables `profiles`, `study_preferences`, `notification_settings`, `push_subscriptions`, `automation_settings` et `pauses`, ainsi que le déclencheur qui, à chaque insertion dans `auth.users`, crée le profil et toutes les lignes de réglages par défaut conformes aux règles métier.

## 2. Contexte

Section §1 de `docs/architecture/data-model.md` (contrat), complétée par ADR-0113 (colonnes ajoutées) et ADR-0114 (initialisation par déclencheur). Ces tables sont lues par l'onboarding (SPEC-602), les paramètres (SPEC-707 à SPEC-710), les notifications (SPEC-209), les automatismes (SPEC-711) et le planificateur (SPEC-407). Lire aussi `docs/product/business-rules.md` sections ACC, NOT, AUT, ADR-0030 (fuseaux), ADR-0016 (pause globale distincte de la pause d'une formation).

## 3. Dépendances

- **SPEC-101** : `@learny/db` (helpers `id()`, `timestamps()`, énumération `course_language`, `withRollback`, `createTestUser`, `asUser`, `serviceDb`), migrations synchronisées, fonction `set_updated_at`.
- **SPEC-009** : `packages/config/src/product.ts` (constantes produit) ; cette spécification y ajoute `AUTOMATION_DEFAULTS` si absent (§6 ET-6).
- Aucune dépendance externe autre que la base locale (blocage si indisponible, cf. SPEC-101).

## 4. Règles métier couvertes

- **BR-ACC-08** (rythme d'étude) : `study_preferences.hours_per_day smallint not null default 2 check (between 1 and 6)`, `study_days` défaut `{1,2,3,4,5}` (lundi→vendredi, ISO), non vide, valeurs 1..7 sans doublon, `preferred_slots` défaut `{soir}`, non vide. Ce rythme est la valeur par défaut des nouvelles formations (`formations.study_override` nul = rythme du profil, SPEC-103).
- **BR-ACC-12** (contenu du profil) : `profiles` porte `first_name`, `last_name` (≤ 60 caractères), `email` (non modifiable en V1 : aucune politique d'écriture ne l'autorise, SPEC-113, et un déclencheur refuse sa modification hors rôle service), `course_language` (défaut `fr`), `tutor_tone` (défaut `vous`), `timezone` (IANA validé, défaut `Europe/Paris`) ; le rythme est dans `study_preferences`.
- **BR-NOT-04** (réglages de notification par défaut) : `notification_settings` créé à l'inscription avec `channel_email = true`, `channel_push = true`, les 6 types à `true`, `digest_time = '08:00'`, `quiet_start = '21:00'`, `quiet_end = '08:00'`, `weekend_quiet = true`, `max_per_day = 5` (borne `in (3,5,8)`, BR-NOT-05).

## 5. Exigences fonctionnelles

- **EF-1** — L'insertion d'une ligne dans `auth.users` crée, dans la même transaction : 1 ligne `profiles`, 1 ligne `study_preferences`, 1 ligne `notification_settings`, 10 lignes `automation_settings` (une par clé, `enabled = true`, `params` par défaut). Aucune ligne `pauses` ni `push_subscriptions`.
- **EF-2** — Le profil reprend `email` de `auth.users` ; `first_name`, `last_name`, `timezone`, `course_language` depuis `raw_user_meta_data` (`first_name`, `last_name`, `timezone`, `course_language`) quand ils sont présents et valides, sinon les défauts (`null`, `null`, `Europe/Paris`, `fr`). Un prénom de plus de 60 caractères est tronqué à 60.
- **EF-3** — Si une ligne existe déjà pour l'utilisateur (rejeu), l'initialisation ne crée pas de doublon (`on conflict do nothing`).
- **EF-4** — La suppression de l'utilisateur `auth.users` supprime en cascade toutes ses lignes de ces six tables.
- **EF-5** — `profiles.updated_at`, `study_preferences.updated_at`, `notification_settings.updated_at`, `automation_settings.updated_at`, `pauses.updated_at`, `push_subscriptions.updated_at` sont maintenus par `set_updated_at`.
- **EF-6** — Valeurs `params` par défaut des automatismes (miroir de BR-AUT-01 à BR-AUT-10) :

| `key` | `params` par défaut | Valeurs admises |
|---|---|---|
| `reprise` | `{"missedReplace":"consent","inactiveDays":2,"lightenAfterDays":5}` | `missedReplace` ∈ `auto`,`consent` ; `inactiveDays` ∈ 1,2,3 ; `lightenAfterDays` ∈ 4,5,7 |
| `micro_seance` | `{"hour":20,"durationMin":5}` | `hour` ∈ 19,20,21 ; `durationMin` ∈ 3,5,10 |
| `echauffement` | `{"questionCount":3,"scope":"yesterday_and_prerequisites"}` | `questionCount` ∈ 2,3,5 ; `scope` ∈ `yesterday_and_prerequisites`,`yesterday` |
| `remediation` | `{"retryDelayHours":24,"mode":"advised"}` | `retryDelayHours` ∈ 0,12,24,48 ; `mode` ∈ `advised`,`required` |
| `jeu_lacune` | `{"preference":"vary"}` | `vary`,`cards`,`matching_categorization` |
| `questions_cartes` | `{"mode":"confirm"}` | `confirm`,`auto` |
| `plafond_quiz` | `{"maxMinutes":15,"targetRetention":0.9}` | `maxMinutes` ∈ 10,15,20,30 ; `targetRetention` ∈ 0.85,0.9,0.95 |
| `sprint` | `{"daysBefore":3,"durationMin":30}` | `daysBefore` ∈ 2,3,5 ; `durationMin` = 30 |
| `bilan` | `{"weekday":7,"hour":19,"channel":"app"}` | `weekday` (ISO) ∈ 5,6,7 ; `hour` ∈ 18,19,20 ; `channel` ∈ `app`,`app_email` |
| `pause` | `{"diagnosticOnReturn":true,"diagnosticMinutes":10}` | `diagnosticOnReturn` booléen ; `diagnosticMinutes` = 10 |

## 6. Exigences techniques

- **ET-1 — Énumérations** (dans `packages/db/src/schema/identity.ts`) : `tutor_tone` (`vous`,`tu`) ; `onboarding_step` (`profil`,`rythme`,`ia`,`rappels`,`depart`,`done`) ; `study_slot` (`matin`,`apres_midi`,`soir`) ; `automation_key` (`reprise`,`micro_seance`,`echauffement`,`remediation`,`jeu_lacune`,`questions_cartes`,`plafond_quiz`,`sprint`,`bilan`,`pause`) ; `pause_status` (`active`,`ended`,`cancelled`). `automation_key` est réutilisée par SPEC-108.
- **ET-2 — Tables** (Drizzle, fichier `identity.ts` ; SQL équivalent attendu dans la migration générée `identity_preferences`) :
  ```sql
  create table public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null unique,
    first_name text check (char_length(first_name) <= 60),
    last_name text check (char_length(last_name) <= 60),
    course_language course_language not null default 'fr',
    tutor_tone tutor_tone not null default 'vous',
    timezone text not null default 'Europe/Paris',
    onboarding_step onboarding_step not null default 'profil',
    onboarding_completed_at timestamptz,
    terms_version text,
    terms_accepted_at timestamptz,
    current_formation_id uuid,              -- clé étrangère vers formations ajoutée par SPEC-103
    deletion_requested_at timestamptz,
    deletion_scheduled_for timestamptz,
    sidebar_collapsed boolean not null default false,
    streak_days integer not null default 0 check (streak_days >= 0),     -- ADR-0113 (vue group_member_progress)
    streak_computed_on date,                                              -- ADR-0113
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check ((deletion_requested_at is null) = (deletion_scheduled_for is null))
  );
  create index profiles_deletion_scheduled_for_idx on public.profiles (deletion_scheduled_for) where deletion_scheduled_for is not null;

  create table public.study_preferences (
    user_id uuid primary key references public.profiles(id) on delete cascade,
    hours_per_day smallint not null default 2 check (hours_per_day between 1 and 6),
    study_days smallint[] not null default '{1,2,3,4,5}',
    preferred_slots study_slot[] not null default '{soir}',
    updated_at timestamptz not null default now(),
    check (cardinality(study_days) between 1 and 7 and study_days <@ '{1,2,3,4,5,6,7}'::smallint[] and public.smallint_array_is_set(study_days)),
    check (cardinality(preferred_slots) between 1 and 3)
  );

  create table public.notification_settings (
    user_id uuid primary key references public.profiles(id) on delete cascade,
    channel_email boolean not null default true,
    channel_push boolean not null default true,
    type_revision boolean not null default true,
    type_validation boolean not null default true,
    type_course boolean not null default true,
    type_gap boolean not null default true,
    type_planning boolean not null default true,
    type_relaunch boolean not null default true,
    digest_time time not null default '08:00',
    quiet_start time not null default '21:00',
    quiet_end time not null default '08:00',
    weekend_quiet boolean not null default true,
    max_per_day smallint not null default 5 check (max_per_day in (3,5,8)),
    updated_at timestamptz not null default now()
  );

  create table public.push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    endpoint text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 2048),
    p256dh text not null,
    auth text not null,
    user_agent text check (char_length(user_agent) <= 512),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    last_success_at timestamptz,
    failure_count smallint not null default 0 check (failure_count >= 0)
  );
  create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

  create table public.automation_settings (
    user_id uuid not null references public.profiles(id) on delete cascade,
    key automation_key not null,
    enabled boolean not null default true,
    params jsonb not null check (jsonb_typeof(params) = 'object'),
    updated_at timestamptz not null default now(),
    primary key (user_id, key)
  );

  create table public.pauses (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    starts_on date not null,
    ends_on date not null,
    diagnostic_on_return boolean not null default true,
    status pause_status not null default 'active',
    ended_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (ends_on >= starts_on),
    check ((status = 'ended') = (ended_at is not null))
  );
  create index pauses_user_id_status_idx on public.pauses (user_id, status);
  create unique index pauses_one_active_per_user on public.pauses (user_id) where status = 'active';
  ```
  Toutes ces tables : `alter table … enable row level security;` dans la même migration (ADR-0112), déclencheurs `set_updated_at` sur les six tables.
- **ET-3 — Migration personnalisée `identity_functions`** (créée **avant** la migration générée, car les contraintes l'utilisent) : `public.smallint_array_is_set(smallint[]) returns boolean language sql immutable` (`select cardinality($1) = (select count(distinct x) from unnest($1) x)`) ; `public.default_automation_params(k text) returns jsonb language sql immutable` (valeurs EF-6, `case` sur le libellé de la clé ; paramètre `text` car l’énumération `automation_key` n’existe pas encore à ce stade).
- **ET-4 — Migration personnalisée `identity_triggers`** :
  - `public.validate_profile()` (`before insert or update on profiles`) : refuse un `timezone` absent de `pg_timezone_names` (`raise exception using errcode = '22023', message = 'invalid_timezone'`) ; refuse toute modification de `email` si `current_user <> 'postgres'` et `auth.role() <> 'service_role'` (`errcode '42501'`, `email_immutable`).
  - `public.handle_new_user()` `returns trigger language plpgsql security definer set search_path = ''` : insère `profiles` (EF-2, fuseau invalide → `Europe/Paris`, langue invalide → `fr`), `study_preferences`, `notification_settings`, puis `insert into public.automation_settings (user_id, key, params) select new.id, k, public.default_automation_params(k::text) from unnest(enum_range(null::public.automation_key)) k` ; chaque insertion `on conflict do nothing`. Déclencheur `on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user()`.
  - `revoke execute on function public.handle_new_user() from public, anon, authenticated;`
- **ET-5 — Types** : `packages/db/src/schema/identity.ts` exporte les tables et les types `Profile`, `NewProfile`, `StudyPreferences`, `NotificationSettings`, `PushSubscription`, `AutomationSetting`, `Pause` (`$inferSelect`/`$inferInsert`).
- **ET-6 — Miroir TypeScript** : `packages/config/src/product.ts` expose `AUTOMATION_DEFAULTS: Record<AutomationKey, object>` (EF-6), `STUDY_DEFAULTS = { hoursPerDay: 2, studyDays: [1,2,3,4,5], preferredSlots: ['soir'] }`, `NOTIFICATION_DEFAULTS` (BR-NOT-04). Un test d'intégration compare `default_automation_params(k)` à `AUTOMATION_DEFAULTS[k]` pour les 10 clés (aucune divergence tolérée). Les schémas Zod par clé seront exposés par `packages/contracts` (SPEC-711) à partir de ce miroir.

## 7. Comportements attendus et cas limites

- **CL-1** — Métadonnées d'inscription avec `timezone: "Mars/Olympus"` → profil créé avec `Europe/Paris` (pas d'échec d'inscription).
- **CL-2** — `update profiles set timezone = 'Mars/Olympus'` → erreur `invalid_timezone` (22023).
- **CL-3** — `study_days = '{}'`, `'{0}'`, `'{1,1}'` ou `'{8}'` → violation de contrainte (23514) ; `hours_per_day = 0` ou `7` → 23514.
- **CL-4** — `max_per_day = 4` → 23514.
- **CL-5** — Deuxième pause `active` pour le même utilisateur → violation d'unicité `pauses_one_active_per_user` (23505).
- **CL-6** — Pause avec `ends_on < starts_on` → 23514 ; pause `ended` sans `ended_at` → 23514.
- **CL-7** — Rejeu du déclencheur (appel manuel de la logique sur un utilisateur existant) → aucune ligne dupliquée, nombre de lignes `automation_settings` = 10.
- **CL-8** — Endpoint push en double (deux appareils déclarant le même endpoint) → 23505 ; le service SPEC-205 fera un `upsert` sur `endpoint`.
- **CL-9** — Changement d'e-mail par un client `authenticated` → refusé (`email_immutable`) ; par le service → accepté.

## 8. Instructions d'implémentation

1. `pnpm db:migration:custom identity_functions` : écrire ET-3.
2. Écrire `packages/db/src/schema/identity.ts` (ET-1, ET-2, ET-5) et l'exporter depuis `schema/index.ts` ; contraintes `check` via `check()` de Drizzle, index via `index()`/`uniqueIndex().where()`.
3. `pnpm db:generate --name identity_preferences` ; relire le SQL généré et le comparer à ET-2 (types, défauts, contraintes) ; ajouter à la main dans une migration personnalisée `identity_triggers` : `enable row level security` × 6, déclencheurs `set_updated_at` × 6, ET-4.
4. Compléter `packages/config/src/product.ts` (ET-6).
5. Mettre à jour `createTestUser` (SPEC-101) : il fonctionne inchangé ; ajouter l'option `meta` (métadonnées brutes) pour tester EF-2.
6. Écrire les tests (§12) puis la page `/_dev/sdd/SPEC-102` et son test e2e.
7. Commits : `feat(SPEC-102): ajoute le schéma identité et préférences` ; `feat(SPEC-102): initialise le compte à l'inscription` ; `test(SPEC-102): couvre défauts, contraintes et déclencheurs` ; `feat(SPEC-102): ajoute la page de démonstration`.

## 9. Fichiers et composants concernés

- **Créés** : `packages/db/src/schema/identity.ts` ; `packages/db/migrations/NNNN_identity_functions.sql`, `NNNN_identity_preferences.sql`, `NNNN_identity_triggers.sql` (+ copies `supabase/migrations/`) ; `packages/db/src/schema/identity.test.ts` ; `packages/db/test/integration/identity.test.ts` ; `apps/web/app/_dev/sdd/SPEC-102/page.tsx` ; `apps/web/e2e/specs/p1/spec-102-identity.spec.ts`.
- **Modifiés** : `packages/db/src/schema/index.ts` ; `packages/config/src/product.ts` ; `packages/db/src/testing/index.ts` (option `meta`).
- **Lus** : `docs/architecture/data-model.md` §1, `docs/product/business-rules.md` (ACC, NOT, AUT).

## 10. Interface et conformité visuelle

Mode `demo`. Page `/_dev/sdd/SPEC-102` :
- `h1` « SPEC-102 · Identité et préférences ».
- Bouton « Créer un utilisateur de démonstration » (`data-testid="create-demo-user"`, action serveur sous `_dev` : `withRollback` n'étant pas compatible avec un rendu persistant, la page crée l'utilisateur `spec102-<horodatage figé>@test.learny.test` par `serviceDb`, l'affiche puis le supprime à la fin du rendu suivant via le bouton « Nettoyer » `data-testid="cleanup"`).
- Carte « Profil » (`data-testid="profile-card"`) : e-mail, langue `fr`, ton `vous`, fuseau `Europe/Paris`, étape `profil`.
- Carte « Rythme » (`data-testid="study-card"`) : « 2 h par jour · lundi à vendredi · soir ».
- Carte « Notifications » (`data-testid="notif-card"`) : canaux, 6 types, `08:00`, `21:00 – 08:00`, week-end calme, plafond 5.
- Tableau « Automatismes » (`data-testid="automation-table"`) : 10 lignes clé / activé / `params`.
- Carte « Contraintes » (`data-testid="constraints-card"`) : exécute CL-2, CL-3, CL-4, CL-5 dans un `withRollback` et affiche pour chacune le code SQLSTATE obtenu et « Refusé comme attendu ».
- Contrôles visuels : contrôles 1, 2, 4 de testing.md §6 ; ligne de base avec masquage de l'e-mail.

## 11. Critères d'acceptation

- **CA-1** — Après `createTestUser`, l'utilisateur a exactement 1 profil, 1 `study_preferences`, 1 `notification_settings`, 10 `automation_settings` aux valeurs EF-6, aucune autre ligne.
- **CA-2** — Les défauts de BR-ACC-08 et BR-NOT-04 sont exacts (comparaison champ par champ).
- **CA-3** — Les contraintes CL-2 à CL-6 et CL-9 sont refusées avec le SQLSTATE attendu.
- **CA-4** — Les métadonnées d'inscription valides sont reprises, invalides remplacées par les défauts (EF-2, CL-1).
- **CA-5** — La suppression de l'utilisateur `auth.users` supprime ses lignes des 6 tables (EF-4).
- **CA-6** — `default_automation_params` (SQL) et `AUTOMATION_DEFAULTS` (TS) sont identiques pour les 10 clés.
- **CA-7** — La RLS est activée sur les 6 tables et un client `authenticated` sans politique ne lit aucune ligne (avant SPEC-113).
- **CA-8** — La page de démonstration affiche les 5 cartes et le test e2e (vidéo) et `@visual` réussissent.

## 12. Plan de tests

- **Unitaires** — `packages/db/src/schema/identity.test.ts`, `describe('[SPEC-102] schéma identité')` : valeurs des énumérations ; `AUTOMATION_DEFAULTS` couvre les 10 clés et chaque valeur appartient aux valeurs admises EF-6 ; colonnes et défauts déclarés dans les objets Drizzle (introspection `getTableConfig`).
- **Intégration** — `packages/db/test/integration/identity.test.ts`, `describe('[SPEC-102] identité et préférences')` (base locale, `withRollback`) : CA-1, CA-2, CA-3 (un cas par contrainte), CA-4 (3 jeux de métadonnées), CA-5 (suppression `auth.users` hors rollback puis vérification), CA-6, CA-7 (`asUser` → `select count(*)` = 0 sur chaque table), CL-7 (rejeu), CL-8.
- **End-to-end** — `apps/web/e2e/specs/p1/spec-102-identity.spec.ts`, `test('initialisation du compte @SPEC-102', …)` : ouvrir la page, cliquer « Créer un utilisateur de démonstration », vérifier les cartes et les 10 automatismes, les 4 refus de la carte « Contraintes », cliquer « Nettoyer » ; vidéo.
- **Visuel** — `test('page identité conforme @SPEC-102 @visual', …)` : `expectTokens`, ordre des cartes, `toHaveScreenshot` (e-mail masqué).
- **Non-régression** : `[SPEC-101]`, `@SPEC-101`.
- **Traçabilité** : CA-1, CA-2, CA-4, CA-5, CA-6, CA-7 → intégration ; CA-3 → intégration + e2e (carte Contraintes) ; CA-6 → unitaire + intégration ; CA-8 → e2e et `@visual`.

## 13. Preuves attendues

`evidence/SPEC-102/` : vidéo e2e, capture `screenshots/spec-102-demo.png`, rapports `unit.json`, `integration.json`, extrait SQL de `\d public.profiles` (sortie de `psql`) joint dans `summary.md`.

## 14. Définition de terminé

Définition commune (testing.md §7) ; la migration `identity_triggers` s'applique sur une base vide via `pnpm db:reset` ; le test générique `[SPEC-101] conventions de schéma` reste vert (déclencheurs `set_updated_at` présents).

## 15. Décisions et hypothèses

- ADR appliqués : ADR-0022, ADR-0030 (fuseau IANA, défaut `Europe/Paris`), ADR-0112 (RLS dès la création).
- **ADR-0113** (compléments au modèle) : ajout de `profiles.streak_days`, `profiles.streak_computed_on` (alimentés par SPEC-411, lus par la vue `group_member_progress` de SPEC-111), `updated_at` sur `push_subscriptions` et `pauses`, `not null` sur `p256dh`/`auth`, contraintes de cohérence de suppression et de pause.
- **ADR-0114** (initialisation du compte par déclencheur `security definer` sur `auth.users`, valeurs `params` par défaut EF-6 avec noms de paramètres en anglais).
- Hypothèse : le détecteur de fuseau navigateur (SPEC-601) transmet `timezone` dans les métadonnées d'inscription ; à défaut, `Europe/Paris`.
- La ligne `subscriptions` par défaut est ajoutée à `handle_new_user` par SPEC-110 (remplacement de la fonction par une nouvelle migration).
