"""E-mail channel of the engagement context (SPEC-2205, ported from `packages/notifications/src/email`).

Three transports, selected by `EMAIL_MODE` exactly like the TypeScript backend: `memory` captures
every message in a process-local outbox and never opens a socket (unit and integration tests),
`smtp` talks to Mailpit through `aiosmtplib` in local development, `resend` calls the HTTP API with
the caller's idempotency key in production. A transport error is either transient (worth another
attempt) or a definitive rejection, and never carries the recipient address (SPEC-204 ET-5, CL-2).

The server-side configuration is validated when it is first read, before any send: a production
process without `EMAIL_LINK_SECRET`, or a `resend` mode without `RESEND_API_KEY`, fails there.
"""

import hashlib
from collections.abc import Mapping
from dataclasses import dataclass
from email.message import EmailMessage as MimeMessage
from pathlib import Path
from typing import Literal, Protocol

import aiosmtplib
import httpx
import jinja2

from learny.shared.clock import Clock
from learny.shared.config import Settings
from learny.shared.locale_fr import engagement_email as fr

EmailMode = Literal["memory", "smtp", "resend"]

DEFAULT_EMAIL_FROM = "Learny <bonjour@learny.app>"
DEFAULT_APP_URL = "http://localhost:3000"
# Development value of `.env.example`; the production configuration refuses it by requiring an
# explicit `EMAIL_LINK_SECRET` (packages/notifications/src/email/config.ts).
DEV_LINK_SECRET = "learny-test-only-email-link-secret-00000000"  # noqa: S105

UNSUBSCRIBE_PATH = "/api/v1/email/unsubscribe"
RESEND_ENDPOINT = "https://api.resend.com/emails"
RESEND_TIMEOUT_SECONDS = 10.0

TEMPLATES_DIR = Path(__file__).resolve().parents[1] / "templates" / "email"


class EmailConfigError(RuntimeError):
    """The e-mail configuration is incomplete for the selected mode (fails at startup)."""


