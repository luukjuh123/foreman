"""Tests for PushChannel — real pywebpush sending with mocked webpush call."""

from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import StaticPool
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base
from app.models.notification import Notification
from app.models.push_subscription import PushSubscription
from app.models.user import User
from app.services.notifications.channels import PushChannel

TEST_DB_URL = "sqlite+aiosqlite://"


@pytest_asyncio.fixture
async def db_with_data():
    engine = create_async_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with factory() as session:
        user = User(
            id=uuid.uuid4(),
            email="worker@example.com",
            name="Jan de Vries",
            hashed_password="hashed",
            role="user",
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

        sub = PushSubscription(
            user_id=user.id,
            endpoint="https://fcm.googleapis.com/fcm/send/test123",
            p256dh="BNcRdreALRFXTkOO",
            auth="tBHItJI5",
        )
        session.add(sub)
        await session.commit()

        notification = Notification(
            user_id=user.id,
            type="project_update",
            title="Project updated",
            body="Phase 2 is done",
            channels_dispatched=[],
        )
        session.add(notification)
        await session.commit()
        await session.refresh(notification)

        yield factory, user, sub, notification

    await engine.dispose()


@pytest.mark.asyncio
async def test_push_channel_calls_webpush(db_with_data):
    """PushChannel.send calls pywebpush webpush for each subscription."""
    factory, user, sub, notification = db_with_data

    async with factory() as session:
        channel = PushChannel(db=session)

        with patch(
            "app.services.notifications.channels.webpush",
            return_value=MagicMock(status_code=201),
        ) as mock_wp:
            await channel.send(notification, user)

        mock_wp.assert_called_once()
        call_kwargs = mock_wp.call_args
        assert call_kwargs is not None
        # subscription_info should contain the endpoint
        sub_info = call_kwargs[1].get("subscription_info") or call_kwargs[0][0]
        assert sub.endpoint in str(sub_info)


@pytest.mark.asyncio
async def test_push_channel_no_subscriptions_is_noop(db_with_data):
    """PushChannel.send silently succeeds when user has no subscriptions."""
    factory, _, _sub, _notif = db_with_data
    # Create a different user with no subscriptions
    async with factory() as session:
        other_user = User(
            id=uuid.uuid4(),
            email="nodevice@example.com",
            name="No Device",
            hashed_password="hashed",
            role="user",
        )
        session.add(other_user)
        await session.commit()
        await session.refresh(other_user)

        notif = Notification(
            user_id=other_user.id,
            type="test",
            title="Hello",
            body="",
            channels_dispatched=[],
        )
        session.add(notif)
        await session.commit()
        await session.refresh(notif)

        channel = PushChannel(db=session)

        with patch("app.services.notifications.channels.webpush") as mock_wp:
            await channel.send(notif, other_user)

        mock_wp.assert_not_called()


@pytest.mark.asyncio
async def test_push_channel_deletes_expired_subscription(db_with_data):
    """PushChannel.send deletes subscription when webpush returns 410 Gone."""
    from sqlalchemy import select

    factory, user, sub, notification = db_with_data

    gone_response = MagicMock()
    gone_response.status_code = 410

    async with factory() as session:
        channel = PushChannel(db=session)

        with patch(
            "app.services.notifications.channels.webpush",
            return_value=gone_response,
        ):
            await channel.send(notification, user)

    # Subscription should be deleted
    async with factory() as session:
        result = await session.execute(
            select(PushSubscription).where(PushSubscription.id == sub.id)
        )
        assert result.scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_push_channel_unconfigured_vapid_is_noop():
    """PushChannel.send is a no-op (logs only) when VAPID keys are not configured."""
    from sqlalchemy import StaticPool
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

    engine = create_async_engine(
        TEST_DB_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)

    user_id = uuid.uuid4()
    async with factory() as session:
        user = User(
            id=user_id,
            email="nopush@example.com",
            name="No Push",
            hashed_password="hashed",
            role="user",
        )
        session.add(user)

        sub = PushSubscription(
            user_id=user_id,
            endpoint="https://push.example.com/sub/xyz",
            p256dh="key",
            auth="auth",
        )
        session.add(sub)

        notif = Notification(
            user_id=user_id,
            type="test",
            title="Hi",
            body="",
            channels_dispatched=[],
        )
        session.add(notif)
        await session.commit()
        await session.refresh(notif)

        channel = PushChannel(db=session)

        # When VAPID keys are empty, should not raise and should not call webpush
        with patch("app.services.notifications.channels.settings") as mock_settings:
            mock_settings.vapid_private_key = ""
            mock_settings.vapid_public_key = ""
            mock_settings.vapid_claim_email = "mailto:info@foreman.local"

            with patch("app.services.notifications.channels.webpush") as mock_wp:
                await channel.send(notif, user)

            mock_wp.assert_not_called()

    await engine.dispose()
