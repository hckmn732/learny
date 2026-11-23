"""BYOK envelope of the personal AI keys (SPEC-2201, port of `credentials/crypto.ts`).

Stored layout: `iv(12) | tag(16) | ciphertext`, AES-256-GCM. The additional authenticated data binds
a ciphertext to one `ai_credentials` row, so copying it onto another learner's row makes decryption
fail (CL-2). The `cryptography` library returns `ciphertext | tag`, hence the explicit reorder.
Plaintext keys only ever live in a local variable: nothing here logs, returns or raises a key.
"""

import base64
import binascii
import hashlib
import hmac
import re
import secrets
from collections.abc import Mapping
from dataclasses import dataclass

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from learny.shared.errors import AppError
from learny.shared.locale_fr.details import CREDENTIAL_DECRYPT_FAILED

AES_GCM_IV_BYTES = 12
AES_GCM_TAG_BYTES = 16
AES_GCM_ENVELOPE_BYTES = AES_GCM_IV_BYTES + AES_GCM_TAG_BYTES
KEYRING_KEY_BYTES = 32
MASK_BULLETS = "\u2022" * 8

BASE64_PATTERN = re.compile(r"^[A-Za-z0-9+/]+={0,2}$")
PREFIX_PATTERN = re.compile(r"^([A-Za-z]+)-")


class KeyringError(ValueError):
    """A master key is missing or malformed; the message names the variable, never its value."""


@dataclass(frozen=True, slots=True)
class Keyring:
    """The current master key and, during a rotation, the previous one."""

    current: bytes
    previous: bytes | None


def _decode_master_key(raw: str | None, name: str, *, required: bool) -> bytes | None:
    if raw is None or raw.strip() == "":
        if not required:
            return None
        raise KeyringError(f"{name} manquante")
    if BASE64_PATTERN.match(raw) is None:
        raise KeyringError(f"{name} invalide")
    try:
        value = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError) as error:
        raise KeyringError(f"{name} invalide") from error
    if len(value) != KEYRING_KEY_BYTES:
        raise KeyringError(f"{name} invalide")
    return value


def load_keyring(env: Mapping[str, str | None]) -> Keyring:
    """Reads the master keys; a 31-byte key fails here even when the env schema was bypassed."""
    current = _decode_master_key(env.get("APP_ENCRYPTION_KEY"), "APP_ENCRYPTION_KEY", required=True)
    previous = _decode_master_key(
        env.get("APP_ENCRYPTION_KEY_PREVIOUS"),
        "APP_ENCRYPTION_KEY_PREVIOUS",
        required=False,
    )
    if current is None:  # unreachable: required=True raises first
        raise KeyringError("APP_ENCRYPTION_KEY manquante")
    return Keyring(current=current, previous=previous)


def credential_aad(credential_id: str, user_id: str) -> str:
    """The AAD binding a ciphertext to its credential row and owner (ADR-0154 point 1)."""
    return f"learny:ai_credentials:{credential_id}:{user_id}"


def encrypt_secret(plain: str, aad: str, key: bytes) -> bytes:
    """Encrypts one secret; the IV is fresh on every call, so two ciphertexts differ (CA-1)."""
    iv = secrets.token_bytes(AES_GCM_IV_BYTES)
    sealed = AESGCM(key).encrypt(iv, plain.encode("utf-8"), aad.encode("utf-8"))
    ciphertext, tag = sealed[:-AES_GCM_TAG_BYTES], sealed[-AES_GCM_TAG_BYTES:]
    return iv + tag + ciphertext


def _decrypt_with(blob: bytes, aad: str, key: bytes) -> str:
    iv = blob[:AES_GCM_IV_BYTES]
    tag = blob[AES_GCM_IV_BYTES:AES_GCM_ENVELOPE_BYTES]
    ciphertext = blob[AES_GCM_ENVELOPE_BYTES:]
    plain = AESGCM(key).decrypt(iv, ciphertext + tag, aad.encode("utf-8"))
    return plain.decode("utf-8")


def _decrypt_failure() -> AppError:
    return AppError("CREDENTIAL_DECRYPT_FAILED", CREDENTIAL_DECRYPT_FAILED, status=500)


def decrypt_secret(blob: bytes, aad: str, ring: Keyring) -> tuple[str, bool]:
    """Returns `(plain, used_previous)`; a tampered byte or another row's AAD is refused."""
    if len(blob) < AES_GCM_ENVELOPE_BYTES:
        raise _decrypt_failure()
    try:
        return _decrypt_with(blob, aad, ring.current), False
    except InvalidTag:
        if ring.previous is None:
            raise _decrypt_failure() from None
        try:
            return _decrypt_with(blob, aad, ring.previous), True
        except InvalidTag:
            raise _decrypt_failure() from None


def key_fingerprint(plain: str, key: bytes) -> str:
    """HMAC-SHA256 hex of a key, stored for duplicate detection."""
    return hmac.new(key, plain.encode("utf-8"), hashlib.sha256).hexdigest()


def same_fingerprint(left: str, right: str) -> bool:
    """Compares two fingerprints without leaking their common prefix timing."""
    return hmac.compare_digest(left.encode("utf-8"), right.encode("utf-8"))


def mask_key(last4: str, prefix: str = "") -> str:
    """`sk-` then eight bullets then the last four, or eight bullets alone without a prefix (CA-4)."""
    tail = last4[-4:]
    clean = prefix.strip().rstrip("-")
    return f"{MASK_BULLETS}{tail}" if clean == "" else f"{clean}-{MASK_BULLETS}{tail}"


def key_prefix_of(plain: str) -> str:
    """Alphabetic prefix before the first hyphen (`sk-proj-...` -> `sk`), or an empty string."""
    match = PREFIX_PATTERN.match(plain)
    return "" if match is None else match.group(1)


def key_last4_of(plain: str) -> str:
    """The only visible fragment of a key."""
    return plain[-4:]
