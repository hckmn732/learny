"""[SPEC-2201] The BYOK envelope of `learny.platform.llm`."""

import base64

import pytest
from learny.platform.llm.credentials import (
    AES_GCM_ENVELOPE_BYTES,
    AES_GCM_IV_BYTES,
    KEYRING_KEY_BYTES,
    Keyring,
    KeyringError,
    credential_aad,
    decrypt_secret,
    encrypt_secret,
    key_fingerprint,
    key_last4_of,
    key_prefix_of,
    load_keyring,
    mask_key,
    same_fingerprint,
)
from learny.shared.errors import AppError

pytestmark = pytest.mark.spec("SPEC-2201")

KEY = bytes(range(KEYRING_KEY_BYTES))
OTHER_KEY = bytes(reversed(range(KEYRING_KEY_BYTES)))
AAD = credential_aad("44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555")


def test_the_envelope_round_trips_and_has_the_expected_layout() -> None:
    blob = encrypt_secret("sk-proj-secret", AAD, KEY)

    assert len(blob) == AES_GCM_ENVELOPE_BYTES + len("sk-proj-secret")
    assert decrypt_secret(blob, AAD, Keyring(KEY, None)) == ("sk-proj-secret", False)


def test_two_encryptions_of_the_same_secret_differ() -> None:
    first = encrypt_secret("same", AAD, KEY)
    second = encrypt_secret("same", AAD, KEY)

    assert first[:AES_GCM_IV_BYTES] != second[:AES_GCM_IV_BYTES]
    assert first != second


def test_another_rows_aad_is_refused() -> None:
    blob = encrypt_secret("secret", AAD, KEY)
    other = credential_aad("66666666-6666-4666-8666-666666666666", "55555555-5555-4555-8555-555555555555")

    with pytest.raises(AppError) as raised:
        decrypt_secret(blob, other, Keyring(KEY, None))

    assert raised.value.code == "CREDENTIAL_DECRYPT_FAILED"
    assert raised.value.status == 500


def test_a_tampered_byte_is_refused() -> None:
    blob = bytearray(encrypt_secret("secret", AAD, KEY))
    blob[-1] ^= 0xFF

    with pytest.raises(AppError):
        decrypt_secret(bytes(blob), AAD, Keyring(KEY, None))


def test_a_truncated_envelope_is_refused() -> None:
    with pytest.raises(AppError):
        decrypt_secret(b"\x00" * 4, AAD, Keyring(KEY, None))


def test_a_rotation_reads_the_previous_key_once() -> None:
    blob = encrypt_secret("secret", AAD, OTHER_KEY)

    assert decrypt_secret(blob, AAD, Keyring(KEY, OTHER_KEY)) == ("secret", True)
    with pytest.raises(AppError):
        decrypt_secret(blob, AAD, Keyring(KEY, None))


def test_the_keyring_is_read_from_the_environment() -> None:
    encoded = base64.b64encode(KEY).decode()
    ring = load_keyring({"APP_ENCRYPTION_KEY": encoded})

    assert ring.current == KEY
    assert ring.previous is None


@pytest.mark.parametrize(
    "env",
    [
        {},
        {"APP_ENCRYPTION_KEY": ""},
        {"APP_ENCRYPTION_KEY": "not-base64!"},
        {"APP_ENCRYPTION_KEY": base64.b64encode(b"short").decode()},
    ],
)
def test_a_bad_master_key_fails_without_naming_its_value(env: dict[str, str]) -> None:
    with pytest.raises(KeyringError):
        load_keyring(env)


def test_the_fingerprint_is_stable_and_compared_in_constant_time() -> None:
    fingerprint = key_fingerprint("sk-proj-abc", KEY)

    assert fingerprint == key_fingerprint("sk-proj-abc", KEY)
    assert fingerprint != key_fingerprint("sk-proj-abd", KEY)
    assert same_fingerprint(fingerprint, key_fingerprint("sk-proj-abc", KEY))
    assert not same_fingerprint(fingerprint, key_fingerprint("sk-proj-abd", KEY))


@pytest.mark.parametrize(
    ("last4", "prefix", "expected"),
    [
        ("a91F", "sk", "sk-\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022a91F"),
        ("7Kq2", "", "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u20227Kq2"),
        ("7Kq2", "  ", "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u20227Kq2"),
        ("7Kq2", "sk-", "sk-\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u20227Kq2"),
    ],
)
def test_the_mask_keeps_only_the_prefix_and_the_last_four(last4: str, prefix: str, expected: str) -> None:
    assert mask_key(last4, prefix) == expected


def test_the_key_fragments_of_a_secret() -> None:
    assert key_prefix_of("sk-proj-abcd1234") == "sk"
    assert key_prefix_of("1234abcd") == ""
    assert key_last4_of("sk-proj-abcd1234") == "1234"
    assert key_last4_of("abc") == "abc"
