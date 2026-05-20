from pydantic import BaseModel


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscribeRequest(BaseModel):
    endpoint: str
    keys: PushKeys


class PushUnsubscribeRequest(BaseModel):
    endpoint: str


class PushSubscriptionResponse(BaseModel):
    id: str
    endpoint: str
    created_at: str
    model_config = {"from_attributes": True}
