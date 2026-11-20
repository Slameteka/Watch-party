"""CloudFront signed cookies with a custom policy.

A custom policy is required because the resource uses a wildcard
(``https://<domain>/media/<mediaId>/*``); canned policies cannot.

The signature uses RSA with SHA-1, which is CloudFront's default when the optional
``CloudFront-Hash-Algorithm`` cookie is absent. Switching to SHA-256 needs that fourth
cookie and therefore a contract change (openapi.yaml lists exactly three cookies).
Reference: AWS CloudFront Developer Guide, "Set signed cookies using a custom policy".
"""

import base64
import json
from functools import cache

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

COOKIE_POLICY = "CloudFront-Policy"
COOKIE_SIGNATURE = "CloudFront-Signature"
COOKIE_KEY_PAIR_ID = "CloudFront-Key-Pair-Id"

_CLOUDFRONT_B64 = str.maketrans("+=/", "-_~")


def cloudfront_b64encode(data: bytes) -> str:
    """Base64 with the characters CloudFront requires (+ -> -, = -> _, / -> ~)."""
    return base64.b64encode(data).decode("ascii").translate(_CLOUDFRONT_B64)


def media_resource(domain: str, media_id: str) -> str:
    return f"https://{domain}/media/{media_id}/*"


def build_policy(resource: str, expires_at_sec: int) -> bytes:
    """Custom policy JSON without whitespace, as CloudFront requires."""
    policy = {
        "Statement": [
            {
                "Resource": resource,
                "Condition": {"DateLessThan": {"AWS:EpochTime": expires_at_sec}},
            }
        ]
    }
    return json.dumps(policy, separators=(",", ":")).encode("utf-8")


@cache
def _load_private_key(private_key_pem: str) -> rsa.RSAPrivateKey:
    key = serialization.load_pem_private_key(private_key_pem.encode("utf-8"), password=None)
    if not isinstance(key, rsa.RSAPrivateKey):
        raise ValueError("CloudFront signing key must be an RSA private key.")
    return key


def sign_cookies(
    resource: str, expires_at_sec: int, key_pair_id: str, private_key_pem: str
) -> dict[str, str]:
    """Returns the three CloudFront cookie values, keyed by cookie name."""
    policy = build_policy(resource, expires_at_sec)
    signature = _load_private_key(private_key_pem).sign(policy, padding.PKCS1v15(), hashes.SHA1())
    return {
        COOKIE_POLICY: cloudfront_b64encode(policy),
        COOKIE_SIGNATURE: cloudfront_b64encode(signature),
        COOKIE_KEY_PAIR_ID: key_pair_id,
    }
