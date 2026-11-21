"""[SPEC-2003] JavaScript JSON rendering is byte-identical (ADR-2008)."""

import json
from pathlib import Path
from typing import Any

import pytest
from learny.shared.jsonx import canonical, dumps

pytestmark = pytest.mark.spec("SPEC-2003")

ROOT = Path(__file__).resolve().parents[5]
VECTORS = json.loads((ROOT / "api" / "oracles" / "vectors" / "jsonx.json").read_text("utf-8"))

# U+00E9 written as an escape so this module stays ASCII (language policy, ADR-2011).
ACCENTED = "\u00e9"


@pytest.mark.parametrize("case", VECTORS["stringify"])
def test_stringify_matches_javascript(case: dict[str, Any]) -> None:
    assert dumps(case["value"]).decode("utf-8") == case["json"]


@pytest.mark.parametrize("case", VECTORS["toFixed"])
def test_to_fixed_matches_javascript(case: dict[str, Any]) -> None:
    from learny.shared.jsmath import to_fixed

    assert to_fixed(float(case["value"]), int(case["digits"])) == case["text"]


def test_dumps_preserves_insertion_order_and_unicode() -> None:
    produced = dumps({"b": 1, "a": ACCENTED, "c": [1, None, True]}).decode()
    assert produced == f'{{"b":1,"a":"{ACCENTED}","c":[1,null,true]}}'


def test_dumps_rejects_unknown_types() -> None:
    with pytest.raises(TypeError, match="serialisable"):
        dumps({"when": object()})


def test_canonical_keeps_null_members_and_sorts_by_utf16_code_units() -> None:
    # `canonicalJson({ a: undefined, b: null })` returns `{"b":null}`: only `undefined` is dropped,
    # and Python has no `undefined`, so a `None` member must survive.
    value = {"b": 1, "a": None, "A": 2, ACCENTED: 3}
    assert canonical(value).decode() == f'{{"A":2,"a":null,"b":1,"{ACCENTED}":3}}'


def test_canonical_vector_keys_order() -> None:
    # The Node-generated vector is authoritative: it keeps the `null` member of its input.
    case = VECTORS["canonical"][0]
    produced = json.loads(canonical(case["input"]).decode())
    assert list(produced.keys()) == case["keys"]
    assert produced["a"] is None
