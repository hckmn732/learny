"""Questions turned into recall cards (SPEC-717, BR-AUT-06, ADR-0190, ADR-0193).

The one-line explanation of the six statuses, the pure decision of a source, the `recall_card` brick
and the notion entering review (SPEC-501, ADR-0193 section 2), and the undo that retires the brick
instead of deleting it. The insertion itself is an effect specification the use case executes.
"""

from typing import Any, Final
from uuid import UUID

from learny.assessments.domain.bricks.fingerprint import brick_fingerprint
from learny.assessments.domain.bricks.validate import parse_brick_payload
from learny.engagement.domain.automations.definitions.labels import clip, string_of
from learny.engagement.domain.automations.effects import (
    EnsureNotionInReview,
    InsertRecallCard,
    RetireBrick,
)
from learny.engagement.domain.automations.model import (
    ActionView,
    AppliedEffect,
    AutomationDefinition,
    DraftError,
    EffectContext,
)
from learny.learning.application.apply_result import to_persistence_card
from learny.learning.domain.fsrs import create_notion_card
from learny.learning.domain.params import ENGINE
from learny.shared.locale_fr import engagement_automations as fr
from learny.shared.time import (
    add_civil_days,
    from_epoch_ms,
    start_of_user_day,
    to_epoch_ms,
    to_iso,
    user_local_day,
)

FRONT_MAX: Final = 300
BACK_MAX: Final = 600
SOURCE_MAX: Final = 120
NOTION_MAX: Final = 60
REVIEW_DUE_DAYS: Final = 2


def clip_field(value: str, maximum: int) -> str:
    """`clip(value, max)`: collapsed spaces, then the ellipsis of the one-line contract."""
    clean = " ".join(value.split())
    if len(clean) <= maximum:
        return clean
    return f"{clean[: maximum - 1].rstrip()}{fr.SUMMARY_ELLIPSIS}"


def question_card_dedupe_key(conversation_id: str, notion_id: str) -> str:
    """ET-4 - stable key of the pair (conversation, notion)."""
    return f"question_card:{conversation_id}:{notion_id}"


def _is_uuid(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        UUID(value)
    except ValueError:
        return False
    return True


def question_card_skip_reason(
    *,
    question: str | None,
    answer: str | None,
    notion_id: str | None,
    notion_exists: bool,
    reported: bool,
) -> str | None:
    """CL-3 - the pure decision of a source, in the documented order."""
    if not _is_uuid(notion_id):
        return "missing_notion"
    if not isinstance(question, str) or len(question.strip()) < 3:
        return "missing_question"
    if not isinstance(answer, str) or answer.strip() == "":
        return "missing_answer"
    if not notion_exists:
        return "unknown_notion"
    if reported:
        return "reported_source"
    return None


def explain(action: ActionView) -> str:
    """EF-2 - one line for every status of the journal; same text in `vous` and `tu`."""
    notion = clip_field(
        string_of(action.payload.get("notionLabel"), fr.QUESTION_CARD_DEFAULT_NOTION), NOTION_MAX
    )
    key = action.status if action.status in fr.QUESTION_CARD else "pending"
    return clip(fr.QUESTION_CARD[key].format(notion=notion))


def _persistence_fsrs(now: Any) -> dict[str, Any]:
    card = create_notion_card(to_iso(now), float(ENGINE["fsrs"]["requestRetention"]))
    return to_persistence_card(card)


def apply(ctx: EffectContext, action: ActionView) -> AppliedEffect:
    """Create exactly one `recall_card` brick and let its notion enter review."""
    payload = dict(action.payload)
    existing = string_of(payload.get("brickId"))
    if existing != "":
        return AppliedEffect(changes={"payload": payload, "undo_payload": {"brickId": existing}})
    formation_id = string_of(action.formation_id)
    notion_id = string_of(payload.get("notionId"))
    question = string_of(payload.get("question"))
    answer = string_of(payload.get("answer"))
    if formation_id == "" or notion_id == "" or question == "" or answer == "":
        raise DraftError("VALIDATION_FAILED", fr.GAME_INCOMPLETE)
    card = parse_brick_payload(
        "recall_card",
        {
            "front": clip_field(question, FRONT_MAX),
            "back": clip_field(answer, BACK_MAX),
            "sourceLabel": clip_field(
                string_of(payload.get("sourceLabel"), fr.QUESTION_CARD_DEFAULT_SOURCE), SOURCE_MAX
            ),
            "sources": [],
        },
    )
    due_day = add_civil_days(user_local_day(to_epoch_ms(ctx.now), ctx.time_zone), REVIEW_DUE_DAYS)
    due_at = to_iso(from_epoch_ms(start_of_user_day(due_day, ctx.time_zone)))
    return AppliedEffect(
        changes={
            "payload": {**payload, "brickId": None},
            "undo_payload": {"notionId": notion_id},
        },
        effects=(
            InsertRecallCard(
                formation_id=formation_id,
                notion_id=notion_id,
                front=str(card["front"]),
                back=str(card["back"]),
                source_label=str(card["sourceLabel"]),
                fingerprint=brick_fingerprint(
                    "recall_card",
                    {
                        "front": str(card["front"]),
                        "back": str(card["back"]),
                        "sourceLabel": str(card["sourceLabel"]),
                        "sources": [],
                    },
                ),
                assign_payload="brickId",
                assign_undo="brickId",
            ),
            EnsureNotionInReview(notion_id=notion_id, due_at=due_at, fsrs=_persistence_fsrs(ctx.now)),
        ),
    )


def undo(ctx: EffectContext, action: ActionView) -> AppliedEffect:
    """Retire the brick from the future draws; past answers stay untouched."""
    undo_payload = dict(action.undo_payload or {})
    payload = dict(action.payload)
    brick_id = string_of(undo_payload.get("brickId"), string_of(payload.get("brickId")))
    if brick_id == "" or not _is_uuid(brick_id):
        return AppliedEffect()
    return AppliedEffect(effects=(RetireBrick(brick_id=brick_id),))


DEFINITION = AutomationDefinition(
    key="questions_cartes",
    triggers=({"type": "event", "name": "tutor/question-asked"},),
    explain=lambda action, _tone, _zone: explain(action),
    apply=apply,
    undo=undo,
)


__all__ = [
    "DEFINITION",
    "explain",
    "question_card_dedupe_key",
    "question_card_skip_reason",
]
