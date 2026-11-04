"""Common pytest fixtures for unit and integration tests."""

import os

# Ensure standard test environment variables are set before importing core
os.environ["ENV"] = "test"
os.environ["ROOM_TOKEN_SECRET"] = "super-secret-test-key-32-chars-long!"
os.environ["MAIN_TABLE_NAME"] = "watchparty-test-main"
os.environ["CONNECTIONS_TABLE_NAME"] = "watchparty-test-connections"
os.environ["ROOM_MAX_PARTICIPANTS"] = "10"
os.environ["APP_DOMAIN"] = "watchparty.chescloud.my.id"
os.environ["PARENT_DOMAIN"] = "chescloud.my.id"
