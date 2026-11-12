-- Le seau `rate_limits` utilise `updated_at` comme état métier (instant de dernière recharge),
-- piloté par l'horloge injectable. Le déclencheur d'audit `set_updated_at` écraserait cette valeur
-- avec l'heure système et casserait la recharge déterministe (SPEC-208 CA-1, ADR-0047).
-- La convention d'audit reste vérifiée pour toutes les autres tables par SPEC-101 CL-6.
drop trigger if exists set_updated_at on public.rate_limits;
