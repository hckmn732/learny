-- Buckets privés et politiques Storage de SPEC-114 (EF-1 à EF-7, ET-1 à ET-6 ; ADR-0058,
-- ADR-0249).
--
-- Deux buckets privés seulement : `resources` (apports) et `exports` (archives personnelles).
-- Aucun objet n'a d'URL publique permanente : la lecture passe par une URL signée de dix minutes
-- délivrée après vérification de la ligne DB (packages/db/src/storage/signed-urls.ts).
-- Les écritures sur `exports` restent réservées au rôle `service_role` du job d'export : aucune
-- politique d'insertion authentifiée n'existe pour ce bucket, donc RLS refuse par défaut.
--
-- Forme du chemin : <userId>/<uuid>/<nom>. Le premier segment doit être exactement
-- auth.uid()::text ; le second est un UUID de ressource ou d'export ; le nom ne contient aucun
-- séparateur. `storage.foldername(name)` renvoie les dossiers du chemin, ce qui permet d'exiger
-- exactement deux dossiers (trois segments). `WITH CHECK` répète la condition en écriture : un
-- objet ne peut donc jamais être déplacé sous le préfixe d'un autre utilisateur.

-- ---------------------------------------------------------------------------------------------
-- ET-1 — buckets privés. `public = false` interdit toute lecture anonyme permanente. Les limites
-- de taille reprennent BR-APP-02 (apport ≤ 50 Mo) ; les types MIME et le quota global restent
-- validés par SPEC-206 avant finalisation, le bucket accepte donc les types variés des apports.
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('resources', 'resources', false, 52428800, null),
  ('exports', 'exports', false, 2147483648, null)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Les métadonnées de buckets elles-mêmes ne sont pas exposées aux rôles utilisateurs : seules les
-- politiques de `storage.objects` ci-dessous les concernent. Aucune politique n'est créée sur
-- `storage.buckets` pour `anon` ou `authenticated`.

-- ---------------------------------------------------------------------------------------------
-- ET-1, ET-2 — apports : lecture, envoi, mise à jour et suppression limités au préfixe du
-- propriétaire. Le nom doit conserver exactement deux dossiers et un UUID au second segment.
-- ---------------------------------------------------------------------------------------------
create policy storage_resources_owner_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'resources'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy storage_resources_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'resources'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and (storage.foldername(name))[2] ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and length(name) <= 512
  );

-- `USING` borne la ligne déplacée, `WITH CHECK` la ligne résultante : les deux conditions
-- interdisent un déplacement vers le préfixe d'un autre utilisateur (ET-2).
create policy storage_resources_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'resources'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'resources'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and (storage.foldername(name))[2] ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and length(name) <= 512
  );

create policy storage_resources_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'resources'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- ---------------------------------------------------------------------------------------------
-- ET-1, ET-2, EF-4 — exports : le propriétaire lit et supprime uniquement ses propres archives.
-- L'insertion et la mise à jour authentifiées sont volontairement absentes : le job d'export écrit
-- avec `service_role`, qui contourne RLS. Une politique de service bornée au bucket documente cette
-- écriture et empêche toute extension accidentelle à l'autre bucket.
-- ---------------------------------------------------------------------------------------------
create policy storage_exports_owner_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'exports'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy storage_exports_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'exports'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy storage_exports_service_insert on storage.objects
  for insert to service_role
  with check (bucket_id = 'exports');

create policy storage_exports_service_update on storage.objects
  for update to service_role
  using (bucket_id = 'exports')
  with check (bucket_id = 'exports');

create policy storage_exports_service_delete on storage.objects
  for delete to service_role
  using (bucket_id = 'exports');

create policy storage_resources_service_delete on storage.objects
  for delete to service_role
  using (bucket_id = 'resources');

-- Le bucket `resources` est aussi nettoyé par les jobs (CL-5) : la politique de service ci-dessus
-- borne la suppression au bon bucket, et le rôle `service_role` conserve son contournement RLS
-- pour les objets orphelins.
