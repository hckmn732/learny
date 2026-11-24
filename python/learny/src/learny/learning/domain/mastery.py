"""Mastery of a notion (SPEC-403, BR-LAC-01, ADR-0024).

Pure: the evaluation instant, the mastery parameters and every dated answer come from the caller.
Nothing is read from a clock, a database, the network or an AI provider, and the input is never
mutated. Only the display rounds: `mastery` stays in double precision (ET-2).
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from learny.learning.domain.errors import EngineError, invalid_input
from learny.learning.domain.time import parse_instant

MS_PER_DAY = 86_400_000
DEFAULT_MASTERY_THRESHOLD = 80
DEFAULT_MASTERY_HALF_LIFE_DAYS = 14


@dataclass(frozen=True, slots=True)
class MasteryAnswer:
    """One graded answer of the notion; `score` is the partial success normalised in [0, 1]."""

    answer_id: str
    attempt_id: str
    score: float
    answered_at: str


@dataclass(frozen=True, slots=True)
class MasteryAnswerWeight:
    """Per-answer explanation detail (EF-4): its age at `at` and the weight derived from it."""

    answer_id: str
    attempt_id: str
    score: float
    answered_at: str
    age_days: float
    weight: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "answerId": self.answer_id,
            "attemptId": self.attempt_id,
            "score": self.score,
            "answeredAt": self.answered_at,
            "ageDays": self.age_days,
            "weight": self.weight,
        }


@dataclass(frozen=True, slots=True)
class MasteryResult:
    """Result of the computation, with the aggregates the explanation needs (EF-4)."""

    mastery: float
    threshold: float
    mastered: bool
    answer_count: int
    weight_sum: float
    weighted_score: float
    weights: tuple[MasteryAnswerWeight, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "mastery": self.mastery,
            "threshold": self.threshold,
            "mastered": self.mastered,
            "answerCount": self.answer_count,
            "weightSum": self.weight_sum,
            "weightedScore": self.weighted_score,
            "weights": [weight.to_dict() for weight in self.weights],
        }


def _is_finite(value: Any) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and value == value
        and value
        not in (
            float("inf"),
            float("-inf"),
        )
    )


def _read_answer(answer: Any, index: int) -> MasteryAnswer:
    if not isinstance(answer, dict):
        raise invalid_input(f"answers.{index}", "An answer object is required.")
    for key in ("answerId", "attemptId", "score", "answeredAt"):
        if key not in answer:
            raise invalid_input(f"answers.{index}.{key}", f"Missing field: {key}.")
    score = answer["score"]
    if not _is_finite(score) or score < 0 or score > 1:
        raise invalid_input(f"answers.{index}.score", "Score outside 0..1.")
    answer_id, attempt_id = answer["answerId"], answer["attemptId"]
    if not isinstance(answer_id, str) or not 1 <= len(answer_id) <= 64:
        raise invalid_input(f"answers.{index}.answerId", "Invalid identifier.")
    if not isinstance(attempt_id, str) or not 1 <= len(attempt_id) <= 64:
        raise invalid_input(f"answers.{index}.attemptId", "Invalid identifier.")
    return MasteryAnswer(
        answer_id=answer_id, attempt_id=attempt_id, score=float(score), answered_at=str(answer["answeredAt"])
    )


def calculate_mastery(
    answers: Sequence[Any],
    at: str,
    threshold: float | None = None,
    half_life_days: float | None = None,
) -> MasteryResult:
    """Weighted mastery of one notion: `score` weighted by `0.5^(ageDays / halfLifeDays)`."""
    effective_threshold = DEFAULT_MASTERY_THRESHOLD if threshold is None else threshold
    effective_half_life = DEFAULT_MASTERY_HALF_LIFE_DAYS if half_life_days is None else half_life_days
    if not _is_finite(effective_threshold) or effective_threshold < 0 or effective_threshold > 100:
        raise invalid_input("threshold", "Threshold outside 0..100.")
    if not _is_finite(effective_half_life) or effective_half_life <= 0:
        raise invalid_input("halfLifeDays", "A strictly positive half-life is required.")
    at_ms = parse_instant(at)

    dated: list[tuple[MasteryAnswer, int]] = []
    for index, raw in enumerate(answers):
        answer = _read_answer(raw, index)
        answered_at_ms = parse_instant(answer.answered_at)
        if answered_at_ms > at_ms:
            raise EngineError(
                "INVALID_INPUT",
                "An answer cannot be later than the evaluation instant.",
                f"answers.{index}.answeredAt",
            )
        dated.append((answer, answered_at_ms))
    # Sorting first makes the summation order canonical: a permutation returns the same doubles.
    dated.sort(key=lambda entry: (entry[0].answered_at, entry[0].answer_id, entry[0].attempt_id))

    weights: list[MasteryAnswerWeight] = []
    weight_sum = 0.0
    weighted_score = 0.0
    for answer, answered_at_ms in dated:
        age_days = (at_ms - answered_at_ms) / MS_PER_DAY
        weight = 0.5 ** (age_days / effective_half_life)
        weight_sum += weight
        weighted_score += weight * answer.score
        weights.append(
            MasteryAnswerWeight(
                answer_id=answer.answer_id,
                attempt_id=answer.attempt_id,
                score=answer.score,
                answered_at=answer.answered_at,
                age_days=age_days,
                weight=weight,
            )
        )
    mastery = 0.0 if weight_sum == 0 else (weighted_score / weight_sum) * 100
    return MasteryResult(
        mastery=mastery,
        threshold=float(effective_threshold),
        mastered=weight_sum > 0 and mastery >= effective_threshold,
        answer_count=len(dated),
        weight_sum=weight_sum,
        weighted_score=weighted_score,
        weights=tuple(weights),
    )
