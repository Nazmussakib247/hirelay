"""Unit tests for settings validation."""

from __future__ import annotations

import pytest
from app.config import Settings
from pydantic import ValidationError


def test_cors_origins_parsed_to_list():
    s = Settings(cors_origins="http://a.com, http://b.com ,")
    assert s.cors_origin_list == ["http://a.com", "http://b.com"]


def test_derived_flags():
    s = Settings(groq_api_key="", smtp_user="", smtp_password="")
    assert s.ai_enabled is False
    assert s.email_enabled is False
    s2 = Settings(groq_api_key="k", smtp_user="u", smtp_password="p")
    assert s2.ai_enabled is True
    assert s2.email_enabled is True


def test_production_rejects_insecure_jwt_secret():
    with pytest.raises(ValidationError):
        Settings(environment="production", jwt_secret="short")


def test_production_rejects_wildcard_cors():
    with pytest.raises(ValidationError):
        Settings(
            environment="production",
            jwt_secret="a-sufficiently-long-random-secret-value-1234",
            cors_origins="*",
        )


def test_production_accepts_strong_config():
    s = Settings(
        environment="production",
        jwt_secret="a-sufficiently-long-random-secret-value-1234",
        cors_origins="https://app.example.com",
    )
    assert s.is_production is True
