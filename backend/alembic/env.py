"""Alembic migration environment.

Runtime uses asyncpg; migrations run through a synchronous SQLAlchemy engine
(psycopg) purely to apply DDL. The database URL comes from the DATABASE_URL
environment variable so no credentials live in version control.
"""
from __future__ import annotations

import os
import re
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "postgresql://hruser:hrpassword@localhost:5432/hrdb")
    # Force the psycopg (v3) sync driver for migrations regardless of the
    # runtime asyncpg URL scheme.
    url = re.sub(r"^postgresql\+asyncpg://", "postgresql+psycopg://", url)
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    section = config.get_section(config.config_ini_section, {})
    section["sqlalchemy.url"] = _database_url()
    connectable = engine_from_config(
        section, prefix="sqlalchemy.", poolclass=pool.NullPool
    )
    with connectable.connect() as connection:
        context.configure(connection=connection)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
