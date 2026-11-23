# SPEC-2003 — one image, two commands (api, worker). ADR-2007, ADR-2015.
#
# The dependency set is installed once in a builder stage with `uv sync --frozen`; the runtime
# stage only carries the virtual environment and the generated contract artefacts under /app/api.
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS builder

WORKDIR /app
ENV UV_COMPILE_BYTECODE=0 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

COPY pyproject.toml uv.lock .python-version ./
COPY packages-py ./packages-py
COPY apps/api-py ./apps/api-py
COPY apps/worker-py ./apps/worker-py
RUN uv sync --frozen --no-dev --no-editable

FROM python:3.13-slim-bookworm AS runtime

# `unprivileged` runs the process; nothing is written outside /app.
RUN useradd --uid 1001 --create-home --shell /usr/sbin/nologin learny

WORKDIR /app
# The contract artefacts are found in /app/api from the working directory (ADR-2042).
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

COPY --from=builder /app/.venv /app/.venv
COPY api ./api

USER learny
EXPOSE 8000

# API:    docker run … uvicorn learny_api.main:app --host 0.0.0.0 --port 8000
# Worker: docker run … python -m learny_worker
CMD ["uvicorn", "learny_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
