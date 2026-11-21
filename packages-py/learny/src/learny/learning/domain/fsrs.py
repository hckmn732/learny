"""FSRS by notion (SPEC-402, ADR-0025) and the personal response-time median (ET-3).

Pure, deterministic entry points of the learning engine: the caller supplies the instant, the
retention and the personal-median bounds; nothing here reads the clock, the configuration, the
database or the network. The scheduler is the subset of `ts-fsrs` 5.4.2 actually used, ported
operation by operation so that the due dates, difficulties and stabilities are identical (the
`fsrs` PyPI package has different defaults and rounding, so it is not a dependency).
"""

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Any

from learny.learning.domain.errors import EngineError, invalid_input, invalid_param
from learny.learning.domain.time import (
    format_instant,
    parse_instant,
    plus_days_ms,
    plus_minutes_ms,
    utc_day_start,
)
from learny.learning.domain.types import (
    BRICK_FORMATS,
    FSRS_RATINGS,
    SerializedFsrsCard,
    validate_card,
)
from learny.shared.jsmath import js_round

S_MIN = 1e-3
S_MAX = 36500.0
INIT_S_MAX = 100.0
MAXIMUM_INTERVAL = 36500
DEFAULT_W: tuple[float, ...] = (
    0.212,
    1.2931,
    2.3065,
    8.2956,
    6.4133,
    0.8334,
    3.0194,
    1e-3,
    1.8722,
    0.1666,
    0.796,
    1.4835,
    0.0614,
    0.2629,
    1.6483,
    0.6014,
    1.8729,
    0.5425,
    0.0912,
    0.0658,
    0.1542,
)
FSRS5_DEFAULT_DECAY = 0.5
FSRS6_DEFAULT_DECAY = 0.1542
DEFAULT_LEARNING_STEPS = ("1m", "10m")
DEFAULT_RELEARNING_STEPS = ("10m",)
MINUTES_PER_DAY = 1440
RATING_INDEX = {"again": 1, "hard": 2, "good": 3, "easy": 4}


def round_to(value: float, decimals: int) -> float:
    """`roundTo`: `Math.round(value * 10 ** decimals) / 10 ** decimals`."""
    factor = 10.0**decimals
    return js_round(value * factor) / factor


def clip(value: float, minimum: float, maximum: float) -> float:
    """`clamp`: the value brought into `[minimum, maximum]`."""
    return min(max(value, minimum), maximum)


def compute_decay_factor(w: Sequence[float] = DEFAULT_W) -> tuple[float, float]:
    """`{decay, factor}` of the forgetting curve, factor rounded to eight decimals."""
    decay = -w[20]
    factor = round_to(math.exp((1 / decay) * math.log(0.9)) - 1, 8)
    return decay, factor


def forgetting_curve(elapsed_days: float, stability: float, w: Sequence[float] = DEFAULT_W) -> float:
    """`R(t, S)`, rounded to eight decimals exactly like `ts-fsrs`."""
    decay, factor = compute_decay_factor(w)
    return round_to(math.pow(1 + factor * elapsed_days / stability, decay), 8)


def interval_modifier(request_retention: float, w: Sequence[float] = DEFAULT_W) -> float:
    """Interval modifier of the requested retention, rounded to eight decimals."""
    decay, factor = compute_decay_factor(w)
    return round_to((math.pow(request_retention, 1 / decay) - 1) / factor, 8)


def init_stability(grade: int, w: Sequence[float] = DEFAULT_W) -> float:
    """`S_0(G) = max(w[G - 1], 0.1)`."""
    return max(w[grade - 1], 0.1)


def init_difficulty(grade: int, w: Sequence[float] = DEFAULT_W) -> float:
    """`D_0(G) = w[4] - e^{(G - 1) w[5]} + 1`, rounded to eight decimals."""
    return round_to(w[4] - math.exp((grade - 1) * w[5]) + 1, 8)


def next_difficulty(difficulty: float, grade: int, w: Sequence[float] = DEFAULT_W) -> float:
    """`D'` after a grade, with the linear damping and the mean reversion of FSRS-6."""
    delta = -w[6] * (grade - 3)
    damped = difficulty + round_to(delta * (10 - difficulty) / 9, 8)
    reverted = round_to(w[7] * init_difficulty(4, w) + (1 - w[7]) * damped, 8)
    return clip(reverted, 1, 10)


