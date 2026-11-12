-- Seaux de débit : l'horloge est celle de l'application (SPEC-208 ET-2 ; ADR-0047, ADR-0213).
-- Le déclencheur générique `set_updated_at` remplaçait `updated_at` par `now()` à chaque mise à
-- jour : la recharge linéaire des jetons, calculée à partir de l'instant injecté, ne pouvait plus
-- être simulée par les tests (horloge figée ou avancée). La requête de consommation écrit
-- elle-même `updated_at`, seul instant de référence de la recharge : le déclencheur est retiré.
-- Ne jamais modifier après fusion : ajouter une migration.
drop trigger if exists set_updated_at on public.rate_limits;
