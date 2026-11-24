"""HTTP handlers of the engagement context (SPEC-2205).

One `@handler("<route id>")` per operation, no logic: the body is the generated contract model and
the use case lives in `learny.engagement`. The three unsubscribe pages are the only answers that are
not JSON: the handler only builds the `Response` from the page the use case rendered.
"""

from typing import Any, cast

from learny.engagement import public as engagement
from learny.engagement.infrastructure.unsubscribe_page import (
    HTML_HEADERS,
    request_csp_nonce,
    wants_json,
)
from learny.shared.errors import AppError
from starlette.responses import Response

from learny_api.pipeline import Call, handler


def _actor(call: Call) -> Any:
    """The pipeline guarantees an actor on a `user` route; this is only a typing cast."""
    return cast(Any, call.actor)


def _body(call: Call, *, partial: bool = False) -> dict[str, Any]:
    """The validated body as a plain mapping; `partial` keeps only the fields the caller sent."""
    return cast(dict[str, Any], cast(Any, call.body).model_dump(exclude_unset=partial))


def _params(call: Call) -> dict[str, Any]:
    """The validated path parameters as a plain mapping."""
    return cast(dict[str, Any], cast(Any, call.params).model_dump())


def _query(call: Call) -> dict[str, Any]:
    """The validated query string as a plain mapping, defaults included."""
    return cast(dict[str, Any], cast(Any, call.query).model_dump())


def _html(page: Any) -> Response:
    """The HTML answer of the unsubscribe pages, never cached (SPEC-204 EF-5)."""
    return Response(content=page.html, status_code=page.status, headers=dict(HTML_HEADERS))


# --- inbox ---------------------------------------------------------------------------------------


@handler("notifications.list")
async def notifications_list(call: Call) -> Any:
    return await engagement.list_notifications(call.deps, _actor(call), _query(call))


@handler("notifications.read")
async def notifications_read(call: Call) -> Any:
    return await engagement.mark_notification_read(call.deps, _actor(call), _params(call)["id"])


@handler("notifications.readAll")
async def notifications_read_all(call: Call) -> Any:
    return await engagement.mark_all_read(call.deps, _actor(call))


@handler("notifications.unreadCount")
async def notifications_unread_count(call: Call) -> Any:
    return await engagement.get_unread_notification_count(call.deps, _actor(call))


# --- settings ------------------------------------------------------------------------------------


@handler("me.notificationSettings.get")
async def me_notification_settings_get(call: Call) -> Any:
    return await engagement.get_notification_settings(call.deps, _actor(call))


@handler("me.notificationSettings.update")
async def me_notification_settings_update(call: Call) -> Any:
    return await engagement.update_notification_settings(call.deps, _actor(call), _body(call, partial=True))


# --- push subscriptions --------------------------------------------------------------------------


@handler("pushSubscriptions.upsert")
async def push_subscriptions_upsert(call: Call) -> Any:
    return await engagement.upsert_push_subscription(call.deps, _actor(call), _body(call))


@handler("pushSubscriptions.delete")
async def push_subscriptions_delete(call: Call) -> Any:
    return await engagement.remove_push_subscription(call.deps, _actor(call), _body(call))


# --- one-click unsubscribe -----------------------------------------------------------------------


@handler("email.unsubscribe.page")
async def email_unsubscribe_page(call: Call) -> Any:
    token = str(_query(call)["token"])
    nonce = request_csp_nonce(call.request.headers.get("x-nonce"))
    if engagement.read_unsubscribe_token(call.deps, token) is None:
        return _html(engagement.unsubscribe_invalid(nonce))
    return _html(engagement.unsubscribe_form(token, nonce))


@handler("email.unsubscribe")
async def email_unsubscribe(call: Call) -> Any:
    token = str(_query(call)["token"])
    if wants_json(call.request.headers.get("accept")):
        return await engagement.unsubscribe_by_token(call.deps, token)
    nonce = request_csp_nonce(call.request.headers.get("x-nonce"))
    try:
        await engagement.unsubscribe_by_token(call.deps, token)
    except AppError as error:
        if error.code != "UNSUBSCRIBE_TOKEN_INVALID":
            raise
        return _html(engagement.unsubscribe_invalid(nonce))
    return _html(engagement.unsubscribe_done(nonce))


# --- automations ---------------------------------------------------------------------------------


@handler("me.automations.list")
async def me_automations_list(call: Call) -> Any:
    return await engagement.list_my_automations(call.deps, _actor(call))


@handler("me.automations.update")
async def me_automations_update(call: Call) -> Any:
    return await engagement.update_my_automation_setting(call.deps, _actor(call), _body(call))


@handler("me.automation-actions.list")
async def me_automation_actions_list(call: Call) -> Any:
    return await engagement.list_my_automation_actions(call.deps, _actor(call), _query(call))


# --- weekly review -------------------------------------------------------------------------------


@handler("me.weekly-review.get")
async def me_weekly_review_get(call: Call) -> Any:
    return await engagement.get_weekly_review(call.deps, _actor(call), _query(call).get("actionId"))


@handler("me.automation-actions.accept")
async def me_automation_actions_accept(call: Call) -> Any:
    return await engagement.accept_automation_action(
        call.deps, _actor(call), _params(call)["id"], _body(call, partial=True)
    )


@handler("me.automation-actions.decline")
async def me_automation_actions_decline(call: Call) -> Any:
    return await engagement.decline_automation_action(call.deps, _actor(call), _params(call)["id"])


@handler("me.automation-actions.undo")
async def me_automation_actions_undo(call: Call) -> Any:
    return await engagement.undo_automation_action(call.deps, _actor(call), _params(call)["id"])


# --- pause ---------------------------------------------------------------------------------------


@handler("me.pause.get")
async def me_pause_get(call: Call) -> Any:
    return await engagement.get_pause_state(call.deps, _actor(call))


@handler("me.pause.start")
async def me_pause_start(call: Call) -> Any:
    return await engagement.start_pause(call.deps, _actor(call), _body(call))


@handler("me.pause.end")
async def me_pause_end(call: Call) -> Any:
    return await engagement.end_pause(call.deps, _actor(call))


@handler("me.pause.diagnostic")
async def me_pause_diagnostic(call: Call) -> Any:
    return await engagement.complete_pause_diagnostic(call.deps, _actor(call), _body(call))
