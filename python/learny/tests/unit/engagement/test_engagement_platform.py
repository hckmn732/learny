"""[SPEC-2205] Platform of the engagement notifications: e-mail, push and unsubscribe links.

Every mode runs without any network: `EMAIL_MODE=memory` captures the messages in an outbox and
`PUSH_MODE=mock` simulates the push service from the endpoint itself. The French copy is asserted
through `learny.shared.locale_fr.engagement_email`, the single source of the user-facing strings
(ADR-2011).
"""

import base64
import json
from typing import Any

import pytest
from learny.engagement.application.inbox import notification_group, previous_civil_day
from learny.engagement.application.notify import settings_of
from learny.engagement.application.settings import (
    active_notification_type_count,
    quiet_hours_of,
)
from learny.engagement.application.unsubscribe import (
    unsubscribe_by_token,
    unsubscribe_done,
    unsubscribe_form,
    unsubscribe_invalid,
)
from learny.engagement.domain.templates import Tone
from learny.engagement.infrastructure import queries
from learny.engagement.infrastructure.email import (
    DEFAULT_EMAIL_FROM,
    DEV_LINK_SECRET,
    EmailConfig,
    EmailConfigError,
    EmailRejectedError,
    EmailTag,
    EmailTransientError,
    MemoryEmailTransport,
    build_email_config,
    create_email_transport,
    is_rejected_email_error,
    is_transient_email_error,
    is_transient_status,
)
from learny.engagement.infrastructure.email_templates import (
    build_email_content,
    build_message,
    render_email,
)
from learny.engagement.infrastructure.push import (
    PUSH_MAX_FAILURES,
    PUSH_TTL_SECONDS,
    AttemptDecision,
    MockPushTransport,
    PushSendResult,
    PushTarget,
    build_push_payload,
    classify_push_status,
    create_push_transport,
    decide_attempt,
    mock_outcome_of,
    mock_push_endpoint,
    safe_notification_url,
    summarize_round,
)
from learny.engagement.infrastructure.unsubscribe import (
    create_unsubscribe_token,
    verify_unsubscribe_token,
)
from learny.engagement.infrastructure.unsubscribe_page import (
    escape_html,
    is_valid_csp_nonce,
    request_csp_nonce,
    unsubscribe_invalid_page,
    wants_json,
)
from learny.shared.clock import FixedClock
from learny.shared.config import Settings
from learny.shared.errors import AppError
from learny.shared.locale_fr import engagement as inbox_fr
from learny.shared.locale_fr import engagement_email as fr
from learny.shared.time import parse_iso

pytestmark = pytest.mark.spec("SPEC-2205")

USER_ID = "11111111-1111-4111-8111-111111111111"
SECRET = "learny-test-only-email-link-secret-00000000"

TOKEN_VECTORS = [
    (
        SECRET,
        USER_ID,
        "MTExMTExMTEtMTExMS00MTExLTgxMTEtMTExMTExMTExMTEx.Kz5a0dxZ1EXp-M0mBUcCXEVeMcVF78dEJXfjvOPyJrE",
    ),
    (
        "s3cret",
        "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        "YWFhYWFhYWEtYmJiYi00Y2NjLThkZGQtZWVlZWVlZWVlZWVl.bdq_QDmNEenMYw_yR4a0xyULJX5JMijgXwWiTfFNZTE",
    ),
    (
        "x",
        "00000000-0000-4000-8000-000000000000",
        "MDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAw.RVaQJrjnyg3DjDBVQeHMiAiCxPQp4CUt64IbVpKRTm4",
    ),
]

RENDERED = {"title": "Rappel", "body": "Votre seance approche.", "href": "/agenda"}


def settings_with(**overrides: Any) -> Settings:
    """A `Settings` built for one test, independent of the process environment."""
    values: dict[str, Any] = {
        "app_env": "test",
        "database_url": "postgresql://unused:unused@127.0.0.1:1/x",
    }
    values.update(overrides)
    return Settings(**values)


def fixed_clock() -> FixedClock:
    return FixedClock(parse_iso("2026-11-11T12:20:00Z"))


def render(content: dict[str, Any], tone: Tone = "vous") -> Any:
    return render_email(content, tone=tone, user_id=USER_ID, app_url="https://learny.app", link_secret=SECRET)


