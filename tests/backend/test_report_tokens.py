"""Tests for shareable report-link token signing."""

import uuid

import pytest

from app.services.reports.tokens import (
    InvalidReportToken,
    sign_report_token,
    verify_report_token,
)


def test_sign_and_verify_roundtrip() -> None:
    report_id = uuid.uuid4()
    token = sign_report_token(report_id, secret="topsecret")
    assert isinstance(token, str)
    assert "." in token

    recovered = verify_report_token(token, secret="topsecret")
    assert recovered == report_id


def test_tokens_for_different_ids_differ() -> None:
    a = sign_report_token(uuid.uuid4(), secret="s")
    b = sign_report_token(uuid.uuid4(), secret="s")
    assert a != b


def test_tampered_payload_rejected() -> None:
    token = sign_report_token(uuid.uuid4(), secret="s")
    _payload, sig = token.split(".")
    other = sign_report_token(uuid.uuid4(), secret="s")
    other_payload = other.split(".")[0]
    tampered = f"{other_payload}.{sig}"
    with pytest.raises(InvalidReportToken):
        verify_report_token(tampered, secret="s")


def test_wrong_secret_rejected() -> None:
    token = sign_report_token(uuid.uuid4(), secret="right")
    with pytest.raises(InvalidReportToken):
        verify_report_token(token, secret="wrong")


def test_malformed_token_rejected() -> None:
    with pytest.raises(InvalidReportToken):
        verify_report_token("not-a-real-token", secret="s")
    with pytest.raises(InvalidReportToken):
        verify_report_token("a.b.c", secret="s")
    with pytest.raises(InvalidReportToken):
        verify_report_token("", secret="s")


def test_signature_is_urlsafe_b64() -> None:
    token = sign_report_token(uuid.uuid4(), secret="s")
    payload, sig = token.split(".")
    allowed = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
    assert set(payload) <= allowed
    assert set(sig) <= allowed
