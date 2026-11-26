"""[SPEC-2207] Registry of the consumers of the P22 plan: delays, payloads, retries."""

import dataclasses
import re
import uuid
from datetime import timedelta
from typing import Any

import pytest
from learny.shared.outbox.errors import PermanentJobError
from learny.shared.outbox.events import Event
from learny.shared.time import parse_iso
from learny_worker.consumers import (
    CONSUMERS,
    DAILY_DIGEST_EVENT,
    DEMO_CONSUMER,
    Consumer,
    daily_digest_event_id,
    subscribed,
)
from learny_worker.runner import Runner
from support.fakes import FakeClock, FakeDatabase, FakeDeps, RecordingConnection, RecordingLogger

pytestmark = pytest.mark.spec("SPEC-2207")

FIXED = parse_iso("2026-11-11T12:20:00Z")
NAME = re.compile(r"^[a-z]+(\.[a-z0-9_]+)+$")
USER = "0b6f2a7e-9a3c-4c1c-8a55-3d1f6f1d2a01"
USER_2 = "3f1c8a5e-5d0e-4a0b-9a6e-7b2c4d9e1f02"
FORMATION = "6a9d2c4b-1e7f-4b3a-8c5d-9e0f1a2b3c03"
MODULE = "9f1d4c7b-2a3e-4d5f-8b6a-1c2d3e4f5a6b"
ATTEMPT = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f"
COURSE = "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f60"
RESOURCE = "3e4f5a6b-7c8d-4e9f-8a0b-1c2d3e4f5a70"
EXPORT = "4f5a6b7c-8d9e-4f0a-9b1c-2d3e4f5a6b80"
DELIVERY = "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c90"
AT = "2026-11-11T12:20:00.000Z"
DAY = "2026-11-11"

# The consumer table of the P22 plan (SPEC-2207): the name and the event of every row.
PLAN: dict[str, str] = {
    "privacy.run_account_deletions": "cron/nightly",
    "privacy.purge_exports": "cron/nightly",
    "shared.purge_outbox": "cron/nightly",
    "assessments.purge_offline_receipts": "cron/nightly",
    "tutor.process_question_bank_jobs": "cron/nightly",
    "identity.purge_security_rows": "cron/hourly-tick",
    "content.fail_stale_resources": "cron/hourly-tick",
    "engagement.plan_daily_digests": "cron/hourly-tick",
    "engagement.deliver_due_deliveries": "cron/hourly-tick",
    "engagement.sync_validation_quiz_reminders": "cron/hourly-tick",
    "privacy.run_data_export": "account/export-requested",
    "engagement.send_welcome_email": "user/signed-up",
    "engagement.deliver_notification": "notification/delivery-due",
    "content.process_resource": "resource/uploaded",
    "tutor.generate_course": "chapter/contributions-completed",
    "tutor.prepare_question_bank": "course/generated",
    "learning.plan_programme": "formation/programme-validated",
    "assessments.grade_quiz": "quiz/submitted",
    "assessments.submit_exam_at_deadline": "exam/started",
    "formation.unlock_module": "quiz/graded",
    "tutor.prepare_remediation": "quiz/graded",
    "tutor.prepare_requested_remediation": "remediation/requested",
    "engagement.send_daily_digest": DAILY_DIGEST_EVENT,
    # SPEC-4001 - simple mode: document analysis and progressive generation.
    "formation.simple_analysis": "simple.analysis.requested",
    "formation.simple_generation": "simple.generation.requested",
}

