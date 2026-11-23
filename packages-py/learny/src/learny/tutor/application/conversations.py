"""Conversations of the tutor (SPEC-610 ET-3, BR-TUT-07, ADR-0040).

Port of `packages/services/src/tutor-chat/conversations.ts`: conversations are private, kept per
course version, and every read runs under the caller's RLS client. A foreign or missing
conversation is a 404, never a leak of its existence. The greeting is composed by the code: no model
call when opening. Each function opens its own short transaction, so nothing is held across a model
call.
"""

import json
import re
from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Any

from learny.identity.domain.actor import Actor
from learny.shared.errors import AppError
from learny.shared.jsonx import dumps
from learny.shared.locale_fr import tutor as texts
from learny.shared.time import to_iso
from learny.tutor.application.context import ConversationRef, build_context
from learny.tutor.application.ports import TutorDeps
from learny.tutor.domain.context import BuiltContext
from learny.tutor.domain.follow_ups import build_follow_ups, follow_up_labels
from learny.tutor.infrastructure import queries

ALL_KEYS_INCLUDED: dict[str, Any] = {
    "include": {"formation": True, "chapter": True, "resources": True, "gap": True, "profile": True}
}
FOLLOW_UP_KEYS = ("rephrase", "example", "compare", "test_me")
ARRAY_BRACES = re.compile(r"^\{|\}$")


def json_text(value: Any) -> str:
    """`JSON.stringify(value)` as a text parameter of a `jsonb` column."""
    return dumps(value).decode("utf-8")


def iso_of(value: Any) -> str:
    """`isoOf`: a `Date` or a timestamp string, both rendered as an ISO instant."""
    if isinstance(value, datetime):
        return to_iso(value)
    return to_iso(datetime.fromisoformat(str(value).replace("Z", "+00:00")))


def as_record(value: Any) -> dict[str, Any]:
    """`asRecord`: a mapping, a JSON object string, or an empty mapping."""
    if value is None:
        return {}
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return dict(value) if isinstance(value, Mapping) else {}


def as_string_array(value: Any) -> list[str]:
    """`asStringArray`: a JSON array, a PostgreSQL array literal, or nothing."""
    if isinstance(value, (list, tuple)):
        return [entry if isinstance(entry, str) else str(entry) for entry in value if entry is not None]
    if isinstance(value, str):
        body = ARRAY_BRACES.sub("", value)
        return [
            entry.replace('"', "").strip()
            for entry in body.split(",")
            if entry.strip().replace('"', "") != ""
        ]
    return []


def sources_of(value: Any) -> list[dict[str, Any]]:
    """`sourcesOf`: only the entries carrying a readable label reach the client."""
    if not isinstance(value, (list, tuple)):
        return []
    return [
        dict(entry) for entry in value if isinstance(entry, Mapping) and isinstance(entry.get("label"), str)
    ]


def self_test_of(value: Any) -> dict[str, Any] | None:
    """`selfTestOf`: `pending` or `answered`, with the numeric fields of the verdict."""
    if value is None:
        return None
    record = as_record(value)
    status = record.get("status")
    if status not in ("pending", "answered"):
        return None
    result: dict[str, Any] = {"status": status}
    if isinstance(record.get("correct"), bool):
        result["correct"] = record["correct"]
    if isinstance(record.get("masteryBefore"), (int, float)) and not isinstance(
        record.get("masteryBefore"), bool
    ):
        result["masteryBefore"] = record["masteryBefore"]
    if isinstance(record.get("masteryAfter"), (int, float)) and not isinstance(
        record.get("masteryAfter"), bool
    ):
        result["masteryAfter"] = record["masteryAfter"]
    return result


def follow_ups_of(row: Mapping[str, Any]) -> list[dict[str, str]]:
    """`followUpsOf`: the stored keys, labelled by the message context."""
    keys = as_string_array(row.get("follow_ups"))
    labels = as_record(as_record(row.get("context")).get("followUpLabels"))
    return [
        {"key": key, "label": labels[key] if isinstance(labels.get(key), str) else key}
        for key in keys
        if key in FOLLOW_UP_KEYS
    ]


def message_dto(row: Mapping[str, Any]) -> dict[str, Any]:
    """`messageDto`: one message row as the client contract reads it."""
    return {
        "id": row["id"],
        "role": row["role"],
        "content": row["content"],
        "sources": sources_of(row.get("sources")),
        "followUps": follow_ups_of(row),
        "selfTest": self_test_of(row.get("self_test")),
        "createdAt": iso_of(row["created_at"]),
    }


def greeting_of(context: BuiltContext) -> dict[str, Any]:
    """`greetingOf`: the code-composed opening message and its follow-ups."""
    from learny.tutor.domain.context import greeting_text

    return {"content": greeting_text(context), "followUps": build_follow_ups(context.confusion)}


async def conversation_ref(deps: TutorDeps, actor: Actor, conversation_id: str) -> ConversationRef:
    """`conversationRef`: the course link of a conversation of the caller, or a 404."""
    async with deps.db.user_tx(actor) as tx:
        row = await queries.one(
            tx,
            queries.CONVERSATION_REF,
            {"id": conversation_id, "user_id": actor.user_id},
        )
    if row is None:
        raise AppError("NOT_FOUND", texts.CONVERSATION_NOT_FOUND)
    return ConversationRef(
        id=str(row["id"]), courseId=str(row["course_id"]), chapterId=str(row["chapter_id"])
    )


