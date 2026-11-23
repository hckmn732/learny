"""[SPEC-616] An output field named after a Python keyword keeps its contract name on the wire.

`datamodel-codegen` turns the `from` of a notion-graph link into `from_` with the alias `from`; the
output check must dump by alias, otherwise the key is renamed then dropped as "absent" and the Zod
parser of the web rejects the whole graph.
"""

from types import SimpleNamespace
from typing import Any, cast

import pytest
from learny_api.generated.models import Link
from learny_api.pipeline import _check_output

pytestmark = pytest.mark.spec("SPEC-616")


def test_an_aliased_output_field_keeps_its_contract_name() -> None:
    payload = {"id": "formation:f", "kind": "formation", "from": "formation:f", "to": "module:m"}
    spec = cast(Any, SimpleNamespace(output=Link))

    assert _check_output(spec, payload, None) == payload
