import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    endpoint = Column(String, nullable=False, unique=True)
    p256dh_key = Column(String, nullable=False)
    auth_key = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