VALID_PAYLOADS: dict[str, dict[str, Any]] = {
    "privacy.run_account_deletions": {"runDate": DAY},
    "privacy.purge_exports": {"runDate": DAY},
    "shared.purge_outbox": {"runDate": DAY},
    "assessments.purge_offline_receipts": {"runDate": DAY},
    "tutor.process_question_bank_jobs": {"runDate": DAY},
    "identity.purge_security_rows": {"tickAt": AT},
    "content.fail_stale_resources": {"tickAt": AT},
    "engagement.plan_daily_digests": {"tickAt": AT},
    "engagement.deliver_due_deliveries": {"tickAt": AT},
    "engagement.sync_validation_quiz_reminders": {"tickAt": AT},
    "privacy.run_data_export": {"userId": USER, "exportId": EXPORT},
    "engagement.send_welcome_email": {"userId": USER},
    "engagement.deliver_notification": {"userId": USER, "deliveryId": DELIVERY},
    "content.process_resource": {"userId": USER, "resourceId": RESOURCE},
    "tutor.generate_course": {
        "userId": USER,
        "moduleId": MODULE,
        "chapterId": None,
        "force": True,
    },
    "tutor.prepare_question_bank": {"userId": USER, "courseId": COURSE, "moduleId": MODULE},
    "learning.plan_programme": {"userId": USER, "formationId": FORMATION},
    "assessments.grade_quiz": {"userId": USER, "attemptId": ATTEMPT},
    "assessments.submit_exam_at_deadline": {
        "userId": USER,
        "attemptId": ATTEMPT,
        "deadlineAt": "2026-11-11T13:00:00.000Z",
    },
    "formation.unlock_module": {
        "userId": USER,
        "formationId": FORMATION,
        "moduleId": MODULE,
        "attemptId": ATTEMPT,
        "score": 92.5,
        "passed": True,
    },
    "tutor.prepare_remediation": {"userId": USER, "moduleId": MODULE, "passed": False},
    "tutor.prepare_requested_remediation": {"userId": USER, "moduleId": MODULE},
    "engagement.send_daily_digest": {"userId": USER, "at": AT},
    # SPEC-4001 - simple mode.
    "formation.simple_analysis": {"userId": USER, "formationId": FORMATION},
    "formation.simple_generation": {"userId": USER, "formationId": FORMATION},
}


def consumer_named(name: str) -> Consumer:
    return next(consumer for consumer in CONSUMERS if consumer.name == name)


def event(name: str, data: dict[str, Any], event_id: str = "spec-2207:event") -> Event:
    return Event(event_id=event_id, name=name, data=data, user_id=None, created_at=FIXED)


def test_the_registry_declares_the_consumers_of_the_plan() -> None:
    declared = {consumer.name: consumer.on for consumer in CONSUMERS if consumer.name != DEMO_CONSUMER}
    assert declared == PLAN
    assert len(declared) == 25


def test_every_consumer_has_a_valid_name_and_options() -> None:
    for consumer in CONSUMERS:
        assert NAME.match(consumer.name), consumer.name
        # SPEC-4001 - simple mode names its events with dots, the rest of the catalogue with slashes.
        assert "/" in consumer.on or consumer.on.startswith("simple."), consumer.on
        assert consumer.timeout_s > 0
        assert consumer.max_attempts >= 1
        assert consumer.tags["context"]


def test_the_course_generation_runs_once_per_completion_event() -> None:
    consumer = consumer_named("tutor.generate_course")
    assert consumer.on == "chapter/contributions-completed"
    assert consumer.timeout_s == 1800
    # `retries: 3` in the job definition: the first attempt plus three retries.
    assert consumer.max_attempts == 4
    assert consumer.run_after(event(consumer.on, VALID_PAYLOADS[consumer.name]), FakeClock(FIXED)) is None


def test_the_two_graders_of_a_graded_quiz_are_both_subscribed() -> None:
    names = [consumer.name for consumer in subscribed(CONSUMERS, "quiz/graded")]
    assert names == ["formation.unlock_module", "tutor.prepare_remediation"]


def test_the_exam_deadline_runs_five_seconds_after_the_deadline() -> None:
    deadline = parse_iso("2026-11-11T13:00:00Z")
    consumer = consumer_named("assessments.submit_exam_at_deadline")
    payload = {**VALID_PAYLOADS[consumer.name], "deadlineAt": "2026-11-11T13:00:00.000Z"}
    clock = FakeClock(parse_iso("2026-11-11T12:20:00Z"))
    assert consumer.run_after(event(consumer.on, payload), clock) == deadline + timedelta(seconds=5)


def test_the_exam_deadline_never_runs_in_the_past() -> None:
    consumer = consumer_named("assessments.submit_exam_at_deadline")
    payload = {**VALID_PAYLOADS[consumer.name], "deadlineAt": "2026-11-11T11:00:00.000Z"}
    clock = FakeClock(FIXED)
    assert consumer.run_after(event(consumer.on, payload), clock) is None


def test_the_daily_digest_runs_at_its_instant() -> None:
    consumer = consumer_named("engagement.send_daily_digest")
    payload = VALID_PAYLOADS[consumer.name]
    assert consumer.run_after(event(consumer.on, payload), FakeClock(FIXED)) == parse_iso(AT)


def test_the_daily_digest_identifier_is_deterministic() -> None:
    identifier = daily_digest_event_id(USER, AT)
    assert identifier == f"daily-digest:{USER}:{AT}"
    assert daily_digest_event_id(USER, AT) == identifier


