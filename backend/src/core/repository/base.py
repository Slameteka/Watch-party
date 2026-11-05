"""Base DynamoDB client utilities and helper functions."""

import time

import boto3
from botocore.exceptions import ClientError

from core.config import AWS_REGION, CONNECTIONS_TABLE_NAME, MAIN_TABLE_NAME

# Global cached DynamoDB resource
_dynamodb_resource = None


def get_dynamodb_resource():
    """Returns a shared, cached boto3 DynamoDB resource."""
    global _dynamodb_resource
    if _dynamodb_resource is None:
        _dynamodb_resource = boto3.resource("dynamodb", region_name=AWS_REGION)
    return _dynamodb_resource


def get_main_table():
    """Returns Table resource for main table."""
    return get_dynamodb_resource().Table(MAIN_TABLE_NAME)


def get_connections_table():
    """Returns Table resource for connections table."""
    return get_dynamodb_resource().Table(CONNECTIONS_TABLE_NAME)


def current_epoch_ms() -> int:
    """Current epoch time in milliseconds."""
    return int(time.time() * 1000)


def current_epoch_sec() -> int:
    """Current epoch time in seconds."""
    return int(time.time())


def is_conditional_check_failed(e: ClientError) -> bool:
    """Checks if ClientError is a ConditionalCheckFailedException or TransactionCanceledException due to condition."""
    code = e.response.get("Error", {}).get("Code")
    if code == "ConditionalCheckFailedException":
        return True
    if code == "TransactionCanceledException":
        cancellation_reasons = e.response.get("CancellationReasons", [])
        for reason in cancellation_reasons:
            if reason.get("Code") == "ConditionalCheckFailed":
                return True
    return False