def next_recall_stability(
    difficulty: float, stability: float, retrievability: float, grade: int, w: Sequence[float] = DEFAULT_W
) -> float:
    """`S'_r` after a successful review, clamped to `[S_MIN, 36500]`."""
    hard_penalty = w[15] if grade == 2 else 1
    easy_bound = w[16] if grade == 4 else 1
    value = stability * (
        1
        + math.exp(w[8])
        * (11 - difficulty)
        * math.pow(stability, -w[9])
        * (math.exp((1 - retrievability) * w[10]) - 1)
        * hard_penalty
        * easy_bound
    )
    return round_to(clip(value, S_MIN, S_MAX), 8)


def next_forget_stability(
    difficulty: float, stability: float, retrievability: float, w: Sequence[float] = DEFAULT_W
) -> float:
    """`S'_f` after a lapse, clamped to `[S_MIN, 36500]`."""
    value = (
        w[11]
        * math.pow(difficulty, -w[12])
        * (math.pow(stability + 1, w[13]) - 1)
        * math.exp((1 - retrievability) * w[14])
    )
    return round_to(clip(value, S_MIN, S_MAX), 8)


def next_short_term_stability(stability: float, grade: int, w: Sequence[float] = DEFAULT_W) -> float:
    """`S'_s` of a same-instant review (`enable_short_term`)."""
    sinc = math.pow(stability, -w[19]) * math.exp(w[17] * (grade - 3 + w[18]))
    masked = max(sinc, 1) if grade >= 2 else sinc
    return round_to(clip(stability * masked, S_MIN, S_MAX), 8)


@dataclass(frozen=True, slots=True)
class FsrsParams:
    """The scheduler configuration: the two business bounds plus the `ts-fsrs` defaults."""

    request_retention: float
    maximum_interval: int = MAXIMUM_INTERVAL
    w: tuple[float, ...] = DEFAULT_W
    learning_steps: tuple[str, ...] = DEFAULT_LEARNING_STEPS
    relearning_steps: tuple[str, ...] = DEFAULT_RELEARNING_STEPS

    def modifier(self) -> float:
        return interval_modifier(self.request_retention, self.w)

    def next_interval(self, stability: float, elapsed_days: int) -> int:
        """`next_interval`: at least one day, at most the maximum interval."""
        raw = min(max(1, js_round(stability * self.modifier())), self.maximum_interval)
        return js_round(raw)


def scheduler(request_retention: float) -> FsrsParams:
    """`schedulerFor`: retention must be strictly between 0 and 1 (CL-5)."""
    if not _is_finite(request_retention) or request_retention <= 0 or request_retention >= 1:
        raise invalid_param("retention", "The requested retention must be between 0 and 1.")
    return FsrsParams(request_retention=request_retention)


