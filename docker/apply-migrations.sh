#!/bin/sh
# Idempotent migration runner of the self-hosted stack (SPEC-012, EF-4, CL-3).
#
# Each file of supabase/migrations is applied once, in lexical order, inside its own transaction
# and recorded with its SHA-256 in public.selfhost_schema_migrations. A second run applies nothing;
# a file that changed after being applied aborts instead of replaying a destructive migration.
set -eu

: "${DATABASE_URL:?DATABASE_URL est obligatoire}"
: "${MIGRATIONS_DIR:=/migrations}"

psql_run() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 "$@"
}

psql_run --single-transaction -q <<'SQL'
create table if not exists public.selfhost_schema_migrations (
  name text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
);
SQL

applied_count=0
for file in "$MIGRATIONS_DIR"/*.sql; do
  [ -e "$file" ] || continue
  name=$(basename "$file")
  checksum=$(sha256sum "$file" | cut -d ' ' -f 1)
  recorded=$(psql_run -tAc "select checksum from public.selfhost_schema_migrations where name = '$name'")
  if [ -n "$recorded" ]; then
    if [ "$recorded" != "$checksum" ]; then
      echo "migration $name modifiée après application (empreinte différente) : arrêt." >&2
      exit 1
    fi
    echo "déjà appliquée : $name"
    continue
  fi
  echo "application : $name"
  psql_run --single-transaction -q -f "$file"
  psql_run -q -c "insert into public.selfhost_schema_migrations (name, checksum) values ('$name', '$checksum')"
  applied_count=$((applied_count + 1))
done

echo "migrations : $applied_count appliquée(s), base à jour."
