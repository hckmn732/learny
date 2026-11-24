"""Read model of a corrected validation attempt (SPEC-612 EF-1 to EF-5, ET-1, BR-QUI-05, BR-LAC-04).

Every value comes from the persisted attempt, the module, the learner's notion states and the retry
gate: the screen never recomputes a verdict. The gap cards, the mastered notions and the per-notion
detail reuse the domain helpers of the engine and the learning context instead of duplicating them.
"""

import json
import re
from collections.abc import Mapping, Sequence
from typing import Any

from learny.assessments.application.ports import AssessmentDeps
from learny.assessments.application.retry_gate import read_retry_gate
from learny.assessments.domain import quiz_score as score_domain
from learny.assessments.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.learning.application.gaps import training_target
from learny.learning.domain.params import ENGINE
from learny.shared.errors import AppError
from learny.shared.locale_fr import assessments as texts

UUID_KEY = re.compile(r"^[0-9a-fA-F-]{36}$")
"""`/^[0-9a-f-]{36}$/i`: a `per_notion` key is a notion identifier or it is dropped."""

MAX_HISTORY = 6
"""`history.slice(-6)`: the six last graded attempts of the module."""


def as_object(value: Any) -> dict[str, Any] | None:
    """`asObject`: a JSON object, parsed when the driver returns the raw text."""
    if value is None:
        return None
    if isinstance(value, str):
        try:
            parsed: Any = json.loads(value)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return None
        return dict(parsed) if isinstance(parsed, Mapping) else None
    return dict(value) if isinstance(value, Mapping) else None


def items_of(value: Any) -> list[dict[str, Any]]:
    """`itemsOf`: the activity items, ignoring anything that is not an object."""
    if not isinstance(value, list):
        return []
    return [dict(item) for item in value if isinstance(item, Mapping)]


def nature_label_of(nature: str) -> str:
    """`natureLabelOf`: the visible label of a gap nature."""
    return texts.GAP_NATURE_LABELS.get(nature, texts.RESULT_GAP_DEFAULT_LABEL)


def proposal_of(nature: str) -> str:
    """`proposalOf`: the code fallback of the tutor answer (BR-LAC-04, ET-6)."""
    proposal: str = texts.GAP_PROPOSALS.get(nature, texts.GAP_PROPOSALS["forgetting"])
    return proposal


def evidence_of(nature: str, persisted: Any) -> str:
    """`evidenceOf`: the persisted evidence, the documented sentence per nature otherwise."""
    text = persisted.strip() if isinstance(persisted, str) else ""
    if text != "":
        return text
    if nature == "confusion":
        return texts.RESULT_EVIDENCE_CONFUSION
    if nature == "misunderstanding":
        return texts.RESULT_EVIDENCE_MISUNDERSTANDING
    if nature == "application":
        return texts.RESULT_EVIDENCE_APPLICATION
    return texts.RESULT_EVIDENCE_FORGETTING


def per_notion_of(value: Any) -> dict[str, dict[str, Any]]:
    """`perNotionOf`: the stored per-notion detail, unknown keys and shapes dropped."""
    raw = as_object(value)
    if raw is None:
        return {}
    parsed: dict[str, dict[str, Any]] = {}
    for notion_id, entry in raw.items():
        if UUID_KEY.match(str(notion_id)) is None:
            continue
        detail = as_object(entry)
        if detail is None:
            continue
        parsed[str(notion_id)] = {
            "correct": detail["correct"] if isinstance(detail.get("correct"), int) else 0,
            "total": detail["total"] if isinstance(detail.get("total"), int) else 0,
            "score": detail["score"] if isinstance(detail.get("score"), int) else 0,
        }
    return parsed


def scored_of(
    answers: Sequence[Mapping[str, Any]], items: Sequence[Mapping[str, Any]]
) -> list[dict[str, Any]]:
    """`scoredOf`: only an answered question of the engine enters the pure score."""
    scored: list[dict[str, Any]] = []
    for answer in answers:
        if answer["is_correct"] is None:
            continue
        position = int(answer["position"])
        item = items[position - 1] if position - 1 < len(items) else None
        notion_id = item.get("notionId") if item is not None else None
        scored.append(
            {
                "position": position,
                "notionId": notion_id if isinstance(notion_id, str) else str(answer["brick_version_id"]),
                "score": 0.0 if answer["score"] is None else float(answer["score"]),
                "maxScore": 0.0 if answer["max_score"] is None else float(answer["max_score"]),
                "isCorrect": answer["is_correct"],
            }
        )
    return scored


