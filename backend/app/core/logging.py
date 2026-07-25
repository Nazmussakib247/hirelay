"""Structured logging configuration.

Replaces ad-hoc ``print()`` statements with the standard ``logging`` module.
In production, logs are emitted as single-line JSON so they can be ingested by
log aggregators (CloudWatch, Loki, Datadog, ...). In development a compact
human-readable format is used instead.

A ``request_id`` context variable is injected into every log record so all log
lines produced while handling a single HTTP request can be correlated.
"""

from __future__ import annotations

import json
import logging
import sys
from contextvars import ContextVar
from datetime import datetime, timezone

# Populated by the request-context middleware; empty outside a request.
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


class RequestIdFilter(logging.Filter):
    """Attach the current request id to every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get()
        return True


class JsonFormatter(logging.Formatter):
    """Serialise log records as single-line JSON."""

    _RESERVED = {
        "args",
        "asctime",
        "created",
        "exc_info",
        "exc_text",
        "filename",
        "funcName",
        "levelname",
        "levelno",
        "lineno",
        "module",
        "msecs",
        "message",
        "msg",
        "name",
        "pathname",
        "process",
        "processName",
        "relativeCreated",
        "stack_info",
        "thread",
        "threadName",
        "taskName",
    }

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        # Include any structured extras passed via logger.info(..., extra={...}).
        for key, value in record.__dict__.items():
            if key not in self._RESERVED and key not in payload and key != "request_id":
                payload[key] = value
        return json.dumps(payload, default=str)


def configure_logging(level: str = "INFO", json_output: bool = True) -> None:
    """Configure the root logger. Idempotent — safe to call more than once."""
    root = logging.getLogger()
    root.setLevel(level)

    # Remove pre-existing handlers (e.g. uvicorn's default) to avoid dupes.
    for handler in list(root.handlers):
        root.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(RequestIdFilter())
    if json_output:
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s | %(levelname)-8s | %(name)s | [%(request_id)s] %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )
    root.addHandler(handler)

    # Align uvicorn's loggers with our configuration.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logging.getLogger(name).handlers = [handler]
        logging.getLogger(name).propagate = False


def get_logger(name: str) -> logging.Logger:
    """Return a module-level logger."""
    return logging.getLogger(name)
