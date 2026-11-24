"""Scoping chat use cases (SPEC-604 EF-1, EF-4 to EF-11; BR-FOR-01, BR-FOR-03, ADR-0162).

The learner message is committed in its own transaction, the model is called outside any
transaction, then the validated turn is committed in a second transaction: a failed tutor turn keeps
the answer and can be retried without losing it.
"""

from collections.abc import Mapping, Sequence
from typing import Any

from learny.formation.application.ports import FormationDeps
from learny.formation.application.tutor import (
    TutorProfile,
    cadrage_failed_detail,
    run_cadrage_turn,
)
from learny.formation.domain import cadrage as rules
from learny.formation.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.platform.llm.resolve import resolve_task_model
from learny.shared.db.uow import Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import (
    CADRAGE_ALREADY_COMPLETED,
    CADRAGE_COMPLETED,
    CADRAGE_INCOMPLETE,
    CADRAGE_NOTHING_TO_RETRY,
    CADRAGE_STALE_ANSWER,
    CADRAGE_UNANSWERED,
    FORMATION_NOT_CREATED,
    FORMATION_NOT_FOUND,
    PROFILE_NOT_FOUND,
)
from learny.shared.naming import formation_monogram, next_accent


async def _read_formation(tx: Tx, user_id: str, formation_id: str) -> queries.CadrageFormationRow:
    """CL-1 - the owner-scoped read; a foreign formation answers `NOT_FOUND`."""
    formation = await queries.read_cadrage_formation(tx, user_id, formation_id)
    if formation is None:
        raise AppError("NOT_FOUND", FORMATION_NOT_FOUND)
    return formation


async def get_cadrage_state(deps: FormationDeps, actor: Actor, formation_id: str) -> dict[str, Any]:
    """`GET /formations/:fid/cadrage/messages` (EF-1, ET-1)."""
    async with deps.db.user_tx(actor) as tx:
        formation = await _read_formation(tx, actor.user_id, formation_id)
        messages = await queries.read_cadrage_messages(tx, formation_id)
        return rules.build_state(formation, messages)


async def get_cadrage_page_state(deps: FormationDeps, actor: Actor, formation_id: str) -> dict[str, Any]:
    """Page-only view: the route redirects a formation that left the `cadrage` status (EF-1)."""
    async with deps.db.user_tx(actor) as tx:
        formation = await _read_formation(tx, actor.user_id, formation_id)
        messages = await queries.read_cadrage_messages(tx, formation_id)
        return {"state": rules.build_state(formation, messages), "status": formation.status}


async def list_formations(deps: FormationDeps, actor: Actor) -> dict[str, Any]:
    """`GET /formations`: the owner's formations, most recent first."""
    async with deps.db.user_tx(actor) as tx:
        rows = await queries.list_owned_formations(tx, actor.user_id)
        return {"items": [{"id": row["id"], "title": row["title"], "status": row["status"]} for row in rows]}


async def update_formation_title(
    deps: FormationDeps, actor: Actor, formation_id: str, body: Mapping[str, Any]
) -> dict[str, Any]:
    """`PATCH /formations/:fid` (EF-11, EF-13): the monogram follows the new title."""
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        formation = await _read_formation(tx, actor.user_id, formation_id)
        title = body.get("title")
        final_title = formation.title if title is None else str(title)
        updated = await queries.update_formation_title(
            tx,
            actor.user_id,
            formation_id,
            final_title,
            formation_monogram(final_title),
            now,
        )
        if updated is None:
            raise AppError("NOT_FOUND", FORMATION_NOT_FOUND)
        return {"id": updated["id"], "title": updated["title"], "status": updated["status"]}


async def create_formation(deps: FormationDeps, actor: Actor, body: Mapping[str, Any]) -> dict[str, Any]:
    """`POST /formations` (EF-4; BR-FOR-01, BR-FOR-03): the formation is committed before the tutor."""
    title = str(body["title"])
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        account = await queries.read_owner_account(tx, actor.user_id)
        if account is None:
            raise AppError("NOT_FOUND", PROFILE_NOT_FOUND)
        used = await queries.read_used_accents(tx, actor.user_id)
        created = await queries.insert_formation(
            tx,
            actor.user_id,
            title=title,
            course_language=str(account["course_language"]),
            monogram=formation_monogram(title),
            accent=next_accent(used),
            profile=rules.empty_profile(),
            now=now,
        )
        if created is None:
            raise AppError("INTERNAL_ERROR", FORMATION_NOT_CREATED)
        formation = created

    state = rules.build_state(formation, [])
    tutor = TutorProfile(
        tone=str(account["tone"]),
        course_language=str(account["course_language"]),
    )
    scenario = rules.cadrage_scenario(title, 0)
    try:
        # SPEC-709: the tutor runs only on the personal model chosen for the `tutor` task.
        async with deps.db.user_tx(actor) as tx:
            await resolve_task_model(tx, actor.user_id, "tutor")
        result = await run_cadrage_turn(
            deps.llm,
            tutor=tutor,
            state={
                "title": title,
                "profile": state["profile"],
                "history": [],
                "learnerMessage": "",
                "constraints": rules.ApplyConstraints(
                    questions_asked=0, finished=False, pending_question_key=None, learner_answer=""
                ),
            },
            scenario=scenario,
            formation_id=formation.id,
        )
    except AppError as error:
        return {
            "formation": rules.to_summary(formation),
            "cadrage": {**state, "error": {"code": error.code, "message": cadrage_failed_detail(error.code)}},
        }

    async with deps.db.user_tx(actor) as tx:
        current = await _read_formation(tx, actor.user_id, formation.id)
        await _persist_turn(tx, current, actor.user_id, result.applied, deps)
        updated = await _read_formation(tx, actor.user_id, formation.id)
        messages = await queries.read_cadrage_messages(tx, formation.id)
        final = rules.build_state(updated, messages, None)
        return {
            "formation": {"id": final["formationId"], "title": final["title"], "status": "cadrage"},
            "cadrage": final,
        }