async def conversation_messages(deps: TutorDeps, actor: Actor, conversation_id: str) -> list[dict[str, Any]]:
    """`conversationMessages`: every message of the conversation, oldest first."""
    async with deps.db.user_tx(actor) as tx:
        return await queries.rows(
            tx,
            queries.MESSAGES_OF_CONVERSATION,
            {"conversation_id": conversation_id, "user_id": actor.user_id},
        )


def last_context_of(messages: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """`lastContextOf`: the context input of the last learner message, else every key."""
    for message in reversed(list(messages)):
        if message.get("role") != "learner":
            continue
        context = as_record(message.get("context"))
        include = context.get("include")
        if isinstance(include, Mapping):
            result: dict[str, Any] = {"include": dict(include)}
            passage = context.get("passage")
            if isinstance(passage, Mapping):
                result["passage"] = dict(passage)
            return result
    return ALL_KEYS_INCLUDED


def context_items_of(context: BuiltContext) -> list[dict[str, Any]]:
    """`contextItemsOf`: the six context keys as the client shows them."""
    return context.items


async def create_conversation(
    deps: TutorDeps, actor: Actor, course_id: str, chapter_id: str
) -> dict[str, Any]:
    """`createConversation`: one row, the composed greeting, then a full read."""
    async with deps.db.user_tx(actor) as tx:
        created = await queries.one(
            tx,
            queries.INSERT_CONVERSATION,
            {"user_id": actor.user_id, "course_id": course_id, "chapter_id": chapter_id},
        )
    if created is None:
        raise AppError("NOT_FOUND", texts.COURSE_NOT_FOUND)
    conversation_id = str(created["id"])
    ref = ConversationRef(id=conversation_id, courseId=course_id, chapterId=chapter_id)
    context = await build_context(deps, actor, ref, ALL_KEYS_INCLUDED, "")
    greeting = greeting_of(context)
    async with deps.db.user_tx(actor) as tx:
        await queries.execute(
            tx,
            queries.INSERT_GREETING_MESSAGE,
            {
                "conversation_id": conversation_id,
                "user_id": actor.user_id,
                "content": greeting["content"],
                "context": json_text(
                    {
                        "chapterId": chapter_id,
                        "followUpLabels": follow_up_labels(greeting["followUps"]),
                    }
                ),
                "follow_ups": "{" + ",".join(entry["key"] for entry in greeting["followUps"]) + "}",
            },
        )
    return await conversation_by_id(deps, actor, conversation_id)


async def list_conversations(deps: TutorDeps, actor: Actor, course_id: str) -> dict[str, Any]:
    """`listConversations`: the latest activity first, bounded to 200 rows."""
    async with deps.db.user_tx(actor) as tx:
        found = await queries.rows(
            tx, queries.LIST_CONVERSATIONS, {"user_id": actor.user_id, "course_id": course_id}
        )
    return {
        "items": [
            {
                "id": str(row["id"]),
                "title": row["title"],
                "createdAt": iso_of(row["created_at"]),
                "lastMessageAt": iso_of(row["last_message_at"]),
            }
            for row in found
        ]
    }


async def conversation_by_id(deps: TutorDeps, actor: Actor, conversation_id: str) -> dict[str, Any]:
    """`conversationById`: the whole conversation, its messages and its pending Teste-moi."""
    ref = await conversation_ref(deps, actor, conversation_id)
    rows = await conversation_messages(deps, actor, conversation_id)
    context = await build_context(deps, actor, ref, last_context_of(rows), "")
    async with deps.db.user_tx(actor) as tx:
        row = await queries.one(
            tx, queries.CONVERSATION_ROW, {"id": conversation_id, "user_id": actor.user_id}
        )
    if row is None:
        raise AppError("NOT_FOUND", texts.CONVERSATION_NOT_FOUND)
    messages = [message_dto(entry) for entry in rows]
    return {
        "id": str(row["id"]),
        "courseId": str(row["course_id"]),
        "chapterId": ref.chapterId,
        "title": row["title"],
        "createdAt": iso_of(row["created_at"]),
        "messages": messages,
        "contextItems": context_items_of(context),
        "pendingSelfTest": any(
            entry["selfTest"] is not None
            and entry["selfTest"]["status"] == "pending"
            and entry["role"] == "tutor"
            for entry in messages
        ),
    }


async def conversation_by_course(
    deps: TutorDeps, actor: Actor, course_id: str, chapter_id: str
) -> ConversationRef | None:
    """`conversationByCourse`: the most recently updated conversation of the course, or None."""
    async with deps.db.user_tx(actor) as tx:
        row = await queries.one(
            tx,
            queries.CONVERSATION_BY_COURSE,
            {"user_id": actor.user_id, "course_id": course_id, "chapter_id": chapter_id},
        )
    if row is None:
        return None
    return ConversationRef(
        id=str(row["id"]), courseId=str(row["course_id"]), chapterId=str(row["chapter_id"])
    )


__all__ = [
    "ALL_KEYS_INCLUDED",
    "ConversationRef",
    "as_record",
    "as_string_array",
    "context_items_of",
    "conversation_by_course",
    "conversation_by_id",
    "conversation_messages",
    "conversation_ref",
    "create_conversation",
    "greeting_of",
    "iso_of",
    "json_text",
    "last_context_of",
    "list_conversations",
    "message_dto",
    "self_test_of",
    "sources_of",
]
