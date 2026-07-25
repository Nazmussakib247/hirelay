"""Domain exceptions and centralised exception handlers.

The original code raised ``HTTPException`` inline everywhere and, in several
places, leaked raw database/SMTP error strings straight to the client. Here we
define a small hierarchy of domain errors and register handlers that produce a
consistent JSON error envelope while logging the real detail server-side.
"""

from __future__ import annotations

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import get_logger

logger = get_logger(__name__)


class AppError(Exception):
    """Base class for expected, handled application errors."""

    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = "app_error"

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        code: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        if code is not None:
            self.code = code


class NotFoundError(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"


class ValidationError(AppError):
    status_code = 422  # Unprocessable Content
    code = "validation_error"


class AuthError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "unauthorized"


class PermissionError(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "forbidden"


class ConflictError(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "conflict"


def _envelope(code: str, message: str, *, details: object | None = None) -> dict:
    body: dict = {"error": {"code": code, "message": message}}
    if details is not None:
        body["error"]["details"] = details
    return body


def register_exception_handlers(app: FastAPI) -> None:
    """Attach all exception handlers to the FastAPI app."""

    @app.exception_handler(AppError)
    async def _app_error_handler(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope(exc.code, exc.message),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_exception_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope("http_error", str(exc.detail)),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        # ``exc.errors()`` is NOT plain-JSON safe. Pydantic v2 puts the original
        # exception object in ``ctx`` for any error raised by a validator (e.g.
        # ``raise ValueError`` in JobCreate._validate_weights), and
        # ``JSONResponse`` serialises with stdlib ``json.dumps``, which then
        # dies with "Object of type ValueError is not JSON serializable" —
        # inside the error handler, turning a 422 into a 500.
        # ``jsonable_encoder`` coerces those objects to strings first.
        # Regression-locked by tests/unit/test_validation_errors.py.
        return JSONResponse(
            status_code=422,
            content=_envelope(
                "validation_error",
                "Request validation failed",
                details=jsonable_encoder(exc.errors()),
            ),
        )

    @app.exception_handler(Exception)
    async def _unhandled_handler(_: Request, exc: Exception) -> JSONResponse:
        # Never leak internal detail to the client; log the real cause.
        logger.exception("Unhandled exception: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_envelope(
                "internal_error",
                "An internal error occurred. Please try again later.",
            ),
        )
