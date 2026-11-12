# @learny/services

Logique métier de Learny. Les route handlers de `apps/web` n'en contiennent aucune : ils valident l'entrée et appellent ce paquet (`docs/architecture/overview.md` §3).

## API publique

- `createServiceContext({ userId, email, requestId, logger?, clock? })` : contexte d'un appel utilisateur — `db` est un `userDb` soumis à la RLS, `null` pour une requête publique.
- `createSystemContext({ requestId, logger? })` : contexte système (jobs, webhooks) avec `sdb` = `serviceDb()`, réservé aux usages listés (ADR-0022).
- `devEcho`, `listDevItems` : services de démonstration de SPEC-201.

Les services renvoient `Result<T, AppError>` (`@learny/core`) ou lèvent une `AppError`.
