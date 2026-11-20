"""Configuration and constants for Watch Party backend.

Single source of truth for constants matches docs/architecture.md §3.
"""

from os import getenv

# Platform limits & defaults (architecture.md §3.2)
DEFAULT_MAX_PARTICIPANTS: int = 10
MIN_MAX_PARTICIPANTS: int = 2
MAX_MAX_PARTICIPANTS: int = 10

# Read platform max participants from environment (varies 2..10)
ROOM_MAX_PARTICIPANTS: int = int(getenv("ROOM_MAX_PARTICIPANTS", str(DEFAULT_MAX_PARTICIPANTS)))

# TTLs & Lifetimes in seconds
ROOM_TOKEN_TTL_SEC: int = 4 * 3600  # 4 hours (14400s)
ROOM_TOKEN_REFRESH_WINDOW_SEC: int = 30 * 60  # 30 minutes
ROOM_LIFETIME_SEC: int = 24 * 3600  # 24 hours (86400s)
ROOM_DATA_RETENTION_SEC: int = 24 * 3600  # 24 hours retention after closed
MEDIA_COOKIES_TTL_SEC: int = 2 * 3600  # 2 hours (7200s)
MEDIA_COOKIES_REFRESH_SEC: int = 90 * 60  # 90 minutes
LIVEKIT_TOKEN_TTL_SEC: int = 10 * 60  # 10 minutes (600s)
WS_HEARTBEAT_INTERVAL_SEC: int = 5 * 60  # 5 minutes (300s)

# Snapshot constants
MAX_SNAPSHOT_CHAT_MESSAGES: int = 20

# Payload limits
MAX_CLIENT_MSG_BYTES: int = 4 * 1024  # 4 KB
MAX_SERVER_MSG_BYTES: int = 64 * 1024  # 64 KB

# Environment & Infrastructure configuration
ENV: str = getenv("ENV", "prod")
AWS_REGION: str = getenv("AWS_REGION", "ap-southeast-1")
PROJECT_NAME: str = getenv("PROJECT_NAME", "watchparty")

# Table names
MAIN_TABLE_NAME: str = getenv("MAIN_TABLE_NAME", f"{PROJECT_NAME}-{ENV}-main")
CONNECTIONS_TABLE_NAME: str = getenv("CONNECTIONS_TABLE_NAME", f"{PROJECT_NAME}-{ENV}-connections")

# Domains
PARENT_DOMAIN: str = getenv("PARENT_DOMAIN", "chescloud.my.id")
APP_DOMAIN: str = getenv("APP_DOMAIN", f"{PROJECT_NAME}.{PARENT_DOMAIN}")
API_DOMAIN: str = getenv("API_DOMAIN", f"api.{APP_DOMAIN}")
WS_DOMAIN: str = getenv("WS_DOMAIN", f"ws.{APP_DOMAIN}")
RTC_DOMAIN: str = getenv("RTC_DOMAIN", f"rtc.{APP_DOMAIN}")

# URLs
APP_URL: str = f"https://{APP_DOMAIN}"
API_URL: str = f"https://{API_DOMAIN}"
WS_URL: str = f"wss://{WS_DOMAIN}"
RTC_URL: str = f"wss://{RTC_DOMAIN}"

# Media delivery and video chat (non-secret settings)
# Signed cookies are scoped to the CloudFront domain (the app domain, architecture.md §9.5).
MEDIA_DOMAIN: str = getenv("CLOUDFRONT_DOMAIN", APP_DOMAIN)
CLOUDFRONT_KEY_PAIR_ID: str = getenv("CLOUDFRONT_KEY_PAIR_ID", "")
LIVEKIT_URL: str = getenv("LIVEKIT_URL", RTC_URL)

# Secrets are never read here. core.secret_store loads them from SSM Parameter Store
# using the *_NAME environment variables set by Terraform.

COGNITO_USER_POOL_ID: str = getenv("COGNITO_USER_POOL_ID", "")
COGNITO_CLIENT_ID: str = getenv("COGNITO_CLIENT_ID", "")
