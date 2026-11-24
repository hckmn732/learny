"""The caller of a request (SPEC-2101 step 2, ADR-2010)."""

from dataclasses import dataclass
from typing import Literal

Transport = Literal["bearer", "cookie"]


@dataclass(frozen=True, slots=True)
class Actor:
    """An authenticated user, as resolved from the HTTP headers."""

    user_id: str
    email: str
    email_confirmed: bool
    transport: Transport
