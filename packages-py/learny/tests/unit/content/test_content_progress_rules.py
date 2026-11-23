"""[SPEC-2203] Reading progress rules: percentages, monotonicity and the reading estimate.

The same inputs and the same expected values, function by function. The HTTP and RLS path is covered
by `tests/integration/content/test_content_progress.py`.
"""

import pytest
from learny.content.application.progress import (
    course_percent,
    estimate_reading_minutes,
    merge_progress,
    reading_percent,
)

pytestmark = pytest.mark.spec("SPEC-2203")


def test_the_visible_share_is_zero_sixty_forty_or_one_hundred_percent() -> None:
    assert reading_percent(0, 5) == 0
    assert reading_percent(3, 5) == 60
    assert reading_percent(2, 5) == 40
    assert reading_percent(5, 5) == 100
    assert reading_percent(9, 5) == 100
    assert reading_percent(1, 0) == 0


def test_the_progress_never_goes_backwards() -> None:
    assert merge_progress(60, 40) == 60
    assert merge_progress(60, 100) == 100
    assert merge_progress(0, 60) == 60


def test_the_course_progress_is_the_mean_of_the_read_chapters() -> None:
    assert course_percent([60, 0, 100, 0]) == 40
    assert course_percent([]) == 0


def test_the_reading_time_is_two_hundred_words_per_minute() -> None:
    assert estimate_reading_minutes(0) == 1
    assert estimate_reading_minutes(200) == 1
    assert estimate_reading_minutes(201) == 2
    assert estimate_reading_minutes(1000) == 5
