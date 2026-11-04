"""Local HTTP Development Server for Watch Party REST API.

Runs on http://localhost:8000 using a local mock DynamoDB (moto)
so you can test all endpoints hands-on with curl or Postman without needing AWS!

Usage:
    cd backend
    uv run python local_server.py
"""

import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

# Ensure local test environment
os.environ["ENV"] = "local"
os.environ["ROOM_TOKEN_SECRET"] = "local-secret-key-32-characters-minimum!"
os.environ["MAIN_TABLE_NAME"] = "watchparty-local-main"
os.environ["CONNECTIONS_TABLE_NAME"] = "watchparty-local-connections"
os.environ["ROOM_MAX_PARTICIPANTS"] = "10"
os.environ["AWS_REGION"] = "ap-southeast-1"
os.environ["APP_DOMAIN"] = "localhost:5173"
os.environ["PARENT_DOMAIN"] = "localhost"

# Start moto mock for DynamoDB
from moto import mock_aws  # noqa: E402

moto_mock = mock_aws()
moto_mock.start()

import boto3  # noqa: E402

dynamodb = boto3.resource("dynamodb", region_name="ap-southeast-1")

# Create local main table
main_table = dynamodb.create_table(
    TableName="watchparty-local-main",
    KeySchema=[
        {"AttributeName": "PK", "KeyType": "HASH"},
        {"AttributeName": "SK", "KeyType": "RANGE"},
    ],
    AttributeDefinitions=[
        {"AttributeName": "PK", "AttributeType": "S"},
        {"AttributeName": "SK", "AttributeType": "S"},
    ],
    BillingMode="PAY_PER_REQUEST",
)

# Seed catalog into local DynamoDB
from core.catalog_data import DEFAULT_CATALOG_ITEMS  # noqa: E402

for item in DEFAULT_CATALOG_ITEMS:
    main_table.put_item(
        Item={
            "PK": "CATALOG",
            "SK": f"MEDIA#{item.media_id}",
            "mediaId": item.media_id,
            "title": item.title,
            "description": item.description,
            "durationSec": str(item.duration_sec),
            "posterUrl": item.poster_url,
            "playbackUrl": item.playback_url,
            "license": item.license,
            "attribution": item.attribution,
        }
    )

from handlers.rest_api.app import lambda_handler  # noqa: E402


class LocalGatewayHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def do_OPTIONS(self):
        self._dispatch("OPTIONS")

    def _dispatch(self, method: str):
        content_length = int(self.headers.get("Content-Length", 0))
        body_bytes = self.rfile.read(content_length) if content_length > 0 else None
        body_str = body_bytes.decode("utf-8") if body_bytes else None

        # Build headers
        req_headers = {}
        for key, val in self.headers.items():
            req_headers[key.lower()] = val

        path = self.path.split("?")[0]
        query_string = self.path.split("?")[1] if "?" in self.path else ""

        # Build API Gateway v2 event
        event = {
            "version": "2.0",
            "routeKey": f"{method} {path}",
            "rawPath": path,
            "rawQueryString": query_string,
            "headers": req_headers,
            "requestContext": {
                "stage": "$default",
                "http": {
                    "method": method,
                    "path": path,
                    "protocol": "HTTP/1.1",
                    "sourceIp": self.client_address[0],
                    "userAgent": self.headers.get("User-Agent", "local"),
                },
            },
            "body": body_str,
            "isBase64Encoded": False,
        }

        response = lambda_handler(event, None)
        status_code = response.get("statusCode", 200)
        res_headers = response.get("headers", {})
        res_body = response.get("body", "")

        self.send_response(status_code)
        for h_name, h_val in res_headers.items():
            self.send_header(h_name, h_val)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()

        if isinstance(res_body, str):
            self.wfile.write(res_body.encode("utf-8"))
        elif isinstance(res_body, bytes):
            self.wfile.write(res_body)

    def log_message(self, format, *args):
        # Clean logging
        sys.stderr.write(f"[LocalServer] {self.address_string()} - {format % args}\n")


def run(port: int = 8000):
    server = HTTPServer(("0.0.0.0", port), LocalGatewayHandler)
    print("\n" + "=" * 60)
    print(f"🎬 Watch Party REST API Local Server running on http://localhost:{port}")
    print("=" * 60)
    print("Available endpoints:")
    print(f"  GET  http://localhost:{port}/health")
    print(f"  GET  http://localhost:{port}/catalog")
    print(f"  POST http://localhost:{port}/rooms")
    print(f"  GET  http://localhost:{port}/rooms/<roomId>")
    print(f"  POST http://localhost:{port}/rooms/<roomId>/join")
    print(f"  POST http://localhost:{port}/rooms/<roomId>/session/refresh")
    print("=" * 60 + "\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping local server...")
        server.server_close()
        moto_mock.stop()


if __name__ == "__main__":
    run(8000)
