"""[SPEC-2205] One-click unsubscribe: the signed token, the channel switch and the HTML pages.

The POST accepts the token alone, disables `notification_settings.channel_email` of that learner with
the owner role and never reveals the address. An altered token answers `UNSUBSCRIBE_TOKEN_INVALID`
and changes nothing (CL-5).
"""

from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.engagement_deps import EMAIL_LINK_SECRET, engagement_deps
from factories.identity_support import create_user
from learny.engagement.application import unsubscribe as unsubscribe_service
from learny.engagement.infrastructure.unsubscribe import create_unsubscribe_token
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2205")


async def channel_email(tx: Any, user_id: str) -> bool:
    result = await tx.conn.execute(
        text("select channel_email from public.notification_settings where user_id = cast(:user as uuid)"),
        {"user": user_id},
    )
    return bool(result.mappings().one()["channel_email"])


async def test_the_form_page_is_served_before_any_change(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Hugo", timezone="Europe/Paris")
        engagement_deps(tx)
        token = create_unsubscribe_token(EMAIL_LINK_SECRET, user)

        page = unsubscribe_service.unsubscribe_form(token)

        assert page.status == 200
        assert "unsubscribe-confirm" in page.html
        assert token in page.html
        assert await channel_email(tx, user) is True

    await rolled_back(database, run)


async def test_an_altered_token_answers_the_invalid_page(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Iris", timezone="Europe/Paris")
        token = create_unsubscribe_token(EMAIL_LINK_SECRET, user)
        altered = f"{token[:-2]}AA"

        page = unsubscribe_service.unsubscribe_invalid()
        with pytest.raises(AppError) as raised:
            await unsubscribe_service.unsubscribe_by_token(engagement_deps(tx), altered)

        assert page.status == 400
        assert raised.value.code == "UNSUBSCRIBE_TOKEN_INVALID"
        assert await channel_email(tx, user) is True

    await rolled_back(database, run)


async def test_unsubscribe_disables_only_that_learners_email_channel(database: Database) -> None:
    async def run(tx: Any) -> None:
        alice = await create_user(tx.conn, "Alice", timezone="Europe/Paris")
        bob = await create_user(tx.conn, "Bob", timezone="Europe/Paris")
        deps = engagement_deps(tx)

        result = await unsubscribe_service.unsubscribe_by_token(
            deps, create_unsubscribe_token(EMAIL_LINK_SECRET, alice)
        )

        assert result == {"ok": True}
        assert await channel_email(tx, alice) is False
        assert await channel_email(tx, bob) is True

    await rolled_back(database, run)


async def test_a_replay_is_accepted_without_a_second_effect(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Jules", timezone="Europe/Paris")
        deps = engagement_deps(tx)
        token = create_unsubscribe_token(EMAIL_LINK_SECRET, user)

        first = await unsubscribe_service.unsubscribe_by_token(deps, token)
        second = await unsubscribe_service.unsubscribe_by_token(deps, token)

        assert first == second == {"ok": True}
        assert await channel_email(tx, user) is False

    await rolled_back(database, run)


async def test_a_token_of_a_deleted_account_is_expired(database: Database) -> None:
    async def run(tx: Any) -> None:
        deps = engagement_deps(tx)
        ghost = "11111111-1111-4111-8111-111111111111"
        token = create_unsubscribe_token(EMAIL_LINK_SECRET, ghost)

        assert unsubscribe_service.read_unsubscribe_token(deps, token) == ghost
        with pytest.raises(AppError) as raised:
            await unsubscribe_service.unsubscribe_by_token(deps, token)

        assert raised.value.code == "UNSUBSCRIBE_TOKEN_INVALID"

    await rolled_back(database, run)


async def test_the_token_is_read_with_the_server_secret(database: Database) -> None:
    async def run(tx: Any) -> None:
        user = await create_user(tx.conn, "Kelly", timezone="Europe/Paris")
        deps = engagement_deps(tx)
        token = create_unsubscribe_token("another-secret", user)

        assert unsubscribe_service.read_unsubscribe_token(deps, token) is None
        assert (
            unsubscribe_service.read_unsubscribe_token(
                deps, create_unsubscribe_token(EMAIL_LINK_SECRET, user)
            )
            == user
        )

    await rolled_back(database, run)