def attempt_history(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """`attemptHistory`: the graded attempts carrying both a score and a verdict."""
    return [
        {
            "attemptNo": int(row["attempt_no"]),
            "score": float(row["score"]),
            "passed": row["passed"] is True,
        }
        for row in rows
        if row["score"] is not None and row["passed"] is not None
    ]


def remediation_status_of(row: Mapping[str, Any] | None) -> str:
    """`readRemediation`: the remediation state derived from the activity and its attempt."""
    if row is None:
        return "none"
    if row["preparing"] is True:
        return "preparing"
    attempt_status = row["attempt_status"]
    if attempt_status == "graded":
        return "completed"
    if attempt_status is None:
        return "preparing"
    return "in_progress" if int(row["checked"]) > 0 else "ready"


def mastery_of(row: Mapping[str, Any]) -> float:
    """The stored mastery of one notion, zero when the learner never saw it."""
    value = row["mastery"]
    return 0.0 if value is None or value == "" else float(value)


async def get_quiz_result(deps: AssessmentDeps, actor: Actor, attempt_id: str) -> dict[str, Any]:
    """ET-1 - the read model of SCR-09 after the correction of one attempt."""
    user_id = actor.user_id
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        attempt = await queries.read_result_attempt(tx, user_id, attempt_id)
        if attempt is None:
            raise AppError("NOT_FOUND", texts.QUIZ_ATTEMPT_NOT_FOUND)
        module_id = str(attempt["module_id"])
        formation_id = str(attempt["formation_id"])
        items = items_of(attempt["items"])
        answers = await queries.read_result_answers(tx, attempt_id)
        notions = await queries.read_result_notions(tx, user_id, module_id)
        history = attempt_history(await queries.read_result_history(tx, user_id, module_id))
        next_module = await queries.read_result_next_module(tx, formation_id, int(attempt["position"]))
        scored = scored_of(answers, items)
        provisional = score_domain.compute_score(scored)["score"]
        graded = attempt["status"] == "graded"
        score = None if attempt["score"] is None else float(attempt["score"])
        passed = (attempt["passed"] is True) if graded else None
        pending_open = sum(1 for answer in answers if answer["is_correct"] is None)
        gate = await read_retry_gate(tx, user_id, module_id, now)
        open_gaps = [notion for notion in notions if notion["gap_nature"] is not None]
        ordered_gaps = sorted(open_gaps, key=mastery_of)
        shown = ordered_gaps if passed is True else ordered_gaps[: texts.REMEDIATION_MAX_GAPS]
        gaps = [
            {
                "notionId": str(notion["id"]),
                "label": str(notion["label"]),
                "nature": str(notion["gap_nature"]),
                "natureLabel": nature_label_of(str(notion["gap_nature"])),
                "evidence": evidence_of(str(notion["gap_nature"]), notion["gap_evidence"]),
                "proposal": proposal_of(str(notion["gap_nature"])),
                "mastery": mastery_of(notion),
                "trainHref": training_target(
                    formation_id=formation_id,
                    module_id=module_id,
                    notion_id=str(notion["id"]),
                    nature=str(notion["gap_nature"]),
                )["href"],
            }
            for notion in shown
        ]
        threshold = float(ENGINE["mastery"]["threshold"])
        mastered = [
            {"notionId": str(notion["id"]), "label": str(notion["label"])}
            for notion in notions
            if mastery_of(notion) >= threshold and notion["gap_nature"] is None
        ]
        per_notion = per_notion_of(attempt["per_notion"])
        latest_failed = None
        if passed is False:
            latest_failed = attempt_id
        else:
            latest_failed = await queries.read_result_latest_failed(tx, user_id, module_id)
        remediation_row = (
            None
            if latest_failed is None
            else await queries.read_result_remediation(tx, user_id, module_id, latest_failed)
        )
        remediation_status = remediation_status_of(remediation_row)
        remediation_href = (
            None
            if remediation_status == "none"
            else f"/formations/{formation_id}/modules/{module_id}/remediation"
        )
        labels = {str(notion["id"]): str(notion["label"]) for notion in notions}
        points_missing = (
            score_domain.points_missing(score, float(attempt["threshold"]))
            if passed is False and score is not None
            else None
        )
        config = attempt.get("config")
        acquired = (
            [str(value) for value in config.get("acquiredModuleIds") or []]
            if isinstance(config, Mapping) and isinstance(config.get("acquiredModuleIds"), list)
            else []
        )
        return {
            "attemptId": attempt_id,
            "attemptNo": int(attempt["attempt_no"]),
            "acquiredModuleIds": acquired,
            "module": {
                "id": module_id,
                "position": int(attempt["position"]),
                "title": str(attempt["module_title"]),
            },
            "status": str(attempt["status"]),
            "score": score if graded else None,
            "provisionalScore": score if graded else provisional,
            "threshold": int(attempt["threshold"]),
            "passed": passed,
            "pointsMissing": points_missing,
            "isLastModule": next_module is None,
            "nextModule": None
            if next_module is None
            else {
                "id": str(next_module["id"]),
                "position": int(next_module["position"]),
                "title": str(next_module["title"]),
            },
            "history": history[-MAX_HISTORY:],
            "gaps": gaps,
            "mastered": mastered,
            "perNotion": [
                {
                    "notionId": notion_id,
                    "label": labels.get(notion_id, texts.RESULT_DEFAULT_NOTION_LABEL),
                    "correct": value["correct"],
                    "total": value["total"],
                    "score": value["score"],
                }
                for notion_id, value in per_notion.items()
            ],
            "retry": gate,
            "remediation": {"status": remediation_status, "href": remediation_href},
            "pendingOpenCount": pending_open,
        }


__all__ = [
    "MAX_HISTORY",
    "attempt_history",
    "evidence_of",
    "get_quiz_result",
    "nature_label_of",
    "per_notion_of",
    "proposal_of",
    "remediation_status_of",
    "scored_of",
]
