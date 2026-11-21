"""[SPEC-2101] Local JWT verification against the injected clock."""

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from learny.identity.infrastructure.jwt import JwtVerifier
from learny.shared.clock import FixedClock
from learny.shared.config import Settings
from learny.shared.errors import AppError
from learny.shared.time import parse_iso

pytestmark = pytest.mark.spec("SPEC-2101")

JWT_TEST_SECRET = "x" * 40
NOW = parse_iso("2026-11-11T12:20:00Z")


def settings(secret: str = JWT_TEST_SECRET) -> Settings:
    return Settings(
        app_env="test",
        supabase_url="http://127.0.0.1:54321",
        supabase_jwt_secret=secret,
    )


def token(expires_in: int = 3600, **overrides: object) -> str:
    payload = {
        "sub": "11111111-1111-4111-8111-111111111111",
        "email": "session@test.learny.test",
        "aud": "authenticated",
        "iss": "http://127.0.0.1:54321/auth/v1",
        "iat": int(NOW.timestamp()),
        "exp": int(NOW.timestamp()) + expires_in,
        **overrides,
    }
    return jwt.encode(payload, JWT_TEST_SECRET, algorithm="HS256")


def verifier(clock: FixedClock | None = None) -> JwtVerifier:
    return JwtVerifier(settings(), clock or FixedClock(NOW))


def test_a_valid_token_becomes_an_actor() -> None:
    actor = verifier().verify(token())
    assert actor.user_id == "11111111-1111-4111-8111-111111111111"
    assert actor.email == "session@test.learny.test"
    assert actor.transport == "bearer"


def test_expiry_is_checked_against_the_injected_clock() -> None:
    expired = token(expires_in=-1)
    with pytest.raises(AppError) as error:
        verifier().verify(expired)
    assert error.value.code == "UNAUTHENTICATED"


def test_a_wrong_audience_is_refused() -> None:
    with pytest.raises(AppError):
        verifier().verify(token(aud="anonymous"))


def test_a_wrong_signature_is_refused() -> None:
    forged = jwt.encode(
        {
            "sub": "11111111-1111-4111-8111-111111111111",
            "aud": "authenticated",
            "iss": "http://127.0.0.1:54321/auth/v1",
            "exp": int(NOW.timestamp()) + 3600,
        },
        "another-secret-at-least-32-characters",
        algorithm="HS256",
    )
    with pytest.raises(AppError):
        verifier().verify(forged)


def test_a_malformed_token_is_refused() -> None:
    with pytest.raises(AppError):
        verifier().verify("not-a-token")


def test_an_asymmetric_token_is_verified_with_the_jwks_cache() -> None:
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_jwk = jwt.algorithms.RSAAlgorithm.to_jwk(private.public_key(), as_dict=True)
    public_jwk.update({"kid": "key-1", "alg": "RS256", "use": "sig"})

    async def fetcher() -> dict[str, object]:
        return {"keys": [public_jwk]}

    configured = JwtVerifier(settings(""), FixedClock(NOW), jwks_fetcher=fetcher)
    asymmetric = jwt.encode(
        {
            "sub": "22222222-2222-4222-8222-222222222222",
            "email": "other@test.learny.test",
            "aud": "authenticated",
            "iss": "http://127.0.0.1:54321/auth/v1",
            "exp": int(NOW.timestamp()) + 3600,
        },
        private,
        algorithm="RS256",
        headers={"kid": "key-1"},
    )

    # Unknown kid before the cache is filled: refused, never trusted blindly.
    with pytest.raises(AppError):
        configured.verify(asymmetric)

    import asyncio

    asyncio.run(configured.refresh_jwks())
    actor = configured.verify(asymmetric)
    assert actor.user_id == "22222222-2222-4222-8222-222222222222"
