"""Standard error definitions for Watch Party backend.

Error codes match components/schemas/ErrorCode in openapi.yaml and ws-messages.md.
"""

from typing import Any


class WatchPartyError(Exception):
    """Base exception for all domain errors."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: dict[str, Any] | None = None,
        retry_after_sec: int | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        self.retry_after_sec = retry_after_sec

    def to_dict(self) -> dict[str, Any]:
        """Format error payload according to OpenAPI Error schema."""
        err: dict[str, Any] = {
            "code": self.code,
            "message": self.message,
        }
        if self.details:
            err["details"] = self.details
        if self.retry_after_sec is not None:
            err["retryAfterSec"] = self.retry_after_sec
        return {"error": err}


class ValidationError(WatchPartyError):
    def __init__(
        self,
        message: str = "Input is invalid.",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            code="VALIDATION_ERROR",
            message=message,
            status_code=400,
            details=details,
        )


class UnauthorizedError(WatchPartyError):
    def __init__(self, message: str = "Authentication required or token expired.") -> None:
        super().__init__(
            code="UNAUTHORIZED",
            message=message,
            status_code=401,
        )


class ForbiddenError(WatchPartyError):
    def __init__(self, message: str = "Action not allowed with current permissions.") -> None:
        super().__init__(
            code="FORBIDDEN",
            message=message,
            status_code=403,
        )


class NotFoundError(WatchPartyError):
    def __init__(self, message: str = "Requested resource not found.") -> None:
        super().__init__(
            code="NOT_FOUND",
            message=message,
            status_code=404,
        )


class RoomFullError(WatchPartyError):
    def __init__(
        self,
        message: str = "All guest seats (maxParticipants - 1) are taken; 1 seat is reserved for the host.",
    ) -> None:
        super().__init__(
            code="ROOM_FULL",
            message=message,
            status_code=409,
        )


class RoomClosedError(WatchPartyError):
    def __init__(self, message: str = "Room has ended or expired.") -> None:
        super().__init__(
            code="ROOM_CLOSED",
            message=message,
            status_code=410,
        )


class VersionConflictError(WatchPartyError):
    def __init__(self, message: str = "Playback state version conflict.") -> None:
        super().__init__(
            code="VERSION_CONFLICT",
            message=message,
            status_code=409,
        )


class RateLimitedError(WatchPartyError):
    def __init__(
        self,
        message: str = "Too many requests. Please slow down.",
        retry_after_sec: int = 10,
    ) -> None:
        super().__init__(
            code="RATE_LIMITED",
            message=message,
            status_code=429,
            retry_after_sec=retry_after_sec,
        )


class PayloadTooLargeError(WatchPartyError):
    def __init__(self, message: str = "Message exceeds maximum allowed payload size.") -> None:
        super().__init__(
            code="PAYLOAD_TOO_LARGE",
            message=message,
            status_code=413,
        )


class UnsupportedVersionError(WatchPartyError):
    def __init__(self, message: str = "Unsupported protocol version.") -> None:
        super().__init__(
            code="UNSUPPORTED_VERSION",
            message=message,
            status_code=400,
        )


class InternalError(WatchPartyError):
    def __init__(self, message: str = "An unexpected server error occurred.") -> None:
        super().__init__(
            code="INTERNAL_ERROR",
            message=message,
            status_code=500,
        )
