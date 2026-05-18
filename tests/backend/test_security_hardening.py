"""Tests for decode_token type validation and startup secret guard."""

from unittest.mock import patch

import pytest
from jose import jwt

from app.core.config import Settings, settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
)


class TestDecodeTokenTypeValidation:
    def test_access_token_accepted_with_default(self):
        token = create_access_token("user-1")
        payload = decode_token(token)
        assert payload["sub"] == "user-1"

    def test_access_token_accepted_with_explicit_access(self):
        token = create_access_token("user-2")
        payload = decode_token(token, expected_type="access")
        assert payload["sub"] == "user-2"

    def test_refresh_token_accepted_with_explicit_refresh(self):
        token = create_refresh_token("user-3")
        payload = decode_token(token, expected_type="refresh")
        assert payload["sub"] == "user-3"

    def test_refresh_token_rejected_as_access(self):
        token = create_refresh_token("user-4")
        with pytest.raises(ValueError, match="Token type mismatch"):
            decode_token(token)  # default expected_type="access"

    def test_access_token_rejected_as_refresh(self):
        token = create_access_token("user-5")
        with pytest.raises(ValueError, match="Token type mismatch"):
            decode_token(token, expected_type="refresh")


class TestStartupSecretGuard:
    def test_raises_when_default_secret_and_not_debug(self):
        from app.core.security import _check_secret

        cfg = Settings(jwt_secret_key="change-me-in-production", debug=False)
        with pytest.raises(RuntimeError, match="jwt_secret_key"):
            _check_secret(cfg)

    def test_no_raise_when_debug_true(self):
        from app.core.security import _check_secret

        cfg = Settings(jwt_secret_key="change-me-in-production", debug=True)
        _check_secret(cfg)  # should not raise

    def test_no_raise_when_secret_changed(self):
        from app.core.security import _check_secret

        cfg = Settings(jwt_secret_key="my-real-production-secret", debug=False)
        _check_secret(cfg)  # should not raise
