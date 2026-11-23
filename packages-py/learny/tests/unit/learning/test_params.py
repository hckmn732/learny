"""[SPEC-2202] Parameter resolution of the engine (SPEC-401 ET-4, CL-7).

The Python defaults mirror `ENGINE` of `packages/config/src/product.ts` and the merge refuses every
unknown or unauthorised value.
"""

from collections.abc import Callable
from typing import Any

import pytest
from learny.learning.domain.errors import EngineError
from learny.learning.domain.params import ENGINE, with_params

pytestmark = pytest.mark.spec("SPEC-2202")


def _invalid_param(run: Callable[[], Any]) -> EngineError:
    with pytest.raises(EngineError) as caught:
        run()
    assert caught.value.code == "INVALID_PARAM"
    return caught.value


def test_defaults_are_returned_without_sharing_references() -> None:
    params = with_params("mastery")
    assert params == ENGINE["mastery"]
    assert params is not ENGINE["mastery"]
    global_quiz = with_params("globalQuiz")
    assert global_quiz == ENGINE["globalQuiz"]
    assert global_quiz["formatSeconds"] is not ENGINE["globalQuiz"]["formatSeconds"]


def test_a_partial_override_is_deeply_merged() -> None:
    params = with_params("globalQuiz", {"maxMinutesDefault": 30})
    assert params["maxMinutesDefault"] == 30
    assert params["allowedMaxMinutes"] == ENGINE["globalQuiz"]["allowedMaxMinutes"]
    assert params["formatSeconds"] == ENGINE["globalQuiz"]["formatSeconds"]
    assert ENGINE["globalQuiz"]["maxMinutesDefault"] == 15


def test_arrays_are_replaced_not_merged() -> None:
    params = with_params("globalQuiz", {"allowedMaxMinutes": [10, 30]})
    assert params["allowedMaxMinutes"] == [10, 30]
    assert ENGINE["globalQuiz"]["allowedMaxMinutes"] == [10, 15, 20, 30]


def test_a_value_outside_the_allowed_list_is_refused() -> None:
    retention = _invalid_param(lambda: with_params("fsrs", {"requestRetention": 0.8}))
    assert retention.path == "fsrs.requestRetention"
    _invalid_param(lambda: with_params("globalQuiz", {"maxMinutesDefault": 25}))
    _invalid_param(lambda: with_params("planner", {"sprintDaysBeforeDefault": 4}))
    _invalid_param(lambda: with_params("warmup", {"defaultCount": 4}))
    _invalid_param(lambda: with_params("fsrs", {"allowedRetentions": [0.8]}))
    _invalid_param(lambda: with_params("globalQuiz", {"allowedMaxMinutes": [15, 25]}))


def test_an_unknown_parameter_is_refused_and_engine_is_protected() -> None:
    _invalid_param(lambda: with_params("fsrs", {"unknown": True}))
    _invalid_param(lambda: with_params("fsrs", {"allowedRetentions": 0.9}))
    _invalid_param(lambda: with_params("mastery", {"halfLifeDays": {"nested": 1}}))
    params = with_params("fsrs", {"hardFactor": 3})
    params["allowedRetentions"].append(0.8)
    params["hardFactor"] = 4
    assert ENGINE["fsrs"]["hardFactor"] == 2
    assert ENGINE["fsrs"]["allowedRetentions"] == [0.85, 0.9, 0.95]
    assert with_params("fsrs", {"requestRetention": 0.95})["requestRetention"] == 0.95
