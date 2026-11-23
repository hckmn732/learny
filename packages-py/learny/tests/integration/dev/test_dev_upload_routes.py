"""[SPEC-2207] The upload-limits demonstration through the facade.

Every accepted case goes through the real bounds; every refusal carries the code of the real
service. The development guard refuses the route outside `ENABLE_SDD_PAGES`.
"""

from typing import Any

import pytest
from dev_route_support import DevDeps, allow_authentication, build_dev_app
from learny.shared.locale_fr.details import RESOURCE_NOT_FOUND

pytestmark = pytest.mark.spec("SPEC-2207")

ROUTE_IDS = ("dev.uploadSimulation",)
ENABLED = {"APP_ENV": "test", "ENABLE_SDD_PAGES": "true"}


@pytest.fixture
def app() -> tuple[Any, Any]:
    return build_dev_app(ROUTE_IDS, DevDeps(), ENABLED)


def test_the_pdf_at_the_bound_is_accepted(app: tuple[Any, Any], monkeypatch: pytest.MonkeyPatch) -> None:
    _app, client = app
    allow_authentication(monkeypatch)
    response = client.post("/api/v1/dev/sdd/uploads", json={"case": "pdf-limit"})

    assert response.status_code == 200
    assert response.json() == {
        "case": "pdf-limit",
        "accepted": True,
        "kind": "pdf",
        "sizeBytes": 52_428_800,
        "pages": 500,
    }


def test_the_image_one_byte_beyond_the_bound_is_refused(
    app: tuple[Any, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    _app, client = app
    allow_authentication(monkeypatch)
    response = client.post("/api/v1/dev/sdd/uploads", json={"case": "image-too-large"})

    assert response.json()["code"] == "UPLOAD_TOO_LARGE"


def test_an_executable_behind_a_png_name_is_refused(
    app: tuple[Any, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    _app, client = app
    allow_authentication(monkeypatch)
    response = client.post("/api/v1/dev/sdd/uploads", json={"case": "executable-as-png"})

    assert response.json()["code"] == "UNSUPPORTED_TYPE"


def test_the_guard_refuses_the_simulation_outside_enable_sdd_pages() -> None:
    _app, client = build_dev_app(ROUTE_IDS, DevDeps(), {"APP_ENV": "target"})
    response = client.post("/api/v1/dev/sdd/uploads", json={"case": "pdf-limit"})

    assert response.status_code == 404
    assert response.json()["detail"] == RESOURCE_NOT_FOUND
