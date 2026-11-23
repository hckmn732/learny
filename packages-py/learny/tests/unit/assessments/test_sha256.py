"""[SPEC-2202] SHA-256 of the brick fingerprints (SPEC-501, ADR-0289, FIPS 180-4).

The TypeScript package ships its own implementation; these cases are its recordings of 2026-11-21
plus the FIPS reference vectors, so the standard-library port is proven identical.
"""

import hashlib
import json
from pathlib import Path
from typing import Any

import pytest
from learny.assessments.domain.bricks.sha256 import sha256_hex

pytestmark = pytest.mark.spec("SPEC-2202")

FIXTURE = json.loads(
    (Path(__file__).resolve().parents[2] / "fixtures" / "bricks_contract.json").read_text(encoding="utf-8")
)
CASES = FIXTURE["sha256"]


@pytest.mark.parametrize("case", CASES, ids=[case["input"][:16] for case in CASES])
def test_the_digest_matches_the_typescript_engine(case: dict[str, Any]) -> None:
    assert sha256_hex(case["input"]) == case["hex"]


def test_the_fips_reference_vectors_are_reproduced() -> None:
    assert sha256_hex("") == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    assert sha256_hex("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"


def test_the_encoding_is_utf8() -> None:
    assert sha256_hex("\u2014") == hashlib.sha256("\u2014".encode()).hexdigest()


def test_a_lone_surrogate_is_replaced_like_text_encoder() -> None:
    assert sha256_hex("\ud800") == hashlib.sha256("\ufffd".encode()).hexdigest()
