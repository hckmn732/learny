# Feuille de route SDD — piste python-migration

La migration est la seule piste active (ADR-2001). Elle part de `main`, ne dépend d'aucun checkpoint d'une autre piste et se découpe en 14 spécifications réparties sur 4 phases. Le canevas technique à suivre pour chacune est dans `docs/architecture/python-backend/` (ADR-2011).

| Phase | Checkpoint | Spécifications | Sortie |
|---|---|---|---|
| P20 — Inventaire, contrat et socle | CP-20 | SPEC-2001 inventaire, parité et oracles ; SPEC-2002 contrat OpenAPI et SDK ; SPEC-2003 socle FastAPI et façade | Base de référence, contrat source, tout le trafic via la façade Python relayant Hono |
| P21 — Données, identité et worker | CP-21 | SPEC-2101 PostgreSQL, JWT, RLS, Storage ; SPEC-2102 outbox et worker | Matrice RLS rejouée, worker durable prêt |
| P22 — Domaines métier | CP-22 | SPEC-2201 identité/formation ; SPEC-2202 apprentissage/évaluations ; SPEC-2203 contenu/ingestion ; SPEC-2204 tuteur/SSE ; SPEC-2205 engagement ; SPEC-2206 facturation/confidentialité ; SPEC-2207 bascule des jobs, crons et routes de démonstration | Toutes les entrées de `api/ownership.yaml` à `py`, parité prouvée, worker Python seul exécutant |
| P23 — Bascule et retrait | CP-23 | SPEC-2301 Coolify, canary, rollback ; SPEC-2302 non-régression et retrait | Production Python, Hono et Inngest retirés |

Dépendances : SPEC-2002 et SPEC-2003 après SPEC-2001 (parallélisables) ; SPEC-2203 et SPEC-2202 parallélisables après SPEC-2201 ; SPEC-2205 après SPEC-2202 ; SPEC-2204 après SPEC-2202 et SPEC-2203 ; SPEC-2206 puis SPEC-2207 en dernier dans P22 (ADR-2014).

## Décisions

ADR-2001 (recentrage), ADR-2002 (FastAPI), ADR-2003 (monolithe modulaire), ADR-2004 (OpenAPI source, écart 217/219 expliqué), ADR-2005 (façade et table de propriété), ADR-2006 (worker maison, fin d'Inngest), ADR-2007 (Coolify), ADR-2008 (oracles et portage des tests), ADR-2009 (staging fourni), ADR-2010 (JWT et RLS), ADR-2011 (anglais et canevas normatif), ADR-2012 (pipeline piloté par le contrat), ADR-2013 (SQLAlchemy Core sans ORM), ADR-2014 (livraisons de jobs et bascule groupée), ADR-2015 (bibliothèques).

## Historique

Les pistes `produit` et `migration` Hono (P10–P13) sont gelées et conservées. La première version unique `SPEC-MIGRATION` (commit 68d0d3c4) a été remplacée par ce découpage avant tout démarrage.
