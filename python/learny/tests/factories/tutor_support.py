"""Seeds and dependency bundle of the tutor integration tests (SPEC-2204).

Every row is seeded with the owner role inside a service transaction that `rolled_back` reverts; the
use cases then run under the caller's `authenticated` role inside savepoints, exactly like the
content and learning suites. The model is the committed mock adapter, never the network.
"""

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import structlog
from learny.platform.llm.gateway import MockGateway
from learny.platform.llm.mock import load_registry
from learny.shared.clock import FixedClock
from learny.shared.config import Settings
from learny.shared.db.uow import Tx
from learny.shared.errors import AppError
from sqlalchemy import text

from factories.course_support import (
    create_chunk,
    create_course,
    create_progress,
    create_resource,
    create_section,
)
from factories.identity_support import (
    FIXED,
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    create_user,
    identifier,
)
from factories.learning_deps import LearningTransactions


class RecordingGateway:
    """Wraps the deterministic mock so a test can read the scenario and the number of calls."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self._inner = MockGateway(load_registry())

    def _record(self, task: str, prompt_id: str, scenario: str | None, input: Any) -> None:
        self.calls.append({"task": task, "promptId": prompt_id, "scenario": scenario, "input": input})

    async def step(
        self, task: Any, prompt_id: str, input: Any, *, scenario: Any = None, caller: Any = None
    ) -> Any:
        self._record(task, prompt_id, scenario, input)
        return await self._inner.step(task, prompt_id, input, scenario=scenario)

    async def object(
        self,
        task: Any,
        prompt_id: str,
        schema: Any,
        input: Any,
        *,
        scenario: Any = None,
        caller: Any = None,
    ) -> Any:
        self._record(task, prompt_id, scenario, input)
        return await self._inner.object(task, prompt_id, schema, input, scenario=scenario)

    async def stream(
        self, task: Any, prompt_id: str, input: Any, *, scenario: Any = None, caller: Any = None
    ) -> Any:
        self._record(task, prompt_id, scenario, input)
        async for chunk in self._inner.stream(task, prompt_id, input, scenario=scenario):
            yield chunk

    def session(
        self,
        task: Any,
        prompt_id: str,
        *,
        scenario: Any = None,
        fixtures: Any = None,
        caller: Any = None,
        model: Any = None,
        api_key: Any = None,
    ) -> Any:
        """A mock session over the given fixtures, recorded like the other entry points."""
        self._record(task, prompt_id, scenario, None)
        return self._inner.session(task, prompt_id, scenario=scenario, fixtures=fixtures)


class UnavailableGateway:
    """An AI provider that is down, for the error paths of the use cases."""

    async def step(self, *args: Any, **kwargs: Any) -> Any:
        raise AppError("AI_UNAVAILABLE")

    async def object(self, *args: Any, **kwargs: Any) -> Any:
        raise AppError("AI_UNAVAILABLE")

    async def stream(self, *args: Any, **kwargs: Any) -> Any:
        raise AppError("AI_UNAVAILABLE")
        yield ""  # pragma: no cover - an async generator needs one yield in its body


@dataclass
class TutorTestDeps:
    """The dependency bundle the tutor use cases see; a `Deps` satisfies the same protocol."""

    settings: Settings
    clock: FixedClock
    db: LearningTransactions
    llm: Any
    logger: Any


def tutor_deps(tx: Tx, *, llm: Any = None, now: datetime = FIXED) -> TutorTestDeps:
    """Builds the stand-in bundle around an already open seed transaction."""
    return TutorTestDeps(
        settings=Settings(),
        clock=FixedClock(now),
        db=LearningTransactions(tx),
        llm=RecordingGateway() if llm is None else llm,
        logger=structlog.get_logger("learny.test"),
    )


async def create_conversation_row(
    tx: Tx,
    *,
    user_id: str,
    course_id: str,
    title: str | None = None,
    created_at: datetime = FIXED,
    updated_at: datetime = FIXED,
) -> str:
    """One conversation of the caller, with fixed instants so the ordering is reproducible."""
    return await identifier(
        tx.conn,
        """
        insert into public.tutor_conversations (user_id, course_id, title, created_at, updated_at)
        values (cast(:user as uuid), cast(:course as uuid), :title,
                cast(:created as timestamptz), cast(:updated as timestamptz))
        returning id::text as id
        """,
        user=user_id,
        course=course_id,
        title=title,
        created=created_at,
        updated=updated_at,
    )


async def create_message(
    tx: Tx,
    *,
    conversation_id: str,
    user_id: str,
    role: str,
    content: str,
    context: Any = None,
    sources: Any = None,
    follow_ups: list[str] | None = None,
    self_test: Any = None,
    created_at: datetime = FIXED,
) -> str:
    """One message of a conversation, with the columns the read services map."""
    return await identifier(
        tx.conn,
        """
        insert into public.tutor_messages (
          conversation_id, user_id, role, content, context, sources, follow_ups, self_test,
          created_at
        ) values (
          cast(:conversation as uuid), cast(:user as uuid), cast(:role as public.message_role),
          :content, cast(:context as jsonb), cast(:sources as jsonb), cast(:follow_ups as text[]),
          cast(:self_test as jsonb), cast(:created as timestamptz)
        )
        returning id::text as id
        """,
        conversation=conversation_id,
        user=user_id,
        role=role,
        content=content,
        context=None if context is None else json.dumps(context, ensure_ascii=False),
        sources=json.dumps([] if sources is None else sources),
        follow_ups="{" + ",".join(follow_ups or []) + "}",
        self_test=None if self_test is None else json.dumps(self_test, ensure_ascii=False),
        created=created_at,
    )


async def create_global_quiz_slot(
    tx: Tx,
    *,
    user_id: str,
    formation_id: str,
    starts_at: str,
) -> None:
    """One planned global quiz of the day, which the wrong-answer verdict reads."""
    await tx.conn.execute(
        text(
            """
            insert into public.schedule_slots (
              user_id, formation_id, kind, title, starts_at, ends_at, status, created_by
            ) values (
              cast(:user as uuid), cast(:formation as uuid), 'global_quiz', 'Quiz global',
              cast(:starts as timestamptz), cast(:ends as timestamptz), 'planned', 'planner'
            )
            """
        ),
        {
            "user": user_id,
            "formation": formation_id,
            "starts": starts_at,
            "ends": starts_at.replace(":00Z", ":30Z"),
        },
    )


async def seed_tutor(
    tx: Tx,
    first_name: str = "Tuteur",
    *,
    title: str = "Formation du tuteur",
    with_conversation: bool = True,
    with_greeting: bool = True,
) -> dict[str, Any]:
    """A learner with one ready course, its chapter content and an open conversation."""
    user_id = await create_user(tx.conn, first_name)
    formation_id = await create_formation(tx.conn, user_id, title=title)
    module_id = await create_module(tx.conn, formation_id, 1)
    chapter_id = await create_chapter(tx.conn, formation_id, module_id)
    course_id = await create_course(tx, owner_id=user_id, formation_id=formation_id, module_id=module_id)
    notion_id = await create_notion(tx.conn, formation_id, module_id, chapter_id)
    section_id = await create_section(
        tx,
        course_id=course_id,
        owner_id=user_id,
        chapter_id=chapter_id,
        notion_ids=[notion_id],
        content_md="Every entry carries an account key and a side.",
    )
    await create_progress(tx, user_id=user_id, course_id=course_id, chapter_id=chapter_id, percent=40)
    resource_id = await create_resource(
        tx,
        owner_id=user_id,
        formation_id=formation_id,
        chapter_id=chapter_id,
        kind="note",
        title="Support de cours (PDF)",
        content_text="Every entry carries an account key.",
    )
    chunk_id = await create_chunk(
        tx,
        resource_id=resource_id,
        owner_id=user_id,
        formation_id=formation_id,
        chapter_id=chapter_id,
        body="Every accounting entry is a document.",
    )
    conversation_id = None
    greeting_id = None
    if with_conversation:
        conversation_id = await create_conversation_row(tx, user_id=user_id, course_id=course_id)
        if with_greeting:
            greeting_id = await create_message(
                tx,
                conversation_id=conversation_id,
                user_id=user_id,
                role="tutor",
                content="Bonjour.",
                context={"chapterId": chapter_id, "followUpLabels": {}},
                follow_ups=["rephrase", "example", "test_me"],
            )
    return {
        "user": user_id,
        "formation": formation_id,
        "module": module_id,
        "chapter": chapter_id,
        "course": course_id,
        "notion": notion_id,
        "section": section_id,
        "resource": resource_id,
        "chunk": chunk_id,
        "conversation": conversation_id,
        "greeting": greeting_id,
    }
