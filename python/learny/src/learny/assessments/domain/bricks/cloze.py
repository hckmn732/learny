"""Code grading of a cloze (SPEC-502 ET-3, BR-MEM-05).

Every gap is compared through `normalize_text` against the accepted variants; no spelling tolerance
beyond that (CL-3, CL-4).
"""

from collections.abc import Mapping
from typing import Any

from learny.assessments.domain.bricks.grade_support import invalid_response, outcome, round4
from learny.assessments.domain.bricks.normalize import normalize_text
from learny.assessments.domain.bricks.responses import read_object, read_record


def parse_cloze_response(payload: Mapping[str, Any], response: Any) -> dict[str, Any]:
    """Validates a cloze response against the payload; raises `BrickGradeError` otherwise."""
    parsed = read_object(response, ("gaps",))
    gaps = read_record(parsed["gaps"], "response.gaps", value_max_length=120, nullable=False)
    expected = {str(gap["id"]) for gap in payload["gaps"]}
    given = set(gaps)
    issues: list[dict[str, str]] = []
    for gap_id in expected:
        if gap_id not in given:
            issues.append({"path": f"response.gaps.{gap_id}", "message": f'Missing gap "{gap_id}".'})
    for gap_id in given:
        if gap_id not in expected:
            issues.append({"path": f"response.gaps.{gap_id}", "message": f'Unknown gap "{gap_id}".'})
    if issues:
        raise invalid_response(issues)
    return {"gaps": gaps}


def grade_cloze(payload: Mapping[str, Any], response: Any) -> dict[str, Any]:
    """Grades one cloze response; raises `BrickGradeError` on an invalid response."""
    parsed = parse_cloze_response(payload, response)
    gaps = sorted(payload["gaps"], key=lambda gap: int(gap["id"]))
    results: list[dict[str, Any]] = []
    for gap in gaps:
        given = parsed["gaps"].get(str(gap["id"])) or ""
        accepted = {normalize_text(str(answer)) for answer in gap["answers"]}
        answers = gap["answers"]
        results.append(
            {
                "gap": gap,
                "given": given,
                "expected": str(answers[0]) if answers else "",
                "correct": normalize_text(given) in accepted,
            }
        )
    correct_count = sum(1 for result in results if result["correct"])
    return outcome(
        is_correct=correct_count == len(gaps),
        score=round4(correct_count / len(gaps)),
        chosen_distractor_notion_id=None,
        confusions=[],
        normalized_response="|".join(normalize_text(result["given"]) for result in results),
        correction={
            "kind": "cloze",
            "explanation": payload["explanation"],
            "gaps": [
                {
                    "id": result["gap"]["id"],
                    "given": result["given"],
                    "expected": result["expected"],
                    "correct": result["correct"],
                }
                for result in results
            ],
        },
    )


__all__ = ["grade_cloze", "parse_cloze_response"]