async def _persist_turn(
    tx: Tx,
    formation: queries.CadrageFormationRow,
    user_id: str,
    applied: rules.AppliedTurn,
    deps: FormationDeps,
) -> None:
    """`persistTutorTurn`: one profile update and one tutor message, never anything else."""
    merged = list(dict.fromkeys([*formation.objectives, *applied.objectives]))
    objectives = merged if merged else formation.objectives
    await queries.update_cadrage_profile(tx, formation.id, applied.profile, objectives, deps.clock.now())
    position = await queries.next_message_position(tx, formation.id)
    await queries.insert_cadrage_message(
        tx,
        formation.id,
        user_id,
        role="tutor",
        content=applied.content,
        question_key=applied.questionKey,
        suggestions=None
        if applied.suggestions is None
        else rules.suggestions_json(
            [
                rules.Suggestion(
                    label=item["label"],
                    value=item["value"],
                    description=item.get("description"),
                )
                for item in applied.suggestions
            ],
            applied.multi,
        ),
        position=position,
        now=deps.clock.now(),
    )


def _pending(rows: Sequence[queries.CadrageMessageRow]) -> dict[str, Any] | None:
    """`pendingOf`: the question the learner is expected to answer."""
    last = rows[-1] if rows else None
    if last is None or last.role != "tutor" or last.question_key is None:
        return None
    suggestions = last.suggestions if isinstance(last.suggestions, list) else []
    values: set[str] = set()
    labels: dict[str, str] = {}
    multi = False
    for entry in suggestions:
        if not isinstance(entry, Mapping):
            continue
        value = entry.get("value")
        label = entry.get("label")
        if not isinstance(value, str) or not isinstance(label, str):
            continue
        values.add(value)
        labels[value] = label
        if entry.get("multi") is True:
            multi = True
    return {"key": last.question_key, "multi": multi, "values": values, "labels": labels}


def _compose_selections(selections: Sequence[str], pending: Mapping[str, Any] | None) -> str:
    """`composeSelections`: only a value of the pending question is accepted."""
    if pending is None:
        raise AppError("VALIDATION_FAILED", CADRAGE_STALE_ANSWER, status=400)
    selected: list[str] = []
    for value in selections:
        if value not in pending["values"]:
            raise AppError("VALIDATION_FAILED", CADRAGE_STALE_ANSWER, status=400)
        selected.append(pending["labels"].get(value, value))
    return ", ".join(selected)


def _count_learner(rows: Sequence[queries.CadrageMessageRow]) -> int:
    return sum(1 for row in rows if row.role == "learner")


def _count_questions(rows: Sequence[queries.CadrageMessageRow]) -> int:
    return min(
        sum(1 for row in rows if row.role == "tutor" and row.question_key is not None),
        rules.MAX_QUESTIONS,
    )


