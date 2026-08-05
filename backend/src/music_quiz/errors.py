"""Single error envelope for the HTTP API.

Every error response has the shape::

    {"error": {"code": "<stable_code>", "message": "<safe message>"}}

Upstream exception text is never placed in the response body. Diagnostic
context is logged with sensitive OAuth values redacted.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("music_quiz")

REDACTED = "[redacted]"
SENSITIVE_KEYS = frozenset(
    {
        "code",
        "state",
        "verifier",
        "code_verifier",
        "access_token",
        "refresh_token",
        "authorization",
        "client_secret",
        "cookie",
    }
)


def redact(context: dict[str, Any]) -> dict[str, Any]:
    """Replace sensitive OAuth values so they never reach logs."""
    return {
        key: (REDACTED if key.lower() in SENSITIVE_KEYS else value)
        for key, value in context.items()
    }


class AppError(Exception):
    """Application error carrying a stable code and a client-safe message."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        log_context: dict[str, Any] | None = None,
        cause: BaseException | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.log_context = redact(log_context or {})
        self.cause = cause


def error_body(code: str, message: str) -> dict[str, dict[str, str]]:
    return {"error": {"code": code, "message": message}}


_STATUS_CODES = {
    400: "invalid_request",
    401: "unauthenticated",
    404: "not_found",
    409: "invalid_state_transition",
    429: "rate_limited",
    503: "not_configured",
}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        # Log the redacted context and the exception type only, never the text
        # of an upstream error, which may embed tokens or codes.
        logger.warning(
            "app_error code=%s status=%s cause=%s context=%s",
            exc.code,
            exc.status_code,
            type(exc.cause).__name__ if exc.cause else "none",
            exc.log_context,
        )
        return JSONResponse(status_code=exc.status_code, content=error_body(exc.code, exc.message))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, __: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=400,
            content=error_body("invalid_request", "The request payload is invalid."),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _STATUS_CODES.get(exc.status_code, "http_error")
        message = exc.detail if isinstance(exc.detail, str) else "Request failed."
        return JSONResponse(status_code=exc.status_code, content=error_body(code, message))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled_error type=%s", type(exc).__name__)
        return JSONResponse(
            status_code=500,
            content=error_body("internal_error", "An unexpected error occurred."),
        )
