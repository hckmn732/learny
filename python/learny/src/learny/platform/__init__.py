"""Technical capabilities shared by several contexts (ADR-2003).

They are the model gateway and its providers, embeddings, web search, the object store, the
Stripe gateway and the SSRF-safe fetcher. Each one exposes a Protocol, live adapters selected
from the settings and, where ADR requires it, an in-memory or deterministic mock; no business
rule lives here.
"""
