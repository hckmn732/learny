# ADR-2002 — Runtime Python FastAPI

- **Statut** : Acceptée
- **Origine** : Validée (décision du porteur du projet)
- **Date** : 2026-11-21
- **Liens** : ADR-2001, SPEC-2003

## Contexte

L'API Python doit servir REST, SSE et webhooks avec un contrat OpenAPI exploitable, et partager les mêmes cas d'usage que les workers. Le porteur du projet a retenu FastAPI parmi FastAPI, Litestar ou un POC comparatif.

## Décision

- Python 3.13, gestion de paquets et lockfile par **uv** (workspace à la racine, `uv.lock` commité).
- API ASGI **FastAPI** servie par **Uvicorn** (workers multiples en production), validation **Pydantic v2**.
- Accès base : **SQLAlchemy 2** (Core et ORM, mode async) sur **psycopg 3** ; le schéma reste celui des migrations SQL existantes (`packages/db/migrations`), appliquées par l'outillage actuel ; aucune migration Alembic tant qu'aucun changement de schéma n'est requis.
- Qualité : ruff (format + lint), mypy en mode strict sur les paquets domaine et application, pytest (+ pytest-asyncio, hypothesis pour les tests de propriétés), import-linter pour les frontières.
- HTTP sortant : httpx avec délais bornés ; SDK officiels des fournisseurs IA derrière des ports.
- Horloge : port `Clock` injectable compatible avec l'horloge figée des tests (ADR-0047) ; `datetime.now()` interdit hors de l'adaptateur.

## Conséquences

Les versions exactes sont figées par `uv.lock` dans SPEC-2003. Tout changement de framework exigera un nouvel ADR.