def content_for(
    notification_type: str, *, first_name: str | None = "Ana", **data: Any
) -> dict[str, Any] | None:
    payload: dict[str, Any] = {"formationTitle": "SAP"}
    payload.update(data)
    return build_email_content(notification_type, payload, RENDERED, first_name)


@pytest.mark.parametrize(("secret", "user_id", "expected"), TOKEN_VECTORS)
def test_token_matches_the_typescript_vectors(secret: str, user_id: str, expected: str) -> None:
    assert create_unsubscribe_token(secret, user_id) == expected
    assert verify_unsubscribe_token(secret, expected) == user_id


def test_token_is_base64url_of_the_user_and_its_hmac() -> None:
    token = create_unsubscribe_token(SECRET, USER_ID)
    encoded, signature = token.split(".")

    assert base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)).decode() == USER_ID
    assert len(base64.urlsafe_b64decode(signature + "=" * (-len(signature) % 4))) == 32


@pytest.mark.parametrize(
    "token",
    [
        "",
        "not-a-token",
        ".",
        ".signature",
        f"{USER_ID}.",
        f"{USER_ID}.short",
        f"{USER_ID}.{'A' * 43}",
        "x" * 257,
        "not-a-uuid.AAAA",
    ],
)
def test_verify_refuses_a_malformed_or_forged_token(token: str) -> None:
    assert verify_unsubscribe_token(SECRET, token) is None


def test_verify_refuses_the_signature_of_another_secret() -> None:
    token = create_unsubscribe_token("another-secret", USER_ID)

    assert verify_unsubscribe_token(SECRET, token) is None
    assert verify_unsubscribe_token("another-secret", token) == USER_ID


def test_token_creation_refuses_a_malformed_user_identifier() -> None:
    with pytest.raises(ValueError, match="Identifiant utilisateur invalide"):
        create_unsubscribe_token(SECRET, "not-a-uuid")


# --- e-mail configuration ------------------------------------------------------------------------


def test_modes_follow_the_application_environment() -> None:
    assert build_email_config(settings_with(app_env="test")).mode == "memory"
    assert build_email_config(settings_with(app_env="local")).mode == "smtp"
    assert build_email_config(settings_with(app_env="preview", resend_api_key="re_x")).mode == "resend"


def test_an_explicit_mode_wins_over_the_default() -> None:
    config = build_email_config(settings_with(email_mode="smtp", smtp_host="mail", smtp_port=2525))

    assert (config.mode, config.smtp_host, config.smtp_port) == ("smtp", "mail", 2525)


def test_production_requires_the_link_secret() -> None:
    with pytest.raises(EmailConfigError):
        build_email_config(settings_with(app_env="production", email_mode="memory", email_link_secret=None))


def test_resend_requires_an_api_key() -> None:
    with pytest.raises(EmailConfigError):
        build_email_config(settings_with(email_mode="resend", resend_api_key=None))
    with pytest.raises(EmailConfigError):
        build_email_config(settings_with(app_env="production", email_mode="resend", email_link_secret="s"))


def test_sender_app_url_and_defaults() -> None:
    config = build_email_config(settings_with())

    assert config.sender == DEFAULT_EMAIL_FROM
    assert config.link_secret == DEV_LINK_SECRET
    assert config.app_url == "http://localhost:3000"
    assert not config.is_production


def test_app_url_loses_its_trailing_slash() -> None:
    config = build_email_config(settings_with(next_public_app_url="https://learny.app//"))

    assert config.app_url == "https://learny.app"


def test_the_transport_of_the_mode_is_selected() -> None:
    memory = create_email_transport(build_email_config(settings_with()), fixed_clock())

    assert memory.name == "memory"


# --- e-mail transports ---------------------------------------------------------------------------


async def test_memory_transport_captures_once_per_idempotency_key() -> None:
    transport = MemoryEmailTransport(fixed_clock())
    message = build_message(
        render({"template": "welcome", "props": {"firstName": "Ana"}}),
        recipient="ana@test.learny.test",
        sender=DEFAULT_EMAIL_FROM,
        idempotency_key="welcome:1",
    )

    first = await transport.send(message, idempotency_key="welcome:1")
    second = await transport.send(message, idempotency_key="welcome:1")

    assert first == second
    assert len(transport.entries()) == 1
    assert transport.entries()[0].message.to == "ana@test.learny.test"


