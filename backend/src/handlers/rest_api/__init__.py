"""REST API Lambda handler package."""

from handlers.rest_api.app import app, lambda_handler

__all__ = ["app", "lambda_handler"]
