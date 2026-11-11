-- Rôles Supabase de la pile auto-hébergée (SPEC-012, ADR-0227).
-- Exécuté une seule fois, à l'initialisation d'un volume Postgres vide, avant les migrations de
-- l'image. Les trois rôles de connexion reçoivent le mot de passe fourni à l'exécution ; les rôles
-- anonymes (anon, authenticated, service_role) restent NOLOGIN et ne reçoivent aucun secret ici.
\set ON_ERROR_STOP on
\getenv postgres_password POSTGRES_PASSWORD
select format('alter role supabase_auth_admin with login password %L', :'postgres_password') \gexec
select format('alter role supabase_storage_admin with login password %L', :'postgres_password') \gexec
select format('alter role authenticator with login password %L', :'postgres_password') \gexec
