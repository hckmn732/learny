"""Consumer registry of the Python worker (SPEC-2102 step 2, SPEC-2207, ADR-2006, ADR-2014).

A consumer is one async function subscribed to one event name, declared by the table of the P22 plan
(SPEC-2207). Every consumer delegates to the use case of its context, imported from the `public.py`
of that context: the worker holds no business rule and no SQL.

A payload the consumer cannot handle is refused at dispatch time by `validate`, so the delivery is
`failed` at once, without a retry (CL-1).
"""

import re
import uuid
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from learny.assessments import public as assessments
from learny.content import public as content
from learny.engagement import public as engagement
from learny.formation import public as formation
from learny.identity import public as identity
from learny.identity.domain.actor import Actor
from learny.learning import public as learning
from learny.privacy import public as privacy
from learny.shared.clock import Clock
from learny.shared.devtools import run_demo_pipeline
from learny.shared.locale_fr import content as content_texts
from learny.shared.locale_fr import simple as simple_texts
from learny.shared.outbox.errors import PermanentJobError
from learny.shared.outbox.events import Event
from learny.shared.outbox.purge import purge_outbox
from learny.shared.time import parse_iso
from learny.tutor import public as tutor

DEMO_EVENT = "sdd/demo-requested"
DEMO_CONSUMER = "devtools.demo_job"
FAIL_ONCE_VALUES = ("none", "step-2")

# SPEC-2207 - the internal event of the daily digest (ADR-2014): the planning half of the job emits
# one per due learner instead of sleeping inside one function.
DAILY_DIGEST_EVENT = "job/daily-digest"

# Options of the table of the P22 plan.
QUESTION_BANK_NIGHTLY_LIMIT = 50
DEFERRED_DUE_BATCH = 100
REMINDER_JOB_BATCH = 200
EXAM_DEADLINE_GRACE_SECONDS = 5
LONG_JOB_TIMEOUT_S = 900
INGESTION_TIMEOUT_S = 600
# SPEC-4001 - the two modules generated before the queued ones.
SIMPLE_ANALYSIS_TIMEOUT_S = 1_800
GENERATION_TIMEOUT_S = 600
COURSE_GENERATION_TIMEOUT_S = 1800
# Hotfix QA: the bank of a just generated course is produced in the same run (`timeouts.finish`).
QUESTION_BANK_PREPARE_TIMEOUT_S = 1800
GRADING_TIMEOUT_S = 300
NIGHTLY_DELETION_TIMEOUT_S = 900
HOURLY_NOTIFICATION_ATTEMPTS = 2
# `generate-course` declares `retries: 3`: the first attempt and three retries (P22 plan).
COURSE_GENERATION_ATTEMPTS = 4

# Kinds of the payload fields the consumers read (`api/events.schema.json`).
UUID = "uuid"
INSTANT = "instant"
DATE = "date"
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TEXT = "text"
NUMBER = "number"
BOOLEAN = "boolean"
OBJECT = "object"

RunConsumer = Callable[[Any, Event], Awaitable[None]]
RunAt = Callable[[Event, Clock], datetime | None]
Validate = Callable[[Event], None]


@dataclass(frozen=True, slots=True)
class Consumer:
    """One consumer of one event; `max_attempts` counts the first attempt."""

    name: str
    on: str
    run: RunConsumer
    timeout_s: int = 300
    max_attempts: int = 4
    run_at: RunAt | None = None
    validate: Validate | None = None
    tags: dict[str, str] = field(default_factory=dict)
    # Called once when the delivery fails for good (last attempt or permanent error).
    on_final_failure: RunConsumer | None = None

    def run_after(self, event: Event, clock: Clock) -> datetime | None:
        """Delayed first execution; None means right now."""
        if self.run_at is None:
            return None
        return self.run_at(event, clock)

    def check(self, event: Event) -> None:
        """Refuses a payload this consumer cannot handle, without retrying it."""
        if self.validate is not None:
            self.validate(event)