def test_a_consumer_without_a_delay_starts_at_once() -> None:
    consumer = consumer_named("assessments.grade_quiz")
    assert consumer.run_after(event(consumer.on, VALID_PAYLOADS[consumer.name]), FakeClock(FIXED)) is None


@pytest.mark.parametrize("name", sorted(PLAN))
def test_a_valid_payload_passes_its_validator(name: str) -> None:
    consumer = consumer_named(name)
    consumer.check(event(consumer.on, VALID_PAYLOADS[name]))


@pytest.mark.parametrize(
    ("name", "broken"),
    [
        ("assessments.grade_quiz", {"userId": USER}),
        ("assessments.grade_quiz", {"userId": "not-a-uuid", "attemptId": ATTEMPT}),
        ("assessments.submit_exam_at_deadline", {"userId": USER, "attemptId": ATTEMPT, "deadlineAt": "soon"}),
        ("engagement.send_daily_digest", {"userId": USER, "at": "2026-11-11"}),
        ("formation.unlock_module", {"userId": USER, "formationId": FORMATION, "moduleId": MODULE}),
        (
            "formation.unlock_module",
            {
                "userId": USER,
                "formationId": FORMATION,
                "moduleId": MODULE,
                "attemptId": ATTEMPT,
                "score": "high",
                "passed": True,
            },
        ),
        ("tutor.prepare_remediation", {"userId": USER, "moduleId": MODULE, "passed": "yes"}),
        ("learning.plan_programme", {"userId": USER, "formationId": ""}),
        ("shared.purge_outbox", {"runDate": "11/11/2026"}),
        ("tutor.generate_course", {"userId": USER, "moduleId": MODULE, "chapterId": None}),
        ("tutor.generate_course", {"userId": USER, "moduleId": "nope", "chapterId": None, "force": True}),
        (
            "tutor.generate_course",
            {"userId": USER, "moduleId": MODULE, "chapterId": "not-a-uuid", "force": True},
        ),
        ("identity.purge_security_rows", {}),
    ],
)
def test_an_invalid_payload_is_refused_without_retry(name: str, broken: dict[str, Any]) -> None:
    consumer = consumer_named(name)
    with pytest.raises(PermanentJobError, match="VALIDATION_FAILED"):
        consumer.check(event(consumer.on, broken))


async def test_the_registry_options_drive_the_backoff_of_a_failing_delivery() -> None:
    # The hourly notification producers declare `retries: 1`, so the second attempt is final; the
    # first failure is rescheduled with the bounded backoff of the runner (SPEC-2102).
    async def failing(_deps: Any, _event: Event) -> None:
        raise RuntimeError("provider hiccup")

    consumer = dataclasses.replace(consumer_named("engagement.deliver_due_deliveries"), run=failing)
    assert consumer.max_attempts == 2
    database = FakeDatabase()
    logger = RecordingLogger()
    runner = Runner(
        FakeDeps(db=database, clock=FakeClock(FIXED), logger=logger),
        (consumer,),
        concurrency=1,
        logger=logger,
    )
    database.conn = RecordingConnection(
        [
            [
                {
                    "event_id": "spec-2207:event",
                    "consumer": consumer.name,
                    "attempts": 1,
                    "name": consumer.on,
                    "data": VALID_PAYLOADS[consumer.name],
                    "user_id": None,
                    "created_at": FIXED,
                }
            ]
        ]
    )
    await runner.run_once()
    reschedules = [parameters for parameters in database.conn.parameters() if "run_after" in parameters]
    assert reschedules[0]["run_after"] == FIXED + timedelta(seconds=10)
    assert logger.messages()[-1] == "delivery failed, will retry"


def test_a_uuid_payload_field_rejects_a_non_string() -> None:
    consumer = consumer_named("assessments.grade_quiz")
    with pytest.raises(PermanentJobError, match="VALIDATION_FAILED"):
        consumer.check(event(consumer.on, {"userId": 42, "attemptId": ATTEMPT}))


def test_the_registry_names_are_unique() -> None:
    names = [consumer.name for consumer in CONSUMERS]
    assert len(names) == len(set(names))
    assert uuid.UUID(USER)


def test_the_demo_consumer_is_kept_for_the_demonstration_pipeline() -> None:
    demo = consumer_named(DEMO_CONSUMER)
    assert demo.on == "sdd/demo-requested"