async def post_cadrage_message(
    deps: FormationDeps, actor: Actor, formation_id: str, body: Mapping[str, Any]
) -> dict[str, Any]:
    """`POST /formations/:fid/cadrage/messages` (EF-5 to EF-9; CL-1, CL-6, CL-7)."""
    if await _already_completed(deps, formation_id):
        raise AppError("CONFLICT", CADRAGE_COMPLETED, status=409)

    retry = body.get("retry") is True
    selections = body.get("selections")
    content = body.get("content")

    async with deps.db.user_tx(actor) as tx:
        formation = await _read_formation(tx, actor.user_id, formation_id)
        if formation.status != "cadrage":
            raise AppError("CONFLICT", CADRAGE_COMPLETED, status=409)
        rows = await queries.read_cadrage_messages(tx, formation_id)
        last = rows[-1] if rows else None
        pending = _pending(rows)
        profile = await queries.read_tutor_profile(tx, actor.user_id)

        if retry:
            if not rows:
                prepared = _prepared(formation, [], "", None, 0, False, profile, 0)
            else:
                if last is None or last.role != "learner":
                    raise AppError("CONFLICT", CADRAGE_NOTHING_TO_RETRY, status=409)
                before = rows[:-1]
                prepared = _prepared(
                    formation,
                    before,
                    last.content,
                    (_pending(before) or {}).get("key"),
                    _count_questions(before),
                    rules.build_state(formation, before, None)["finished"],
                    profile,
                    _count_learner(rows),
                )
        else:
            if last is not None and last.role == "learner":
                raise AppError("CONFLICT", CADRAGE_UNANSWERED, status=409)
            if selections is None:
                learner_content = str(content or "")
            else:
                learner_content = _compose_selections([str(item) for item in selections], pending)
            position = await queries.next_message_position(tx, formation_id)
            await queries.insert_learner_message(
                tx, formation_id, actor.user_id, learner_content, position, deps.clock.now()
            )
            prepared = _prepared(
                formation,
                rows,
                learner_content,
                (pending or {}).get("key"),
                _count_questions(rows),
                rules.build_state(formation, rows, None)["finished"],
                profile,
                _count_learner(rows) + 1,
            )

    # SPEC-709: the answer is committed; the tutor still needs the model chosen for its task.
    async with deps.db.user_tx(actor) as tx:
        await resolve_task_model(tx, actor.user_id, "tutor")
    tutor = TutorProfile(tone=str(prepared["tone"]), course_language=str(prepared["courseLanguage"]))
    scenario = rules.cadrage_scenario(prepared["title"], prepared["learnerAnswers"])
    result = await run_cadrage_turn(
        deps.llm,
        tutor=tutor,
        state={
            "title": prepared["title"],
            "profile": rules.read_profile(prepared["formation"].cadrage_profile),
            "history": prepared["history"],
            "learnerMessage": prepared["learnerContent"],
            "constraints": rules.ApplyConstraints(
                questions_asked=prepared["questionsAsked"],
                finished=prepared["finished"],
                pending_question_key=prepared["pendingKey"],
                learner_answer=prepared["learnerContent"],
            ),
        },
        scenario=scenario,
        formation_id=formation_id,
    )

    async with deps.db.user_tx(actor) as tx:
        current = await _read_formation(tx, actor.user_id, formation_id)
        if current.status != "cadrage":
            raise AppError("CONFLICT", CADRAGE_COMPLETED, status=409)
        await _persist_turn(tx, current, actor.user_id, result.applied, deps)
        updated = await _read_formation(tx, actor.user_id, formation_id)
        messages = await queries.read_cadrage_messages(tx, formation_id)
        return rules.build_state(updated, messages, None)


def _prepared(
    formation: queries.CadrageFormationRow,
    history_rows: Sequence[queries.CadrageMessageRow],
    learner_content: str,
    pending_key: str | None,
    questions_asked: int,
    finished: bool,
    profile: Mapping[str, Any],
    learner_answers: int,
) -> dict[str, Any]:
    """The read-only state of one turn, before the model is called."""
    return {
        "formation": formation,
        "title": formation.title,
        "tone": profile["tutor_tone"],
        "courseLanguage": profile["course_language"],
        "history": [{"role": row.role, "content": row.content} for row in history_rows],
        "learnerContent": learner_content,
        "pendingKey": pending_key,
        "questionsAsked": questions_asked,
        "finished": finished,
        "learnerAnswers": learner_answers,
    }


async def _already_completed(deps: FormationDeps, formation_id: str) -> bool:
    """`cadrageAlreadyCompleted`: the outbox metadata is read with the service role."""
    async with deps.db.service_tx() as tx:
        return await queries.cadrage_completed(tx, formation_id)


async def complete_cadrage(deps: FormationDeps, actor: Actor, formation_id: str) -> dict[str, Any]:
    """`POST /formations/:fid/cadrage/complete` (EF-10; CA-5, CA-6).

    The formation stays in `cadrage` until a programme is proposed; the conclusion is recorded by
    one deterministic outbox event, which freezes the profile and makes a second click a 409.
    """
    if await _already_completed(deps, formation_id):
        raise AppError("CONFLICT", CADRAGE_ALREADY_COMPLETED, status=409)
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        formation = await _read_formation(tx, actor.user_id, formation_id)
        if formation.status != "cadrage":
            raise AppError("CONFLICT", CADRAGE_COMPLETED, status=409)
        messages = await queries.read_cadrage_messages(tx, formation_id)
        state = rules.build_state(formation, messages, None)
        if not state["canGenerate"]:
            raise AppError("CADRAGE_INCOMPLETE", CADRAGE_INCOMPLETE, status=422)
        objectives = formation.objectives or ["operational"]
        await queries.complete_cadrage_profile(
            tx, actor.user_id, formation_id, state["profile"], objectives, now
        )
        await tx.emit(
            "formation/cadrage-completed",
            {"userId": actor.user_id, "formationId": formation_id},
            event_id=f"cadrage-completed:{formation_id}",
        )
    return {"formationId": formation_id}