def test_transport_errors_are_classified() -> None:
    transient = EmailTransientError("down", 503)
    rejected = EmailRejectedError("refused", 422)

    assert is_transient_email_error(transient)
    assert not is_rejected_email_error(transient)
    assert is_rejected_email_error(rejected)
    assert not is_transient_email_error(rejected)
    assert is_transient_status(None)
    assert is_transient_status(429)
    assert is_transient_status(500)
    assert not is_transient_status(400)
    assert not is_transient_status(200)


# --- e-mail rendering: five templates, both tones ------------------------------------------------


@pytest.mark.parametrize(
    ("notification_type", "data", "vous_subject", "tu_subject"),
    [
        ("validation_soon", {}, RENDERED["title"], RENDERED["title"]),
        (
            "weekly_review",
            {"periodStartLabel": "4 novembre", "periodEndLabel": "10 novembre"},
            fr.WEEKLY_REVIEW_SUBJECT["vous"].format(start="4 novembre", end="10 novembre"),
            fr.WEEKLY_REVIEW_SUBJECT["tu"].format(start="4 novembre", end="10 novembre"),
        ),
        (
            "daily_digest",
            {"dateLabel": "aujourd" + "\u2019" + "hui"},
            fr.DIGEST_SUBJECT["vous"].format(date="aujourd" + "\u2019" + "hui"),
            fr.DIGEST_SUBJECT["tu"].format(date="aujourd" + "\u2019" + "hui"),
        ),
        (
            "ai_task_failed",
            {},
            fr.AI_TASK_FAILED_SUBJECT.format(task_label=fr.TASK_FALLBACK),
            fr.AI_TASK_FAILED_SUBJECT.format(task_label=fr.TASK_FALLBACK),
        ),
    ],
)
def test_subject_of_each_template_follows_the_tone(
    notification_type: str,
    data: dict[str, str],
    vous_subject: str,
    tu_subject: str,
) -> None:
    content = content_for(notification_type, **data)
    assert content is not None

    assert render(content, "vous").subject == vous_subject
    assert render(content, "tu").subject == tu_subject


