"""Application configuration.

Centralised, typed settings loaded from environment variables (and an optional
``.env`` file) via ``pydantic-settings``. This replaces the scattered
``os.getenv(...)`` calls that were previously spread across the codebase and
adds validation so the application fails fast on misconfiguration instead of
silently running with insecure defaults.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Sentinel value shipped in .env.example — must never be used in production.
_INSECURE_JWT_DEFAULT = "hr-secret-key-change-in-production-2024"


class Settings(BaseSettings):
    """Strongly-typed application settings.

    All values are sourced from environment variables. Names are
    case-insensitive; e.g. ``JWT_SECRET`` maps to ``jwt_secret``.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Runtime ────────────────────────────────────────────────────────────
    environment: Literal["development", "staging", "production"] = "development"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    log_json: bool = True

    # ── Database ───────────────────────────────────────────────────────────
    database_url: str = "postgresql://hruser:hrpassword@db:5432/hrdb"
    db_pool_min_size: int = 2
    db_pool_max_size: int = 10

    # ── Auth / JWT ─────────────────────────────────────────────────────────
    jwt_secret: str = _INSECURE_JWT_DEFAULT
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 8
    # Seed password for the bootstrap admin account. Empty → the well-known
    # dev fallback is seeded with a FORCED password change on first login.
    admin_initial_password: str = ""

    # ── Matching engine ────────────────────────────────────────────────────
    groq_api_key: str = ""
    # Groq decommissioned llama3-8b-8192 (and llama3-70b-8192) in 2025. The
    # current free instant model is llama-3.1-8b-instant; using the retired
    # name makes every AI call 400 and silently fall back to non-AI scoring,
    # so the feature would look enabled but never run. Override via GROQ_MODEL.
    groq_model: str = "llama-3.1-8b-instant"
    # Data-driven default: on the 50-sample benchmark, shortlisted scores fall
    # in 62-92 and rejected in 0-47 — a clean gap at ~47-62. A threshold of 55
    # sits in that gap and yields 100% accuracy; the previous default of 70 sat
    # above most qualified candidates and rejected them (see docs/ACCURACY.md).
    match_threshold: int = Field(default=55, ge=0, le=100)

    # ── Email (SMTP) ───────────────────────────────────────────────────────
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    hr_from_name: str = "HR Team"

    # ── Interviews / meetings ──────────────────────────────────────────────
    # Jitsi Meet rooms are real and require no credentials: the room is
    # created the moment the first participant opens the link. This replaces
    # the previous fake meet.google.com links (random codes with no meeting
    # behind them).
    meet_base_url: str = "https://meet.jit.si"
    interview_lead_days: int = Field(default=3, ge=1, le=30)
    interview_hour: int = Field(default=10, ge=0, le=23)
    timezone: str = "Asia/Dhaka"

    # ── Uploads ────────────────────────────────────────────────────────────
    max_upload_mb: int = Field(default=10, ge=1, le=100)

    # ── Integrations ───────────────────────────────────────────────────────
    n8n_webhook_url: str = "http://n8n:5678/webhook/match-result"
    # Fired after every CV upload so the n8n master workflow (Branch A) can
    # auto-run the match. Empty string disables the trigger.
    n8n_cv_webhook_url: str = ""
    apply_url: str = "careers@yourcompany.com"
    # Public base URL of the deployed frontend. Used to build the candidate
    # apply link embedded in job announcements: {public_base_url}/apply.html?job=<id>.
    # For a local demo this is the frontend container's published address; for a
    # real deployment set it to your public domain so Telegram/LinkedIn readers
    # can actually reach the apply page.
    public_base_url: str = "http://localhost:3000"
    # Contact address shown in every job announcement so candidates who don't
    # use the apply link still have a way to reach HR.
    contact_email: str = "sakib.cse.nubtk@gmail.com"

    # ── Proxy ──────────────────────────────────────────────────────────────
    # Trust X-Forwarded-For when resolving the client IP for rate limiting.
    # Enable ONLY when the app genuinely sits behind a trusted reverse proxy
    # (the bundled nginx does). If enabled while the app is directly reachable,
    # a client can spoof the header and evade per-IP limits entirely.
    trust_proxy_headers: bool = False

    # ── CORS ───────────────────────────────────────────────────────────────
    # Comma-separated list of allowed origins. In production a wildcard is
    # rejected because it cannot be combined with credentials safely.
    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    # ── Job-board platform credentials (all optional) ──────────────────────
    linkedin_access_token: str = ""
    linkedin_org_id: str = ""
    telegram_bot_token: str = ""
    telegram_channel_id: str = ""
    twitter_api_key: str = ""
    twitter_api_secret: str = ""
    twitter_access_token: str = ""
    twitter_access_secret: str = ""
    bdjobs_username: str = ""
    bdjobs_password: str = ""
    job_webhook_url: str = ""

    # ── Derived helpers ────────────────────────────────────────────────────
    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def ai_enabled(self) -> bool:
        return bool(self.groq_api_key)

    @property
    def email_enabled(self) -> bool:
        return bool(self.smtp_user and self.smtp_password)

    # ── Validation ─────────────────────────────────────────────────────────
    @field_validator("cors_origins")
    @classmethod
    def _strip_cors(cls, v: str) -> str:
        return v.strip()

    @model_validator(mode="after")
    def _enforce_production_safety(self) -> Settings:
        """Refuse to boot in production with insecure defaults."""
        if self.is_production:
            if self.jwt_secret == _INSECURE_JWT_DEFAULT or len(self.jwt_secret) < 32:
                raise ValueError(
                    "JWT_SECRET must be a unique random value of at least 32 "
                    "characters in production."
                )
            if "*" in self.cors_origin_list:
                raise ValueError(
                    "CORS_ORIGINS cannot be a wildcard (*) in production when "
                    "credentials are enabled."
                )
        return self


@lru_cache
def get_settings() -> Settings:
    """Return a cached ``Settings`` instance (one per process)."""
    return Settings()