class EmailTransientError(Exception):
    """The transport failed in a way another attempt may fix (429, 5xx, network, SMTP)."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class EmailRejectedError(Exception):
    """The transport refused the message for good (a 4xx that is not 429)."""

    def __init__(self, message: str, status: int) -> None:
        super().__init__(message)
        self.status = status


def is_transient_email_error(error: BaseException) -> bool:
    return isinstance(error, EmailTransientError)


def is_rejected_email_error(error: BaseException) -> bool:
    return isinstance(error, EmailRejectedError)


def is_transient_status(status: int | None) -> bool:
    """`isTransientStatus`: a network failure, 429 or 5xx is worth another attempt."""
    return status is None or status == 429 or status >= 500


@dataclass(frozen=True, slots=True)
class EmailConfig:
    """The validated e-mail configuration of the process (SPEC-204 section 3)."""

    mode: EmailMode
    sender: str
    app_url: str
    link_secret: str
    smtp_host: str
    smtp_port: int
    resend_api_key: str | None
    is_production: bool


def default_mode(app_env: str) -> EmailMode:
    """`envDefaults`: test captures in memory, local development uses Mailpit, the rest Resend."""
    if app_env == "test":
        return "memory"
    if app_env in ("local", "development", ""):
        return "smtp"
    return "resend"


def build_email_config(settings: Settings) -> EmailConfig:
    """Reads and validates the configuration once; an incomplete one raises before any send."""
    is_production = settings.app_env == "production"
    mode = settings.email_mode if settings.email_mode is not None else default_mode(settings.app_env)
    link_secret = settings.email_link_secret
    if link_secret is None:
        if is_production:
            raise EmailConfigError(fr.LINK_SECRET_REQUIRED)
        link_secret = DEV_LINK_SECRET
    if mode == "resend" and not settings.resend_api_key:
        raise EmailConfigError(fr.RESEND_KEY_REQUIRED)
    app_url = settings.next_public_app_url or DEFAULT_APP_URL
    return EmailConfig(
        mode=mode,
        sender=settings.email_from or DEFAULT_EMAIL_FROM,
        app_url=app_url.rstrip("/"),
        link_secret=link_secret,
        smtp_host=settings.smtp_host or "127.0.0.1",
        smtp_port=settings.smtp_port or 1025,
        resend_api_key=settings.resend_api_key,
        is_production=is_production,
    )


@dataclass(frozen=True, slots=True)
class EmailTag:
    """One Resend tag of the message (`template`, `category`)."""

    name: str
    value: str


@dataclass(frozen=True, slots=True)
class EmailMessage:
    """A rendered message ready for a transport (SPEC-204 ET-1)."""

    to: str
    sender: str
    subject: str
    html: str
    text: str
    headers: Mapping[str, str]
    tags: tuple[EmailTag, ...]


@dataclass(frozen=True, slots=True)
class RenderedEmail:
    """Subject, both bodies, headers and tags of a template, before the recipient is known."""

    subject: str
    html: str
    text: str
    headers: Mapping[str, str]
    tags: tuple[EmailTag, ...]


@dataclass(frozen=True, slots=True)
class OutboxEntry:
    """One captured message of the `memory` transport."""

    message_id: str
    idempotency_key: str
    message: EmailMessage


class EmailTransport(Protocol):
    """What a sender needs from a transport."""

    @property
    def name(self) -> str: ...

    async def send(self, message: EmailMessage, *, idempotency_key: str) -> str: ...


def message_id_for(prefix: str, idempotency_key: str) -> str:
    """Deterministic message identifier: no random source, the key itself names the message."""
    digest = hashlib.sha256(idempotency_key.encode("utf-8")).hexdigest()[:32]
    return f"{prefix}_{digest}"


class MemoryEmailTransport:
    """The outbox of the unit, integration and e2e tests: no network, no socket."""

    def __init__(self, clock: Clock) -> None:
        self._clock = clock
        self._outbox: list[OutboxEntry] = []

    @property
    def name(self) -> str:
        return "memory"

    async def send(self, message: EmailMessage, *, idempotency_key: str) -> str:
        """A second send with the same key returns the same identifier and captures nothing."""
        for entry in self._outbox:
            if entry.idempotency_key == idempotency_key:
                return entry.message_id
        message_id = message_id_for("mem", idempotency_key)
        self._outbox.append(
            OutboxEntry(message_id=message_id, idempotency_key=idempotency_key, message=message)
        )
        return message_id

    def entries(self) -> tuple[OutboxEntry, ...]:
        """The captured messages, oldest first."""
        return tuple(self._outbox)

    def clear(self) -> None:
        self._outbox.clear()


def _mime(message: EmailMessage) -> MimeMessage:
    """The RFC 5322 message handed to `aiosmtplib`, with the text and HTML alternatives."""
    mime = MimeMessage()
    mime["From"] = message.sender
    mime["To"] = message.to
    mime["Subject"] = message.subject
    for name, value in message.headers.items():
        mime[name] = value
    mime.set_content(message.text)
    mime.add_alternative(message.html, subtype="html")
    return mime


class SmtpEmailTransport:
    """Mailpit in local development: no TLS, any failure is worth a retry (SPEC-204 ET-5)."""

    def __init__(self, host: str, port: int) -> None:
        self._host = host
        self._port = port

    @property
    def name(self) -> str:
        return "smtp"

    async def send(self, message: EmailMessage, *, idempotency_key: str) -> str:
        try:
            await aiosmtplib.send(
                _mime(message),
                sender=message.sender,
                recipients=[message.to],
                hostname=self._host,
                port=self._port,
                use_tls=False,
            )
        except Exception as error:  # the SMTP server is local infrastructure: retry
            raise EmailTransientError(fr.SMTP_FAILED) from error
        return message_id_for("smtp", idempotency_key)


class ResendEmailTransport:
    """Production transport: one HTTPS call, the caller's idempotency key, a bounded timeout."""

    def __init__(self, api_key: str, *, timeout: float = RESEND_TIMEOUT_SECONDS) -> None:
        self._api_key = api_key
        self._timeout = timeout

    @property
    def name(self) -> str:
        return "resend"

    async def send(self, message: EmailMessage, *, idempotency_key: str) -> str:
        payload = {
            "from": message.sender,
            "to": [message.to],
            "subject": message.subject,
            "html": message.html,
            "text": message.text,
            "headers": dict(message.headers),
            "tags": [{"name": tag.name, "value": tag.value} for tag in message.tags],
        }
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    RESEND_ENDPOINT,
                    json=payload,
                    headers={
                        "authorization": f"Bearer {self._api_key}",
                        "idempotency-key": idempotency_key,
                    },
                )
        except httpx.HTTPError as error:
            raise EmailTransientError(fr.RESEND_UNAVAILABLE, None) from error
        if response.status_code >= 400:
            if is_transient_status(response.status_code):
                raise EmailTransientError(fr.RESEND_UNAVAILABLE, response.status_code)
            raise EmailRejectedError(fr.RESEND_REFUSED, response.status_code)
        body = response.json()
        identifier = body.get("id") if isinstance(body, dict) else None
        return str(identifier) if identifier else message_id_for("resend", idempotency_key)


def create_email_transport(config: EmailConfig, clock: Clock) -> EmailTransport:
    """The transport of the configuration; an unconfigured mode fails before any send."""
    if config.mode == "memory":
        return MemoryEmailTransport(clock)
    if config.mode == "smtp":
        return SmtpEmailTransport(config.smtp_host, config.smtp_port)
    if config.resend_api_key is None:
        raise EmailConfigError(fr.RESEND_KEY_REQUIRED)
    return ResendEmailTransport(config.resend_api_key)


def render_template_file(name: str, context: Mapping[str, object]) -> str:
    """Renders one Jinja2 template of `learny/engagement/templates` with autoescaping."""
    environment = jinja2.Environment(
        loader=jinja2.FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=jinja2.select_autoescape(("html", "html.j2")),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    return environment.get_template(name).render(**context)


__all__ = [
    "DEFAULT_APP_URL",
    "DEFAULT_EMAIL_FROM",
    "DEV_LINK_SECRET",
    "RESEND_ENDPOINT",
    "RESEND_TIMEOUT_SECONDS",
    "TEMPLATES_DIR",
    "UNSUBSCRIBE_PATH",
    "EmailConfig",
    "EmailConfigError",
    "EmailMessage",
    "EmailMode",
    "EmailRejectedError",
    "EmailTag",
    "EmailTransientError",
    "EmailTransport",
    "MemoryEmailTransport",
    "OutboxEntry",
    "RenderedEmail",
    "ResendEmailTransport",
    "SmtpEmailTransport",
    "build_email_config",
    "create_email_transport",
    "default_mode",
    "is_rejected_email_error",
    "is_transient_email_error",
    "is_transient_status",
    "message_id_for",
    "render_template_file",
]