def _is_finite(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def step_minutes(step: str) -> int:
    """`ConvertStepUnitToMinutes`: `1m`, `2h` or `1d` into minutes."""
    unit = step[-1:]
    raw = step[:-1]
    if not raw.isdigit():
        raise EngineError("INVALID_PARAM", f"Invalid step value: {step}")
    value = int(raw)
    if unit == "m":
        return value
    if unit == "h":
        return value * 60
    if unit == "d":
        return value * MINUTES_PER_DAY
    raise EngineError("INVALID_PARAM", f"Invalid step unit: {step}")


def learning_steps_for(params: FsrsParams, state: str, step: int) -> tuple[str, ...]:
    """The steps a card in `state` walks through (relearning steps for review states)."""
    if state in ("relearning", "review"):
        return params.relearning_steps
    return params.learning_steps


def learning_info(params: FsrsParams, state: str, step: int, grade: str) -> tuple[int, int]:
    """`BasicLearningStepsStrategy`: scheduled minutes and next step index for one grade."""
    steps = learning_steps_for(params, state, step)
    current = step or 0
    if not steps or current >= len(steps):
        return (0, 0)
    first = step_minutes(steps[0])
    if state == "review":
        return (step_minutes(steps[max(0, current)]), 0)
    if grade == "again":
        return (first, 0)
    if grade == "hard":
        if len(steps) == 1:
            return (js_round(first * 1.5), current)
        return (js_round((first + step_minutes(steps[1])) / 2), current)
    if grade == "good" and current + 1 < len(steps):
        return (js_round(step_minutes(steps[current + 1])), current + 1)
    return (0, 0)


@dataclass(slots=True)
class _WorkingCard:
    """Mutable working copy of a serialized card, the shape the scheduler mutates."""

    due_ms: int
    stability: float
    difficulty: float
    elapsed_days: int
    scheduled_days: int
    learning_steps: int
    reps: int
    lapses: int
    state: str
    last_review_ms: int | None

    @classmethod
    def read(cls, card: SerializedFsrsCard) -> "_WorkingCard":
        return cls(
            due_ms=parse_instant(card.due),
            stability=card.stability,
            difficulty=card.difficulty,
            elapsed_days=card.elapsed_days,
            scheduled_days=card.scheduled_days,
            learning_steps=card.learning_steps,
            reps=card.reps,
            lapses=card.lapses,
            state=card.state,
            last_review_ms=None if card.last_review is None else parse_instant(card.last_review),
        )

    def serialized(self) -> SerializedFsrsCard:
        return SerializedFsrsCard(
            due=format_instant(self.due_ms),
            stability=self.stability,
            difficulty=self.difficulty,
            elapsed_days=self.elapsed_days,
            scheduled_days=self.scheduled_days,
            learning_steps=self.learning_steps,
            reps=self.reps,
            lapses=self.lapses,
            state=self.state,
            last_review=None if self.last_review_ms is None else format_instant(self.last_review_ms),
        )


def _utc_days(start_ms: int, end_ms: int) -> int:
    """`dateDiffInDays`: whole UTC calendar days between two instants."""
    return (utc_day_start(end_ms) - utc_day_start(start_ms)) // 86_400_000


class _Scheduler:
    """One review of one card at one instant: the port of `AbstractScheduler` + `BasicScheduler`."""

    def __init__(self, card: SerializedFsrsCard, now_ms: int, params: FsrsParams) -> None:
        self.params = params
        self.last = _WorkingCard.read(card)
        self.current = _WorkingCard.read(card)
        self.review_time_ms = now_ms
        interval = 0
        if self.current.state != "new" and self.current.last_review_ms is not None:
            interval = _utc_days(self.current.last_review_ms, now_ms)
        self.current.last_review_ms = now_ms
        self.elapsed_days = interval
        self.current.elapsed_days = interval
        self.current.reps += 1
        self._next: dict[str, _WorkingCard] = {}

    # -- algorithm.next_state ---------------------------------------------------------------------

    def _next_state(self, t: int, grade: int, retrievability: float | None) -> tuple[float, float]:
        difficulty, stability = self.current.difficulty, self.current.stability
        if t < 0:
            raise EngineError("INVALID_INPUT", f'Invalid delta_t "{t}"')
        if difficulty == 0 and stability == 0:
            return (clip(init_difficulty(grade, self.params.w), 1, 10), init_stability(grade, self.params.w))
        if difficulty < 1 or stability < S_MIN:
            raise EngineError(
                "INVALID_INPUT",
                f"Invalid memory state {{ difficulty: {difficulty}, stability: {stability} }}",
            )
        w = self.params.w
        r = retrievability if retrievability is not None else forgetting_curve(t, stability, w)
        if t == 0:
            new_stability = next_short_term_stability(stability, grade, w)
        elif grade == 1:
            after_fail = next_forget_stability(difficulty, stability, r, w)
            next_min = stability / math.exp(w[17] * w[18])
            new_stability = clip(round_to(next_min, 8), S_MIN, after_fail)
        else:
            new_stability = next_recall_stability(difficulty, stability, r, grade, w)
        return (next_difficulty(difficulty, grade, w), new_stability)

    def _next_ds(self, t: int, grade: int, retrievability: float | None = None) -> _WorkingCard:
        difficulty, stability = self._next_state(t, grade, retrievability)
        return replace(self.current, difficulty=difficulty, stability=stability)

    # -- BasicScheduler --------------------------------------------------------------------------

    def _apply_learning_steps(self, card: _WorkingCard, grade: str, to_state: str) -> None:
        minutes, steps = learning_info(self.params, self.current.state, self.current.learning_steps, grade)
        if 0 < minutes < MINUTES_PER_DAY:
            card.learning_steps = steps
            card.scheduled_days = 0
            card.state = to_state
            card.due_ms = plus_minutes_ms(self.review_time_ms, js_round(minutes))
            return
        card.state = "review"
        if minutes >= MINUTES_PER_DAY:
            card.learning_steps = steps
            card.due_ms = plus_minutes_ms(self.review_time_ms, js_round(minutes))
            card.scheduled_days = minutes // MINUTES_PER_DAY
            return
        card.learning_steps = 0
        interval = self.params.next_interval(card.stability, self.elapsed_days)
        card.scheduled_days = interval
        card.due_ms = plus_days_ms(self.review_time_ms, interval)

    def _next_interval(
        self, hard: _WorkingCard, good: _WorkingCard, easy: _WorkingCard, interval: int
    ) -> None:
        hard_interval = self.params.next_interval(hard.stability, interval)
        good_interval = self.params.next_interval(good.stability, interval)
        hard_interval = min(hard_interval, good_interval)
        good_interval = max(good_interval, hard_interval + 1)
        easy_interval = max(self.params.next_interval(easy.stability, interval), good_interval + 1)
        for card, days in ((hard, hard_interval), (good, good_interval), (easy, easy_interval)):
            card.scheduled_days = days
            card.due_ms = plus_days_ms(self.review_time_ms, days)

    @staticmethod
    def _to_review(card: _WorkingCard) -> None:
        card.state = "review"
        card.learning_steps = 0

    def _new_state(self, grade: str) -> _WorkingCard:
        cached = self._next.get(grade)
        if cached is not None:
            return cached
        next_card = self._next_ds(self.elapsed_days, RATING_INDEX[grade])
        self._apply_learning_steps(next_card, grade, "learning")
        self._next[grade] = next_card
        return next_card

    def _learning_state(self, grade: str) -> _WorkingCard:
        cached = self._next.get(grade)
        if cached is not None:
            return cached
        next_card = self._next_ds(self.elapsed_days, RATING_INDEX[grade])
        self._apply_learning_steps(next_card, grade, self.last.state)
        self._next[grade] = next_card
        return next_card

    def _review_state(self, grade: str) -> _WorkingCard:
        cached = self._next.get(grade)
        if cached is not None:
            return cached
        interval = self.elapsed_days
        retrievability = forgetting_curve(interval, self.current.stability, self.params.w)
        again = self._next_ds(interval, 1, retrievability)
        hard = self._next_ds(interval, 2, retrievability)
        good = self._next_ds(interval, 3, retrievability)
        easy = self._next_ds(interval, 4, retrievability)
        self._next_interval(hard, good, easy, interval)
        for card in (hard, good, easy):
            self._to_review(card)
        self._apply_learning_steps(again, "again", "relearning")
        again.lapses += 1
        self._next.update({"again": again, "hard": hard, "good": good, "easy": easy})
        return self._next[grade]

    def review(self, grade: str) -> _WorkingCard:
        if self.last.state == "new":
            return self._new_state(grade)
        if self.last.state in ("learning", "relearning"):
            return self._learning_state(grade)
        return self._review_state(grade)


def _read_grade(grade: object, path: str = "grade") -> str:
    if not isinstance(grade, str) or grade not in FSRS_RATINGS:
        raise invalid_input(path, "Unknown FSRS rating.")
    return grade


def _read_format(value: object) -> str:
    if not isinstance(value, str) or value not in BRICK_FORMATS:
        raise invalid_input("format", "Unknown brick format.")
    return value


def _as_card(card: SerializedFsrsCard | Mapping[str, Any]) -> SerializedFsrsCard:
    """A validated card, from a value object or from its JSON form."""
    if isinstance(card, SerializedFsrsCard):
        return validate_card(card.to_dict())
    return validate_card(card)


def create_notion_card(now: str, retention: float) -> SerializedFsrsCard:
    """EF-1, ET-1: one new FSRS card at the supplied instant."""
    at = parse_instant(now)
    scheduler(retention)
    return _WorkingCard(
        due_ms=at,
        stability=0,
        difficulty=0,
        elapsed_days=0,
        scheduled_days=0,
        learning_steps=0,
        reps=0,
        lapses=0,
        state="new",
        last_review_ms=None,
    ).serialized()


def apply_review(
    card: SerializedFsrsCard | Mapping[str, Any], grade: str, now: str, retention: float
) -> tuple[SerializedFsrsCard, str]:
    """ET-2, EF-5: applies one grade to the current card; returns `(card, dueAt)`."""
    rating = _read_grade(grade)
    at = parse_instant(now)
    current = _as_card(card)
    params = scheduler(retention)
    updated = _Scheduler(current, at, params).review(rating)
    serialized = updated.serialized()
    return (serialized, serialized.due)


def preview_grades(
    card: SerializedFsrsCard | Mapping[str, Any], now: str, retention: float
) -> dict[str, str]:
    """ET-2: the four due dates of the next review in the stable `again..easy` order."""
    at = parse_instant(now)
    current = _as_card(card)
    params = scheduler(retention)
    instance = _Scheduler(current, at, params)
    return {grade: instance.review(grade).serialized().due for grade in FSRS_RATINGS}


# --- personal median -----------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class TimedResponse:
    """One learner answer as the median needs it; extra fields are accepted."""

    answered_at: str
    format: str
    time_ms: float | None
    answer_id: str | None = None


@dataclass(frozen=True, slots=True)
class MedianSettings:
    """Business bounds of the personal median, supplied by the caller."""

    median_window: int
    median_min_samples: int
    default_median_ms: int


def assert_median_settings(settings: MedianSettings) -> MedianSettings:
    """Validates the median bounds; shared with the grading settings of `review`."""
    if not _is_positive_integer(settings.median_window):
        raise invalid_param("medianWindow", "The median window must be a positive integer.")
    if not _is_positive_integer(settings.median_min_samples):
        raise invalid_param("medianMinSamples", "The minimum sample count must be a positive integer.")
    if settings.median_min_samples > settings.median_window:
        raise invalid_param("medianMinSamples", "The minimum sample count exceeds the median window.")
    if not _is_finite(settings.default_median_ms) or settings.default_median_ms <= 0:
        raise invalid_param("defaultMedianMs", "The default duration must be strictly positive.")
    return settings


def _is_positive_integer(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 1


def recent_valid_times(
    history: Sequence[TimedResponse], format_name: str, settings: MedianSettings
) -> list[float]:
    """Strictly positive durations of one format, newest first, limited to the window."""
    assert_median_settings(settings)
    candidates: list[tuple[int, str, float]] = []
    for index, entry in enumerate(history):
        if entry.format != format_name:
            continue
        if entry.time_ms is None or not _is_finite(entry.time_ms) or entry.time_ms <= 0:
            continue
        try:
            answered_at = parse_instant(entry.answered_at)
        except EngineError as error:
            raise invalid_input(f"history.{index}.answeredAt", "Invalid answered instant.") from error
        candidates.append((answered_at, entry.answer_id or "", float(entry.time_ms)))
    candidates.sort(key=lambda candidate: (-candidate[0], candidate[1], candidate[2]))
    return [candidate[2] for candidate in candidates[: settings.median_window]]


def personal_median_ms(history: Sequence[TimedResponse], format_name: str, settings: MedianSettings) -> float:
    """Personal median of the learner for one format (BR-MEM-02, EF-3)."""
    recent = recent_valid_times(history, format_name, settings)
    if len(recent) < settings.median_min_samples:
        return float(settings.default_median_ms)
    ordered = sorted(recent)
    middle = len(ordered) // 2
    if len(ordered) % 2 == 1:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2


# --- grading ------------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class GradeSettings(MedianSettings):
    """Median bounds plus the two response-time factors of the automatic grade."""

    hard_factor: float = 2.0
    easy_factor: float = 0.5


@dataclass(frozen=True, slots=True)
class GradeDecision:
    """The grade of one answer, the reason and the personal median it used."""

    rating: str | None
    reason: str
    median_ms: float

    def to_dict(self) -> dict[str, Any]:
        return {"rating": self.rating, "reason": self.reason, "medianMs": self.median_ms}


def _assert_grade_settings(settings: GradeSettings) -> GradeSettings:
    assert_median_settings(settings)
    if not _is_finite(settings.hard_factor) or settings.hard_factor <= 0:
        raise invalid_param("hardFactor", "The Hard factor must be strictly positive.")
    if not _is_finite(settings.easy_factor) or settings.easy_factor <= 0:
        raise invalid_param("easyFactor", "The Easy factor must be strictly positive.")
    if settings.easy_factor >= settings.hard_factor:
        raise invalid_param("easyFactor", "The Easy factor must be lower than the Hard factor.")
    return settings


def grade_review(
    *,
    correct: bool | None,
    time_ms: float | None,
    format_name: str,
    settings: GradeSettings,
    history: Sequence[TimedResponse] = (),
    self_rating: str | None = None,
) -> GradeDecision:
    """ET-1: grade of an answer (self-assessment for a recall card, median otherwise)."""
    format_value = _read_format(format_name)
    valid_settings = _assert_grade_settings(settings)
    median = personal_median_ms(history, format_value, valid_settings)
    rating = None if self_rating is None else _read_grade(self_rating, "selfRating")
    if time_ms is not None and (not _is_finite(time_ms) or time_ms < 0):
        raise invalid_input("timeMs", "The response duration must be positive or zero.")

    if format_value == "recall_card":
        if rating is None:
            return GradeDecision(rating=None, reason="incomplete", median_ms=median)
        return GradeDecision(rating=rating, reason="self_rating", median_ms=median)
    if correct is False:
        return GradeDecision(rating="again", reason="incorrect", median_ms=median)
    if correct is not True or time_ms is None:
        return GradeDecision(rating=None, reason="incomplete", median_ms=median)
    if time_ms > valid_settings.hard_factor * median:
        return GradeDecision(rating="hard", reason="too_slow", median_ms=median)
    if time_ms < valid_settings.easy_factor * median:
        return GradeDecision(rating="easy", reason="too_fast", median_ms=median)
    return GradeDecision(rating="good", reason="within_median", median_ms=median)
