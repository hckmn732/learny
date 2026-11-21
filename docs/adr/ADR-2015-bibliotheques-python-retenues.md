# ADR-2015 — Bibliothèques Python retenues

- **Statut** : Acceptée
- **Origine** : Déduite (canevas technique de la piste python-migration)
- **Date** : 2026-11-21
- **Liens** : ADR-2002, ADR-2011

## Contexte

Le portage doit limiter la sur-ingénierie et les dépendances. La liste a été résolue ensemble sous Python 3.13 le 21 novembre 2026 (spikes.md §E).

## Décision

- Web : fastapi, starlette, uvicorn. Modèles et configuration : pydantic, pydantic-settings. Base : sqlalchemy (Core), psycopg (+ pool), pgvector. HTTP sortant : httpx (aussi pour Supabase Auth/Storage, Voyage, Resend, Tavily). Journaux : structlog ; erreurs : sentry-sdk.
- Sécurité : pyjwt, cryptography. IA : SDK officiels anthropic et openai (le second, avec `base_url`, pour Mistral, DeepSeek, compatibles OpenAI et local). Paiement : stripe. Notifications : pywebpush, aiosmtplib, jinja2. Ingestion : pypdf, readability-lxml (+ lxml_html_clean), youtube-transcript-api. Fuseaux : tzdata.
- Tests et qualité : pytest, pytest-asyncio, pytest-cov, hypothesis, ruff, mypy, import-linter, datamodel-code-generator.
- Exclus : LangChain, LiteLLM, PydanticAI, Celery, Dramatiq, Temporal, SDK Inngest, ORM mappé, Alembic, conteneurs d'injection de dépendances, Redis.
- FSRS : portage direct du sous-ensemble de ts-fsrs 5.4.2 utilisé, sans dépendre du paquet `fsrs`.

## Conséquences

Toute nouvelle dépendance d'exécution exige un ADR. Les versions exactes sont figées par `uv.lock`.
