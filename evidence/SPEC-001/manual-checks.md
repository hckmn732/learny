# Vérifications manuelles — SPEC-001

Exécutées le 2026-11-11 dans le conteneur de développement (Node 24.22.2, pnpm 10.34.9).

## CA-1 — clone propre de la branche spec/SPEC-001 (git clone puis commandes, codes de sortie)

```
INSTALL=0
LINT=0
TYPECHECK=0
BUILD=0
```

## CA-2 / CA-6 — next start -p 3200 sans ENABLE_SDD_PAGES

```
GET /_dev/sdd/SPEC-001 sans ENABLE_SDD_PAGES -> 404
GET /api/v1/health -> HTTP/1.1 200 OK cache-control: no-store content-type: application/json
{"status":"ok"}
POST /api/v1/health -> 405
```