def test_reminder_carries_the_rendered_row_and_the_service_headers() -> None:
    content = content_for("validation_soon")
    assert content is not None
    rendered = render(content, "tu")
    token = create_unsubscribe_token(SECRET, USER_ID)

    assert rendered.subject == RENDERED["title"]
    assert RENDERED["body"] in rendered.html
    assert "SAP" in rendered.html
    assert rendered.headers == {
        "List-Unsubscribe": f"<https://learny.app/api/v1/email/unsubscribe?token={token}>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    }
    assert rendered.tags == (
        EmailTag(name="template", value="reminder"),
        EmailTag(name="category", value="service"),
    )
    assert fr.EMAIL_PREFERENCES_LINK in rendered.html
    assert fr.EMAIL_UNSUBSCRIBE_LINK_SERVICE in rendered.html
    assert fr.EMAIL_FOOTER["tu"] in rendered.text
    assert token in rendered.text


def test_welcome_email_frames_the_first_name_and_the_tone() -> None:
    tu = render({"template": "welcome", "props": {"firstName": "Ana"}}, "tu")
    vous = render({"template": "welcome", "props": {"firstName": None}}, "vous")

    assert fr.WELCOME_GREETING_NAMED.format(first_name="Ana") in tu.html
    assert fr.WELCOME_GREETING in vous.html
    assert fr.WELCOME_PREVIEW["tu"] in tu.html
    assert fr.WELCOME_INTRO["tu"] in tu.text
    assert fr.WELCOME_INTRO["vous"] in vous.text
    assert fr.WELCOME_BULLET_COURSES["tu"] in tu.text
    assert fr.WELCOME_BULLET_REVIEWS in tu.text
    assert fr.WELCOME_BULLET_KEY["vous"] in vous.text
    assert fr.WELCOME_CTA in tu.html
    assert fr.WELCOME_CTA_PATH in tu.text


def test_daily_digest_bounds_and_orders_its_lists() -> None:
    activities = [
        {"time": f"{index:02d}:00", "title": f"Activite {index}", "detail": "10 min"} for index in range(25)
    ]
    content = content_for(
        "daily_digest",
        plannedLabel="1 h 30",
        activities=activities,
        globalQuiz={"notions": 10, "minutes": 10},
        held={"count": 2, "maxPerDay": 5, "titles": ["A", "B"]},
    )
    assert content is not None
    rendered = render(content, "vous")

    assert len(content["props"]["activities"]) == 20
    assert content["props"]["held"] == {"count": 2, "maxPerDay": 5, "titles": ["A", "B"]}
    assert fr.DIGEST_GREETING_NAMED.format(first_name="Ana") in rendered.text
    assert fr.DIGEST_INTRO["vous"].format(count=20, planned="1 h 30") in rendered.text
    assert fr.DIGEST_GLOBAL_QUIZ.format(notions=10, minutes=10) in rendered.text
    assert fr.DIGEST_HELD_TITLE in rendered.text
    assert fr.DIGEST_HELD_INTRO["vous"].format(count=2, max_per_day=5) in rendered.text
    assert fr.DIGEST_HELD_LINK in rendered.text


def test_daily_digest_without_activity_still_says_so() -> None:
    content = content_for("daily_digest", first_name=None, activities=[])
    assert content is not None
    rendered = render(content, "tu")

    assert fr.DIGEST_GREETING in rendered.text
    assert fr.DIGEST_EMPTY_TEXT["tu"] in rendered.text
    assert fr.DIGEST_INTRO["tu"].format(count=0, planned="") not in rendered.text


@pytest.mark.parametrize(
    ("held", "expected_cap"),
    [
        ({"count": 0, "maxPerDay": 3}, None),
        ({"count": 1, "maxPerDay": 4}, 5),
        ({"count": 1, "maxPerDay": 3}, 3),
        ({"count": 1, "maxPerDay": 8}, 8),
    ],
)
def test_held_block_requires_a_positive_count_and_normalises_the_cap(
    held: dict[str, Any], expected_cap: int | None
) -> None:
    content = content_for("daily_digest", first_name=None, held=held, activities=[])
    assert content is not None
    kept = content["props"]["held"]

    if expected_cap is None:
        assert kept is None
    else:
        assert kept is not None
        assert kept["maxPerDay"] == expected_cap


def test_weekly_review_figures_and_tone() -> None:
    content = content_for(
        "weekly_review",
        periodStartLabel="4 novembre",
        periodEndLabel="10 novembre",
        studyLabel="3 h 20",
        retentionPercent=82,
        atRiskCount=4,
    )
    assert content is not None
    props = content["props"]
    rendered = render(content, "vous")

    assert fr.WEEKLY_REVIEW_TITLE["vous"].format(start="4 novembre", end="10 novembre") in rendered.text
    assert fr.WEEKLY_REVIEW_STUDY.format(study="3 h 20") in rendered.text
    assert fr.WEEKLY_REVIEW_RETENTION.format(percent=82) in rendered.text
    assert fr.WEEKLY_REVIEW_AT_RISK.format(count=4) in rendered.text
    assert fr.WEEKLY_REVIEW_SUCCEEDED.format(succeeded=props["succeeded"]) in rendered.text
    assert fr.WEEKLY_REVIEW_QUESTION["vous"] in rendered.text
    assert fr.WEEKLY_REVIEW_SECONDARY_CTA in rendered.text


def test_weekly_review_without_retention_shows_a_dash() -> None:
    content = content_for("weekly_review", retentionPercent=None)
    assert content is not None

    assert fr.WEEKLY_REVIEW_RETENTION_EMPTY in render(content).text


def test_ai_task_failed_clamps_its_subject() -> None:
    content = content_for("ai_task_failed", subject="x" * 200, taskLabel="Un plan", modelLabel="M1")
    assert content is not None
    rendered = render(content, "tu")

    assert len(content["props"]["subject"]) == 120
    assert rendered.subject == fr.AI_TASK_FAILED_SUBJECT.format(task_label="Un plan")
    assert fr.AI_TASK_FAILED_INTRO["tu"].format(model="M1", subject="x" * 120) in rendered.text
    assert fr.AI_TASK_FAILED_SECOND["tu"] in rendered.text
    assert fr.AI_TASK_FAILED_PREVIEW["tu"] in rendered.html


def test_a_type_without_email_has_no_content() -> None:
    assert build_email_content("export_ready", {}, RENDERED, "Ana") is None


def test_every_type_with_a_template_renders_both_tones() -> None:
    for notification_type in ("validation_soon", "weekly_review", "daily_digest", "ai_task_failed"):
        content = content_for(notification_type)
        assert content is not None
        for tone in ("vous", "tu"):
            rendered = render(content, tone)
            assert rendered.subject.strip() != ""
            assert rendered.text.strip() != ""
            assert '<html lang="fr"' in rendered.html
            assert "List-Unsubscribe-Post" in rendered.headers


def test_email_html_escapes_the_template_data() -> None:
    content = build_email_content(
        "validation_soon",
        {"formationTitle": "<script>alert(1)</script>"},
        RENDERED,
        None,
    )
    assert content is not None
    rendered = render(content)

    assert "<script>" not in rendered.html
    assert "&lt;script&gt;" in rendered.html


def test_message_carries_the_entity_reference() -> None:
    rendered = render({"template": "welcome", "props": {"firstName": None}})
    message = build_message(
        rendered, recipient="ana@test.learny.test", sender=DEFAULT_EMAIL_FROM, idempotency_key="k1"
    )

    assert message.headers["X-Entity-Ref-ID"] == "k1"
    assert message.headers["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    assert message.tags[0].value == "welcome"


# --- push payload, transports and outcomes -------------------------------------------------------

NOTIFICATION = {
    "id": USER_ID,
    "title": "Nouveau palier atteint",
    "body": "100 notions maitrisees.",
    "icon": "award",
    "href": "/accueil",
}


def test_push_payload_is_bounded_and_minimal() -> None:
    payload = build_push_payload(NOTIFICATION)

    assert json.loads(payload.to_json()) == {
        "title": "Nouveau palier atteint",
        "body": "100 notions maitrisees.",
        "icon": "award",
        "url": "/accueil",
        "tag": USER_ID,
    }


@pytest.mark.parametrize(
    "override",
    [
        {"id": "not-a-uuid"},
        {"title": ""},
        {"title": "x" * 121},
        {"body": " "},
        {"body": "x" * 401},
        {"icon": "Award"},
        {"icon": "award<script>"},
        {"href": "https://evil.example/path"},
        {"href": "//evil.example"},
        {"href": "javascript:alert(1)"},
        {"href": "/a b"},
        {"href": "chemin"},
    ],
)
def test_push_payload_refuses_a_malformed_row(override: dict[str, str]) -> None:
    with pytest.raises(AppError) as raised:
        build_push_payload({**NOTIFICATION, **override})

    assert raised.value.code == "VALIDATION_FAILED"


async def test_the_mock_transport_refuses_more_than_four_kilobytes() -> None:
    transport = MockPushTransport(fixed_clock().now)

    with pytest.raises(AppError) as raised:
        await transport.send(
            PushTarget(endpoint=mock_push_endpoint("ana", "success"), p256dh="p", auth="a"),
            "x" * 4097,
            ttl=PUSH_TTL_SECONDS,
            topic=None,
        )

    assert raised.value.code == "VALIDATION_FAILED"
    assert transport.records() == ()


@pytest.mark.parametrize(
    ("candidate", "expected"),
    [
        ("/accueil", "https://learny.app/accueil"),
        ("/formations/1?onglet=cours", "https://learny.app/formations/1?onglet=cours"),
        ("", None),
        ("accueil", None),
        ("//evil.example", None),
        ("https://evil.example", None),
        ("/a\\b", None),
        ("/a b", None),
        ("javascript:alert(1)", None),
        (None, None),
    ],
)
def test_safe_notification_url_keeps_only_internal_paths(candidate: object, expected: str | None) -> None:
    assert safe_notification_url("https://learny.app", candidate) == expected


def test_push_status_classification() -> None:
    assert classify_push_status(201) == PushSendResult(ok=True, status_code=201)
    assert classify_push_status(404) == PushSendResult(ok=False, status_code=404, reason="gone")
    assert classify_push_status(410) == PushSendResult(ok=False, status_code=410, reason="gone")
    assert classify_push_status(503) == PushSendResult(ok=False, status_code=503, reason="transient")
    assert classify_push_status(302).reason == "transient"


def test_attempt_decisions() -> None:
    gone = PushSendResult(ok=False, status_code=410, reason="gone")
    transient = PushSendResult(ok=False, status_code=503, reason="transient")
    sent = PushSendResult(ok=True, status_code=201)

    assert decide_attempt(0, sent) == AttemptDecision(removed=False, failure_count=0)
    assert decide_attempt(3, gone).removed
    assert decide_attempt(0, gone).failure_count == 0
    assert decide_attempt(0, transient).failure_count == 1
    assert not decide_attempt(PUSH_MAX_FAILURES - 2, transient).removed
    assert decide_attempt(PUSH_MAX_FAILURES - 1, transient).removed


def test_round_summary() -> None:
    sent = PushSendResult(ok=True, status_code=201)
    gone = PushSendResult(ok=False, status_code=410, reason="gone")
    transient = PushSendResult(ok=False, status_code=503, reason="transient")

    assert summarize_round([(transient, False), (sent, False)]).status == "sent"
    assert summarize_round([(gone, True)]).error == "gone"
    assert summarize_round([(gone, True), (transient, False)]).error == "transient"
    assert summarize_round([(transient, False)]).retryable
    assert not summarize_round([(gone, True)]).retryable


def test_mock_endpoint_outcomes() -> None:
    assert mock_outcome_of(mock_push_endpoint("scope", "gone")) == "gone"
    assert mock_outcome_of(mock_push_endpoint("scope", "transient")) == "transient"
    assert mock_outcome_of("https://example.test/anything") == "success"
    assert mock_outcome_of("not a url") == "success"


async def test_mock_transport_records_one_call_per_subscription() -> None:
    transport = MockPushTransport(fixed_clock().now)
    payload = build_push_payload(NOTIFICATION).to_json()

    result = await transport.send(
        PushTarget(endpoint=mock_push_endpoint("ana", "gone"), p256dh="p", auth="a"),
        payload,
        ttl=PUSH_TTL_SECONDS,
        topic=USER_ID.replace("-", "")[:32],
    )

    assert result.reason == "gone"
    record = transport.records()[0]
    assert record.outcome == "gone"
    assert record.status_code == 410
    assert record.payload_bytes == len(payload.encode())
    assert record.topic is not None
    assert len(record.topic) == 32


def test_live_transport_is_refused_in_ci_or_without_keys() -> None:
    clock = fixed_clock()

    with pytest.raises(AppError) as refused:
        create_push_transport("live", clock=clock, ci="true", subject="s", public_key="p", private_key="k")
    assert refused.value.code == "SERVICE_UNAVAILABLE"

    with pytest.raises(AppError):
        create_push_transport("live", clock=clock, ci="", subject=None, public_key="p", private_key="k")

    assert create_push_transport("mock", clock=clock).mode == "mock"


# --- unsubscribe pages ---------------------------------------------------------------------------


def test_unsubscribe_pages_render_the_french_copy() -> None:
    form = unsubscribe_form(create_unsubscribe_token(SECRET, USER_ID))
    invalid = unsubscribe_invalid()
    done = unsubscribe_done()

    assert form.status == 200
    assert inbox_fr.UNSUBSCRIBE_QUESTION in form.html
    assert inbox_fr.UNSUBSCRIBE_KEEP in form.html
    assert inbox_fr.UNSUBSCRIBE_CONFIRM in form.html
    assert 'method="post"' in form.html
    assert 'data-testid="unsubscribe-confirm"' in form.html
    assert "List-Unsubscribe" in form.html
    assert invalid.status == 400
    assert inbox_fr.UNSUBSCRIBE_INVALID_TITLE in invalid.html
    assert inbox_fr.UNSUBSCRIBE_INVALID_HINT in invalid.html
    assert done.status == 200
    assert inbox_fr.UNSUBSCRIBE_DONE_TITLE in done.html
    assert inbox_fr.UNSUBSCRIBE_DONE in done.html


def test_unsubscribe_page_percent_encodes_the_token() -> None:
    page = unsubscribe_form('"><script>alert(1)</script>')

    assert "<script>" not in page.html
    assert "%3Cscript%3E" in page.html


def test_the_csp_nonce_is_only_echoed_when_it_is_valid() -> None:
    valid = "A" * 24
    page = unsubscribe_form("token", nonce=valid)
    hostile = unsubscribe_form("token", nonce='"><script>alert(1)</script>')
    markup = unsubscribe_invalid_page("<b>invalide</b>")

    assert f'nonce="{valid}"' in page.html
    assert "<script>" not in hostile.html
    assert "<b>" not in markup
    assert is_valid_csp_nonce(valid)
    assert not is_valid_csp_nonce("short")
    assert request_csp_nonce(None) == ""
    assert request_csp_nonce("bad value") == ""
    assert request_csp_nonce(valid) == valid


def test_accept_header_decides_between_json_and_html() -> None:
    assert wants_json("application/json")
    assert not wants_json("application/json, text/html")
    assert not wants_json(None)


def test_escape_html_matches_the_typescript_replacements() -> None:
    assert escape_html("a&b<c>d\"e'f") == "a&amp;b&lt;c&gt;d&quot;e&#39;f"


# --- pure helpers of the services ----------------------------------------------------------------


def test_settings_of_defaults_and_cap_normalisation() -> None:
    assert settings_of(None).max_per_day == 5
    row = queries.SettingsRow(
        user_id=USER_ID,
        channel_email=False,
        channel_push=True,
        type_revision=True,
        type_validation=False,
        type_course=True,
        type_gap=True,
        type_planning=True,
        type_relaunch=True,
        digest_time="08:00",
        quiet_start="22:30",
        quiet_end="07:00",
        weekend_quiet=False,
        max_per_day=4,
        updated_at=parse_iso("2026-11-11T12:20:00Z"),
    )

    settings = settings_of(row)

    assert settings.max_per_day == 5
    assert settings.quiet_start == "22:30"
    assert settings.channel_email is False
    assert settings.type_validation is False


def test_quiet_hours_display() -> None:
    assert quiet_hours_of("21:00", "08:00") == {
        "start": "21:00",
        "end": "08:00",
        "crossesMidnight": True,
        "empty": False,
    }
    assert quiet_hours_of("08:00", "08:00")["empty"] is True
    assert quiet_hours_of("08:00", "21:00")["crossesMidnight"] is False


def test_active_type_count() -> None:
    assert active_notification_type_count({}) == 0
    assert (
        active_notification_type_count(
            {
                "revision": True,
                "validation": True,
                "course": False,
                "gap": False,
                "planning": False,
                "relaunch": False,
            }
        )
        == 2
    )


def test_notification_groups_use_civil_days_in_the_zone() -> None:
    now = parse_iso("2026-11-11T12:20:00Z")
    yesterday = parse_iso("2026-11-10T12:00:00Z")
    old = parse_iso("2026-11-01T09:00:00Z")
    # 23:30 UTC on the 10th is already 00:30 on the 11th in Paris and still the 11th in Tokyo at
    # 08:30: the group follows the civil day of the zone, never a fixed number of hours.
    late = parse_iso("2026-11-10T23:30:00Z")

    assert previous_civil_day("2026-03-01") == "2026-02-28"
    assert previous_civil_day("2026-01-01") == "2025-12-31"
    assert notification_group(now, now, "Europe/Paris") == "today"
    assert notification_group(late, now, "Europe/Paris") == "today"
    assert notification_group(yesterday, now, "Europe/Paris") == "yesterday"
    assert notification_group(old, now, "Europe/Paris") == "earlier"
    assert notification_group(parse_iso("2026-11-10T20:00:00Z"), now, "Asia/Tokyo") == "today"
    assert notification_group(parse_iso("2026-11-09T20:00:00Z"), now, "Asia/Tokyo") == "yesterday"


class _Logger:
    def info(self, *_args: Any, **_kwargs: Any) -> None: ...


class _Deps:
    """The narrowest bundle `unsubscribe_by_token` reads before touching the database."""

    def __init__(self) -> None:
        self.email_config = EmailConfig(
            mode="memory",
            sender=DEFAULT_EMAIL_FROM,
            app_url="http://localhost:3000",
            link_secret=SECRET,
            smtp_host="127.0.0.1",
            smtp_port=1025,
            resend_api_key=None,
            is_production=False,
        )
        self.logger = _Logger()


async def test_unsubscribe_by_token_refuses_a_forged_token_without_a_database() -> None:
    deps = _Deps()
    with pytest.raises(AppError) as raised:
        await unsubscribe_by_token(deps, "forged")  # type: ignore[arg-type]

    assert raised.value.code == "UNSUBSCRIBE_TOKEN_INVALID"