def _is_uuid(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        uuid.UUID(value)
    except (ValueError, AttributeError, TypeError):
        return False
    return True


def _is_instant(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        parse_iso(value)
    except ValueError:
        return False
    return True


def _check_field(data: Mapping[str, Any], name: str, kind: str) -> None:
    """Refuses a payload the event contract would have refused (CL-1)."""
    value = data.get(name)
    if kind == UUID:
        valid = _is_uuid(value)
    elif kind == INSTANT:
        valid = _is_instant(value)
    elif kind == DATE:
        valid = isinstance(value, str) and DATE_PATTERN.fullmatch(value) is not None
    elif kind == TEXT:
        valid = isinstance(value, str) and value != ""
    elif kind == NUMBER:
        valid = isinstance(value, (int, float)) and not isinstance(value, bool)
    elif kind == BOOLEAN:
        valid = isinstance(value, bool)
    elif kind == OBJECT:
        valid = isinstance(value, Mapping)
    else:  # pragma: no cover - a programming error, never an event
        raise RuntimeError(f"unknown payload field kind: {kind}")
    if not valid:
        raise PermanentJobError("VALIDATION_FAILED", f"{name} must be a {kind}")


def payload_validator(**fields: str) -> Validate:
    """Builds the `validate` of a consumer from the fields it reads."""

    def validate(event: Event) -> None:
        for name, kind in fields.items():
            _check_field(event.data, name, kind)

    return validate


def _text_of(data: Mapping[str, Any], name: str) -> str:
    _check_field(data, name, TEXT)
    return str(data[name])


def _instant_of(data: Mapping[str, Any], name: str) -> datetime:
    _check_field(data, name, INSTANT)
    return parse_iso(str(data[name]))


def _number_of(data: Mapping[str, Any], name: str) -> float:
    _check_field(data, name, NUMBER)
    return float(data[name])


def _boolean_of(data: Mapping[str, Any], name: str) -> bool:
    _check_field(data, name, BOOLEAN)
    return bool(data[name])


# Backoff 10 s, 20 s, ... 1280 s between the nine attempts of an ingestion: ~42 minutes in all.
INGESTION_MAX_ATTEMPTS = 9


def _job_actor(user_id: str) -> Actor:
    """The actor a job carries: the identifier only."""
    return Actor(user_id=user_id, email="", email_confirmed=True, transport="bearer")


# --- Cron consumers of `cron/nightly` -------------------------------------------------------------


async def privacy_run_account_deletions(deps: Any, event: Event) -> None:
    """`account-deletion`: every due deletion, fifty per run, resumable step by step."""
    await privacy.run_account_deletions(deps)


async def privacy_purge_exports(deps: Any, event: Event) -> None:
    """`exports-purge`: expired export archives, its own task so a deletion never blocks it."""
    await privacy.purge_exports(deps)


async def shared_purge_outbox(deps: Any, event: Event) -> None:
    """`nightly-outbox-cleanup`: delivered outbox rows older than seven days."""
    await purge_outbox(deps)


async def assessments_purge_offline_receipts(deps: Any, event: Event) -> None:
    """`offline-receipts-purge`: synchronisation receipts older than thirty days."""
    await assessments.purge_offline_receipts(deps)


async def tutor_process_question_bank_jobs(deps: Any, event: Event) -> None:
    """`question-bank-nightly`: drains the queue, fifty rows at most (P22 plan)."""
    await tutor.process_question_bank_jobs(deps, limit=QUESTION_BANK_NIGHTLY_LIMIT)


# --- Cron consumers of `cron/hourly-tick` ---------------------------------------------------------


async def identity_purge_security_rows(deps: Any, event: Event) -> None:
    """`security-purge`: idempotency keys and rate-limit buckets older than a day."""
    await identity.purge_security_rows(deps)


async def content_fail_stale_resources(deps: Any, event: Event) -> None:
    """`stale-resources`: documents stuck in analysis with no job left end in `failed`."""
    await content.fail_stale_resources(deps)


async def engagement_plan_daily_digests(deps: Any, event: Event) -> None:
    """`notifications-daily-digest`: plans the due digests and emits `job/daily-digest` for each."""
    tick = _instant_of(event.data, "tickAt")
    plans = await engagement.plan_daily_digests(deps, tick)
    if not plans:
        return
    async with deps.db.service_tx() as tx:
        for plan in plans:
            user_id = str(plan["userId"])
            at = str(plan["at"])
            await tx.emit(
                DAILY_DIGEST_EVENT,
                {"userId": user_id, "at": at},
                event_id=daily_digest_event_id(user_id, at),
            )


async def engagement_deliver_due_deliveries(deps: Any, event: Event) -> None:
    """`notifications-deferred-due`: re-evaluates the deliveries whose instant is reached."""
    await engagement.deliver_due_deliveries(deps, limit=DEFERRED_DUE_BATCH)


async def engagement_sync_validation_quiz_reminders(deps: Any, event: Event) -> None:
    """`notifications-reminders`: the reminders of the next hour, two hundred slots at most."""
    await engagement.sync_validation_quiz_reminders(deps, {"batchSize": REMINDER_JOB_BATCH})


# --- Business consumers ---------------------------------------------------------------------------


async def privacy_run_data_export(deps: Any, event: Event) -> None:
    """`data-export`: the five resumable steps of one export, idempotent on `exportId`."""
    await privacy.run_data_export(
        deps,
        _text_of(event.data, "userId"),
        _text_of(event.data, "exportId"),
    )


async def engagement_send_welcome_email(deps: Any, event: Event) -> None:
    """`email-welcome`: sent once after `user/signed-up`, outside the cap and quiet hours."""
    await engagement.send_welcome_email(deps, _text_of(event.data, "userId"))


async def engagement_deliver_notification(deps: Any, event: Event) -> None:
    """`notification-delivery`: one committed delivery, idempotent on the delivery identifier."""
    payload = event.data.get("data")
    await engagement.deliver_notification(
        deps,
        _text_of(event.data, "deliveryId"),
        data=payload if isinstance(payload, Mapping) else None,
    )


async def engagement_send_daily_digest(deps: Any, event: Event) -> None:
    """`job/daily-digest`: the sending half, at the instant `run_at` scheduled (ADR-2014)."""
    await engagement.send_daily_digest_at(
        deps,
        user_id=_text_of(event.data, "userId"),
        at=_instant_of(event.data, "at"),
    )


async def content_resource_given_up(deps: Any, event: Event) -> None:
    """The last attempt failed: the document is marked failed so the learner can retry."""
    await content.fail_after_last_attempt(
        deps,
        _text_of(event.data, "resourceId"),
        "EMBEDDING_UNAVAILABLE",
        content_texts.RESOURCE_GIVEN_UP,
    )


async def content_process_resource(deps: Any, event: Event) -> None:
    """`ingest-resource`: the extraction pipeline of one uploaded contribution."""
    await content.process_resource(deps, _text_of(event.data, "resourceId"))


def validate_course_generation_event(event: Event) -> None:
    """`chapter/contributions-completed` is `{userId, moduleId, chapterId | null, force}`."""
    _check_field(event.data, "userId", UUID)
    _check_field(event.data, "moduleId", UUID)
    chapter_id = event.data.get("chapterId")
    if chapter_id is not None and not _is_uuid(chapter_id):
        raise PermanentJobError("VALIDATION_FAILED", "chapterId must be a uuid or null")
    _check_field(event.data, "force", BOOLEAN)


async def tutor_generate_course(deps: Any, event: Event) -> None:
    """`generate-course`: the whole course of one module, guarded by the generation key."""
    await tutor.generate_course(
        deps,
        _text_of(event.data, "userId"),
        _text_of(event.data, "moduleId"),
        event.event_id,
    )


async def tutor_prepare_question_bank(deps: Any, event: Event) -> None:
    """`prepare-question-bank`: one bank job per notion and format of the generated course.

    Hotfix QA: the validation quiz needs its bank right after the course, not after the nightly
    batch; the queued jobs of the learner are generated now (the nightly run stays the fallback).
    """
    user_id = _text_of(event.data, "userId")
    await tutor.prepare_question_bank(
        deps,
        user_id,
        _text_of(event.data, "courseId"),
        _text_of(event.data, "moduleId"),
    )
    await tutor.process_question_bank_jobs(deps, limit=QUESTION_BANK_NIGHTLY_LIMIT, user_id=user_id)


async def learning_plan_programme(deps: Any, event: Event) -> None:
    """`plan-programme`: the initial planning of a validated programme."""
    await learning.plan_programme(
        deps,
        _text_of(event.data, "userId"),
        _text_of(event.data, "formationId"),
    )


async def assessments_grade_quiz(deps: Any, event: Event) -> None:
    """`quiz-grade`: the durable correction of one submitted validation attempt."""
    await assessments.grade_quiz(
        deps,
        _text_of(event.data, "userId"),
        _text_of(event.data, "attemptId"),
    )


async def assessments_submit_exam_at_deadline(deps: Any, event: Event) -> None:
    """`exam-deadline`: the automatic submission at the deadline (scheduled by `run_at`)."""
    await assessments.submit_exam_at_deadline(
        deps,
        _text_of(event.data, "userId"),
        _text_of(event.data, "attemptId"),
    )


async def formation_simple_analysis(deps: Any, event: Event) -> None:
    """`simple.analysis.requested`: the four steps of the document analysis (SPEC-4001 EF-7).

    SPEC-4002 EF-4 - once the programme is proposed, the in-app "programme ready"
    notification is created, on the `course_ready` type with an explicit title and body: it is the same
    inbox, the same read state and the same dedupe, and no external channel is triggered.
    """
    user_id = _text_of(event.data, "userId")
    formation_id = _text_of(event.data, "formationId")
    outcome = await formation.run_analysis(deps, user_id, formation_id)
    if str(outcome.get("status") or "") != "proposed":
        return
    await engagement.notify_programme_ready(
        deps,
        user_id=user_id,
        formation_id=formation_id,
        title=simple_texts.PROGRAMME_READY_NOTIFICATION_TITLE,
        body=simple_texts.PROGRAMME_READY_NOTIFICATION_BODY,
        href=f"/formations/{formation_id}/apercu",
    )


async def formation_simple_generation(deps: Any, event: Event) -> None:
    """`simple.generation.requested`: every module queued in order (SPEC-4001 EF-9, EF-12).

    Each module is enqueued with the ordinary `chapter/contributions-completed` event, so the same
    course job and the same idempotence guard produce them, one job per module.
    """
    user_id = _text_of(event.data, "userId")
    formation_id = _text_of(event.data, "formationId")
    modules = await formation.list_generation_modules(deps, formation_id)
    # Every module gets its course, the ones the diagnostic validated included (they stay readable
    # for revision). Each course is its own job, in module order: generating two of them inline made
    # this job exceed its timeout on a large document and start over forever (QA 2026-11-26).
    pending = [module for module in modules if module.get("course_status") is None]
    for module in pending:
        module_id = str(module["id"])
        async with deps.db.service_tx() as tx:
            await tx.emit(
                "chapter/contributions-completed",
                {
                    "userId": user_id,
                    "moduleId": module_id,
                    "chapterId": None,
                    "force": True,
                },
                event_id=f"simple-course:{module_id}",
            )


async def formation_unlock_module(deps: Any, event: Event) -> None:
    """`module-unlock`: unlocks the next module of a passed validation quiz."""
    await formation.unlock_module(
        deps,
        _text_of(event.data, "userId"),
        _text_of(event.data, "formationId"),
        _text_of(event.data, "moduleId"),
        _number_of(event.data, "score"),
        _boolean_of(event.data, "passed"),
        attempt_id=_text_of(event.data, "attemptId"),
    )


async def tutor_prepare_remediation(deps: Any, event: Event) -> None:
    """`remediation-prepare`: the automatic remediation, skipped when the quiz was passed."""
    if _boolean_of(event.data, "passed"):
        deps.logger.info(
            "remediation preparation skipped",
            outcome="quiz_passed",
            **event.logging_fields(),
        )
        return
    await assessments.prepare_remediation(
        deps,
        _job_actor(_text_of(event.data, "userId")),
        _text_of(event.data, "moduleId"),
        trigger="auto",
    )


async def tutor_prepare_requested_remediation(deps: Any, event: Event) -> None:
    """`remediation-prepare-requested`: the remediation the learner asked for."""
    await assessments.prepare_remediation(
        deps,
        _job_actor(_text_of(event.data, "userId")),
        _text_of(event.data, "moduleId"),
        trigger="manual",
    )


# --- Demonstration consumer of SPEC-2102 ----------------------------------------------------------


def validate_demo_event(event: Event) -> None:
    """The demonstration payload is `{runId: uuid, failOnceAt: 'none' | 'step-2'}`."""
    run_id = event.data.get("runId")
    if not isinstance(run_id, str) or len(run_id) != 36:
        raise PermanentJobError("VALIDATION_FAILED", "runId must be a uuid")
    if event.data.get("failOnceAt") not in FAIL_ONCE_VALUES:
        raise PermanentJobError("VALIDATION_FAILED", "failOnceAt must be 'none' or 'step-2'")


async def demo_job(deps: Any, event: Event) -> None:
    """Demonstration consumer: records the three steps of the pipeline in `sdd_demo_runs`.

    The delivery row marks one execution per (event, consumer), and a finished run is left
    untouched, so a replay has no effect (ET-1).
    """
    run_id = str(event.data["runId"])
    run = await run_demo_pipeline(deps, run_id, str(event.data["failOnceAt"]))
    deps.logger.info(
        "demo job consumed",
        job=DEMO_CONSUMER,
        runId=run_id,
        attempts=run.attempts,
        skipped=run.skipped,
        **event.logging_fields(),
    )


# --- Delays that replace `step.sleepUntil` --------------------------------------------------------


def daily_digest_event_id(user_id: str, at: str) -> str:
    """One digest per learner and instant: a replayed plan emits the same identifier."""
    return f"daily-digest:{user_id}:{at}"


def daily_digest_run_at(event: Event, clock: Clock) -> datetime | None:
    """`run_at = data.at`: the digest waits for its instant instead of sleeping in the planner."""
    del clock
    try:
        return _instant_of(event.data, "at")
    except PermanentJobError:
        return None


def exam_deadline_run_at(event: Event, clock: Clock) -> datetime | None:
    """`run_at = deadlineAt + 5 s` (SPEC-614), never in the past (a late start runs at once)."""
    try:
        deadline = _instant_of(event.data, "deadlineAt")
    except PermanentJobError:
        return None
    due = deadline + timedelta(seconds=EXAM_DEADLINE_GRACE_SECONDS)
    return due if due > clock.now() else None


CONSUMERS: tuple[Consumer, ...] = (
    # --- cron/nightly: one consumer per nightly treatment, so one failure blocks nothing else ---
    Consumer(
        name="privacy.run_account_deletions",
        on="cron/nightly",
        run=privacy_run_account_deletions,
        timeout_s=NIGHTLY_DELETION_TIMEOUT_S,
        validate=payload_validator(runDate=DATE),
        tags={"context": "privacy"},
    ),
    Consumer(
        name="privacy.purge_exports",
        on="cron/nightly",
        run=privacy_purge_exports,
        validate=payload_validator(runDate=DATE),
        tags={"context": "privacy"},
    ),
    Consumer(
        name="shared.purge_outbox",
        on="cron/nightly",
        run=shared_purge_outbox,
        validate=payload_validator(runDate=DATE),
        tags={"context": "shared"},
    ),
    Consumer(
        name="assessments.purge_offline_receipts",
        on="cron/nightly",
        run=assessments_purge_offline_receipts,
        validate=payload_validator(runDate=DATE),
        tags={"context": "assessments"},
    ),
    Consumer(
        name="tutor.process_question_bank_jobs",
        on="cron/nightly",
        run=tutor_process_question_bank_jobs,
        timeout_s=LONG_JOB_TIMEOUT_S,
        validate=payload_validator(runDate=DATE),
        tags={"context": "tutor"},
    ),
    # --- cron/hourly-tick: the three notification producers and the security purge -----------------
    Consumer(
        name="identity.purge_security_rows",
        on="cron/hourly-tick",
        run=identity_purge_security_rows,
        validate=payload_validator(tickAt=INSTANT),
        tags={"context": "identity"},
    ),
    Consumer(
        name="content.fail_stale_resources",
        on="cron/hourly-tick",
        run=content_fail_stale_resources,
        validate=payload_validator(tickAt=INSTANT),
        tags={"context": "content"},
    ),
    Consumer(
        name="engagement.plan_daily_digests",
        on="cron/hourly-tick",
        run=engagement_plan_daily_digests,
        validate=payload_validator(tickAt=INSTANT),
        tags={"context": "engagement"},
    ),
    Consumer(
        name="engagement.deliver_due_deliveries",
        on="cron/hourly-tick",
        run=engagement_deliver_due_deliveries,
        max_attempts=HOURLY_NOTIFICATION_ATTEMPTS,
        validate=payload_validator(tickAt=INSTANT),
        tags={"context": "engagement"},
    ),
    Consumer(
        name="engagement.sync_validation_quiz_reminders",
        on="cron/hourly-tick",
        run=engagement_sync_validation_quiz_reminders,
        max_attempts=HOURLY_NOTIFICATION_ATTEMPTS,
        validate=payload_validator(tickAt=INSTANT),
        tags={"context": "engagement"},
    ),
    # --- business events ---------------------------------------------------------------------------
    Consumer(
        name="privacy.run_data_export",
        on="account/export-requested",
        run=privacy_run_data_export,
        timeout_s=LONG_JOB_TIMEOUT_S,
        validate=payload_validator(userId=UUID, exportId=UUID),
        tags={"context": "privacy"},
    ),
    Consumer(
        name="engagement.send_welcome_email",
        on="user/signed-up",
        run=engagement_send_welcome_email,
        validate=payload_validator(userId=UUID),
        tags={"context": "engagement"},
    ),
    Consumer(
        name="engagement.deliver_notification",
        on="notification/delivery-due",
        run=engagement_deliver_notification,
        validate=payload_validator(userId=UUID, deliveryId=UUID),
        tags={"context": "engagement"},
    ),
    Consumer(
        name="content.process_resource",
        on="resource/uploaded",
        run=content_process_resource,
        timeout_s=INGESTION_TIMEOUT_S,
        # A saturated embedding provider (429) is retried for about 45 minutes before giving up;
        # a refusal (invalid key, rejected request) fails at once (QA 2026-11-25).
        max_attempts=INGESTION_MAX_ATTEMPTS,
        on_final_failure=content_resource_given_up,
        validate=payload_validator(userId=UUID, resourceId=UUID),
        tags={"context": "content"},
    ),
    Consumer(
        name="tutor.generate_course",
        on="chapter/contributions-completed",
        run=tutor_generate_course,
        # A module of a long deposited document has many chapters, each one an AI call corrected
        # up to twice: ten minutes were not enough (QA 2026-11-26).
        timeout_s=COURSE_GENERATION_TIMEOUT_S,
        max_attempts=COURSE_GENERATION_ATTEMPTS,
        validate=validate_course_generation_event,
        tags={"context": "tutor"},
    ),
    Consumer(
        name="tutor.prepare_question_bank",
        on="course/generated",
        run=tutor_prepare_question_bank,
        timeout_s=QUESTION_BANK_PREPARE_TIMEOUT_S,
        validate=payload_validator(userId=UUID, courseId=UUID, moduleId=UUID),
        tags={"context": "tutor"},
    ),
    Consumer(
        name="formation.simple_analysis",
        on="simple.analysis.requested",
        run=formation_simple_analysis,
        timeout_s=SIMPLE_ANALYSIS_TIMEOUT_S,
        validate=payload_validator(userId=UUID, formationId=UUID),
        tags={"context": "formation"},
    ),
    Consumer(
        name="formation.simple_generation",
        on="simple.generation.requested",
        run=formation_simple_generation,
        timeout_s=GENERATION_TIMEOUT_S,
        validate=payload_validator(userId=UUID, formationId=UUID),
        tags={"context": "formation"},
    ),
    Consumer(
        name="learning.plan_programme",
        on="formation/programme-validated",
        run=learning_plan_programme,
        timeout_s=GENERATION_TIMEOUT_S,
        validate=payload_validator(userId=UUID, formationId=UUID),
        tags={"context": "learning"},
    ),
    Consumer(
        name="assessments.grade_quiz",
        on="quiz/submitted",
        run=assessments_grade_quiz,
        timeout_s=GRADING_TIMEOUT_S,
        validate=payload_validator(userId=UUID, attemptId=UUID),
        tags={"context": "assessments"},
    ),
    Consumer(
        name="assessments.submit_exam_at_deadline",
        on="exam/started",
        run=assessments_submit_exam_at_deadline,
        run_at=exam_deadline_run_at,
        validate=payload_validator(userId=UUID, attemptId=UUID, deadlineAt=INSTANT),
        tags={"context": "assessments"},
    ),
    Consumer(
        name="formation.unlock_module",
        on="quiz/graded",
        run=formation_unlock_module,
        validate=payload_validator(
            userId=UUID,
            formationId=UUID,
            moduleId=UUID,
            attemptId=UUID,
            score=NUMBER,
            passed=BOOLEAN,
        ),
        tags={"context": "formation"},
    ),
    Consumer(
        name="tutor.prepare_remediation",
        on="quiz/graded",
        run=tutor_prepare_remediation,
        validate=payload_validator(userId=UUID, moduleId=UUID, passed=BOOLEAN),
        tags={"context": "tutor"},
    ),
    Consumer(
        name="tutor.prepare_requested_remediation",
        on="remediation/requested",
        run=tutor_prepare_requested_remediation,
        validate=payload_validator(userId=UUID, moduleId=UUID),
        tags={"context": "tutor"},
    ),
    Consumer(
        name="engagement.send_daily_digest",
        on=DAILY_DIGEST_EVENT,
        run=engagement_send_daily_digest,
        run_at=daily_digest_run_at,
        validate=payload_validator(userId=UUID, at=INSTANT),
        tags={"context": "engagement"},
    ),
    # --- SPEC-2102 demonstration pipeline ---------------------------------------------------------
    Consumer(
        name=DEMO_CONSUMER,
        on=DEMO_EVENT,
        run=demo_job,
        validate=validate_demo_event,
        tags={"context": "devtools"},
    ),
)


def subscribed(consumers: tuple[Consumer, ...], event_name: str) -> tuple[Consumer, ...]:
    return tuple(consumer for consumer in consumers if consumer.on == event_name)
