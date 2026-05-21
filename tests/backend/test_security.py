"""Tests for the security module — password hashing and JWT tokens."""

from datetime import UTC, datetime, timedelta

import pytest
from jose import jwt
from jose.exceptions import ExpiredSignatureError, JWTError

from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


class TestHashPassword:
    def test_returns_bcrypt_hash(self):
        hashed = hash_password("secret123")
        assert hashed.startswith("$2b$") or hashed.startswith("$2a$")

    def test_different_salts_each_call(self):
        h1 = hash_password("same-password")
        h2 = hash_password("same-password")
        assert h1 != h2


class TestVerifyPassword:
    def test_correct_password_returns_true(self):
        hashed = hash_password("correct-horse")
        assert verify_password("correct-horse", hashed) is True

    def test_wrong_password_returns_false(self):
        hashed = hash_password("correct-horse")
        assert verify_password("wrong-horse", hashed) is False


class TestCreateAccessToken:
    def test_valid_jwt_with_correct_claims(self):
        token = create_access_token("user-123")
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        assert payload["sub"] == "user-123"
        assert payload["type"] == "access"
        assert "exp" in payload

    def test_expiry_is_in_the_future(self):
        token = create_access_token("user-456")
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        exp = datetime.fromtimestamp(payload["exp"], tz=UTC)
        assert exp > datetime.now(UTC)


class TestCreateRefreshToken:
    def test_valid_jwt_with_correct_claims(self):
        token = create_refresh_token("user-789")
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        assert payload["sub"] == "user-789"
        assert payload["type"] == "refresh"
        assert "exp" in payload

    def test_expiry_longer_than_access_token(self):
        access = create_access_token("u")
        refresh = create_refresh_token("u")
        a_exp = jwt.decode(access, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])["exp"]
        r_exp = jwt.decode(refresh, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])["exp"]
        assert r_exp > a_exp


class TestDecodeToken:
    def test_decodes_valid_access_token(self):
        token = create_access_token("decode-test")
        payload = decode_token(token)
        assert payload["sub"] == "decode-test"
        assert payload["type"] == "access"

    def test_decodes_valid_refresh_token(self):
        token = create_refresh_token("decode-refresh")
        payload = decode_token(token)
        assert payload["sub"] == "decode-refresh"
        assert payload["type"] == "refresh"

    def test_rejects_expired_token(self):
        expired = jwt.encode(
            {"sub": "x", "exp": datetime.now(UTC) - timedelta(seconds=1), "type": "access"},
            settings.jwt_secret_key,
            algorithm=settings.jwt_algorithm,
        )
        with pytest.raises(ExpiredSignatureError):
            decode_token(expired)

    def test_rejects_tampered_token(self):
        token = create_access_token("tamper-test")
        parts = token.rsplit(".", 1)
        tampered = parts[0] + "." + ("X" * len(parts[1]))
        with pytest.raises(JWTError):
            decode_token(tampered)

    def test_rejects_wrong_secret(self):
        token = jwt.encode(
            {"sub": "x", "exp": datetime.now(UTC) + timedelta(hours=1), "type": "access"},
            "totally-wrong-key",
            algorithm=settings.jwt_algorithm,
        )
        with pytest.raises(JWTError):
            decode_token(token)

    def test_refresh_token_rejected_as_access(self):
        """decode_token validates the type claim — refresh tokens are rejected when access is expected."""
        refresh = create_refresh_token("type-test")
        with pytest.raises(ValueError, match="Token type mismatch"):
            decode_token(refresh)
