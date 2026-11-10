# Watch Party — Backend Services & Integration Guide

Layanan backend dan handler AWS Lambda untuk aplikasi **Watch Party**. Modul ini menyediakan antarmuka REST API dan WebSocket realtime untuk sinkronisasi pemutaran video bersama, manajemen sesi ruangan, obrolan realtime, serta presensi pengguna.

Dokumen ini disusun sebagai **panduan integrasi dan handoff** bagi tim Frontend maupun pengembang backend.

---

## 1. Quickstart & Local Development Server

Untuk mempermudah pengembangan dan integrasi Frontend tanpa ketergantungan deployment AWS, telah disediakan server lokal berbasis in-memory mock DynamoDB (`moto`):

### Prasyarat
- Python `>= 3.14`
- [uv](https://docs.astral.sh/uv/) package manager

### Instalasi Dependensi
```bash
cd backend
uv sync
```

### Menjalankan Local Mock Server
```bash
uv run python local_server.py
```
Server akan berjalan di:
- **REST API Base URL:** `http://localhost:8000`
- **WebSocket Endpoint:** `ws://localhost:8000?token=<roomToken>`

> [!NOTE]
> Server lokal ini sepenuhnya in-memory dan mock-ready. Data katalog film default (Sintel, Big Buck Bunny, Tears of Steel) otomatis terisi saat server dinyalakan.

---

## 2. Kontrak REST API (Frontend Handoff)

Seluruh payload REST API menggunakan format **JSON camelCase**. Response error dibungkus dalam schema standar `{"error": {"code": "...", "message": "..."}}`.

### 2.1 Health Check
- **Endpoint:** `GET /health`
- **Response:**
  ```json
  {
    "status": "healthy",
    "service": "watchparty-backend",
    "timestamp": 1730870400000
  }
  ```

### 2.2 Katalog Media
- **Endpoint:** `GET /catalog`
- **Response:**
  ```json
  {
    "items": [
      {
        "mediaId": "sintel",
        "title": "Sintel",
        "description": "The story of a lonely young woman...",
        "durationSec": 888.0,
        "posterUrl": "https://assets.chescloud.my.id/posters/sintel.jpg",
        "playbackUrl": "https://media.chescloud.my.id/hls/sintel/master.m3u8",
        "license": "CC BY 3.0",
        "attribution": "Blender Foundation | durian.blender.org"
      }
    ]
  }
  ```

### 2.3 Buat Room Baru (Host)
- **Endpoint:** `POST /rooms`
- **Headers:** `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "mediaId": "sintel",
    "hostDisplayName": "Alice",
    "maxParticipants": 5
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "room": {
      "roomId": "8J3GuXNOz0at",
      "mediaId": "sintel",
      "mediaTitle": "Sintel",
      "status": "open",
      "hostDisplayName": "Alice",
      "participantCount": 1,
      "maxParticipants": 5,
      "createdAtMs": 1730870400000,
      "expiresAtMs": 1730884800000,
      "inviteUrl": "https://watchparty.chescloud.my.id/r/8J3GuXNOz0at"
    },
    "participant": {
      "participantId": "p_XoRexsrtexvrAbw3",
      "displayName": "Alice",
      "role": "host",
      "playerStatus": "unknown",
      "connected": false,
      "joinedAtMs": 1730870400000
    },
    "token": "<JWT_ROOM_TOKEN>"
  }
  ```

### 2.4 Ringkasan Room
- **Endpoint:** `GET /rooms/{roomId}`
- **Response (200 OK):**
  ```json
  {
    "roomId": "8J3GuXNOz0at",
    "mediaId": "sintel",
    "mediaTitle": "Sintel",
    "status": "open",
    "hostDisplayName": "Alice",
    "participantCount": 2,
    "maxParticipants": 5,
    "createdAtMs": 1730870400000,
    "expiresAtMs": 1730884800000,
    "inviteUrl": "https://watchparty.chescloud.my.id/r/8J3GuXNOz0at"
  }
  ```

### 2.5 Join Room (Guest)
- **Endpoint:** `POST /rooms/{roomId}/join`
- **Request Body:**
  ```json
  {
    "displayName": "Bob"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "room": { ... },
    "participant": {
      "participantId": "p_NqLN1F5bXA9lTEhT",
      "displayName": "Bob",
      "role": "viewer",
      "playerStatus": "unknown",
      "connected": false,
      "joinedAtMs": 1730870410000
    },
    "token": "<JWT_ROOM_TOKEN>"
  }
  ```
  *(Jika kapasitas kursi tamu habis, mengembalikan 409 Conflict dengan code `ROOM_FULL`)*

### 2.6 Refresh Session Token
- **Endpoint:** `POST /rooms/{roomId}/session/refresh`
- **Headers:** `Authorization: Bearer <roomToken>`
- **Response (200 OK):**
  ```json
  {
    "token": "<NEW_JWT_ROOM_TOKEN>",
    "expiresAtMs": 1730899200000
  }
  ```

### 2.7 Media CloudFront Signed Cookies
- **Endpoint:** `GET /rooms/{roomId}/media/cookies`
- **Headers:** `Authorization: Bearer <roomToken>`
- **Response (200 OK):**
  ```json
  {
    "cookies": {
      "CloudFront-Policy": "mock_policy_base64",
      "CloudFront-Signature": "mock_signature_base64",
      "CloudFront-Key-Pair-Id": "K2JC3FAKEKEYID"
    },
    "playbackUrl": "https://media.chescloud.my.id/hls/sintel/master.m3u8"
  }
  ```

### 2.8 LiveKit RTC Token (Video/Audio Chat)
- **Endpoint:** `POST /rooms/{roomId}/rtc/token`
- **Headers:** `Authorization: Bearer <roomToken>`
- **Response (200 OK):**
  ```json
  {
    "rtcToken": "mock_livekit_token",
    "livekitUrl": "wss://livekit.chescloud.my.id"
  }
  ```

---

## 3. Protokol WebSocket Realtime

Koneksi WebSocket menggunakan URL:
```text
ws://localhost:8000?token=<roomToken>
```

### 3.1 Format Envelope Pesan

Setiap pesan WebSocket (baik dari Client maupun Server) dibungkus dalam format envelope standar v1:
```json
{
  "v": 1,
  "type": "playback.command",
  "requestId": "req_123",
  "sentAtMs": 1730870500000,
  "payload": { ... }
}
```

Setelah koneksi `$connect` terbuka dan tervalidasi, client mengirim `session.resume` untuk mendapatkan `room.snapshot`:
```json
{
  "v": 1,
  "type": "room.snapshot",
  "sentAtMs": 1730870500123,
  "payload": {
    "room": {
      "roomId": "8J3GuXNOz0at",
      "status": "open",
      "participantCount": 3
    },
    "media": {
      "mediaId": "sintel",
      "title": "Sintel",
      "durationSec": 888.0,
      "playbackUrl": "https://media.chescloud.my.id/hls/sintel/master.m3u8"
    },
    "playback": {
      "roomId": "8J3GuXNOz0at",
      "mediaId": "sintel",
      "status": "playing",
      "positionSec": 75.5,
      "playbackRate": 1.0,
      "updatedAtServerMs": 1730870500000,
      "version": 3
    },
    "participants": [
      { "participantId": "p_XoRexsrtexvrAbw3", "displayName": "Alice", "role": "host", "playerStatus": "ready", "connected": true, "joinedAtMs": 1730870400000 },
      { "participantId": "p_NqLN1F5bXA9lTEhT", "displayName": "Bob", "role": "controller", "playerStatus": "ready", "connected": true, "joinedAtMs": 1730870410000 }
    ],
    "recentChat": [],
    "self": {
      "participantId": "p_NqLN1F5bXA9lTEhT",
      "role": "controller"
    }
  }
}
```

### 3.2 Pesan Client-to-Server

| `type` | Payload | Balasan / Efek | Rate Limit |
|---|---|---|---|
| `session.resume` | `{"lastVersion"?: integer}` | `room.snapshot` ke pengirim | — |
| `clock.ping` | `{"clientSendMs": integer}` | `clock.pong` ke pengirim | 10 per 10 s |
| `heartbeat` | `{}` | Mempertahankan koneksi aktif | — |
| `playback.command` | `{"action": "play" \| "pause" \| "seek", "positionSec": number, "baseVersion": integer}` | Broadcast `playback.state` ke seluruh room | 10 per 10 s |
| `player.status` | `{"status": "buffering" \| "syncing" \| "ready"}` | Broadcast `participant.updated` ke seluruh room | 10 per 10 s |
| `chat.send` | `{"text": string 1–500 karakter}` | Broadcast `chat.message` ke seluruh room | 5 per 10 s |
| `reaction.send` | `{"emoji": "thumbsUp" \| "heart" \| "laugh" \| "wow" \| "sad"}` | Broadcast `reaction.added` ke seluruh room | 10 per 10 s |
| `metrics.report` | `{"windowSec": 30, "driftMs": [...]}` | CloudWatch EMF metric | 1 per 15 s |

### 3.3 Pesan Server-to-Client

| `type` | Penerima | Payload Utama |
|---|---|---|
| `room.snapshot` | Pengirim `session.resume` | `{ room, media, playback, participants, recentChat, self }` |
| `playback.state` | Seluruh Room | `{ state: PlaybackState, action, causedBy: participantId }` |
| `clock.pong` | Pengirim `clock.ping` | `{ clientSendMs, serverTimeMs }` |
| `participant.joined` | Seluruh Room | `{ participant: Participant }` (saat guest terhubung) |
| `participant.updated` | Seluruh Room | `{ participant: Participant }` (peran berubah, playerStatus, atau host reconnect/disconnect) |
| `participant.left` | Seluruh Room | `{ participantId, reason: "disconnected" \| "kicked" }` (guest disconnect) |
| `chat.message` | Seluruh Room | `{ message: ChatMessage }` |
| `reaction.added` | Seluruh Room | `{ participantId, emoji }` |
| `session.ended` | Klien Terkait | `{ reason: "kicked" \| "roomClosed" \| "expired" \| "replaced" }` |
| `error` | Klien Pemanggil | `{ code, message, details? }` *(misal: `VERSION_CONFLICT`, `FORBIDDEN`, `VALIDATION_ERROR`)* |

---

## 4. Konsep Kunci Sinkronisasi (Optimistic Concurrency Control)

- **Sinkronisasi Berbasis State:** Server mempertahankan state pemutaran `{ roomId, mediaId, status, positionSec, playbackRate, updatedAtServerMs, version }`.
- **Menghindari Konflik Versi:** Setiap kali client mengirim `playback.command`, client harus menyertakan `baseVersion` saat ini. Jika server telah berpindah ke versi yang lebih tinggi akibat aksi pengguna lain, server akan menolak update dengan error `VERSION_CONFLICT` dan menyertakan `details.currentState`. Client cukup menyesuaikan player dengan event `playback.state` terbaru.
- **Business Rule 7 (BR-7):** Jika Host menutup tab atau mengalami pemutusan jaringan sementara, Host **tetap tercatat** dalam daftar partisipan (status `connected = false`). Ruangan tidak langsung ditutup dan pemutaran tidak otomatis terhenti, memberi kesempatan Host untuk reconnect dan melanjutkan sesi.

---

## 5. Pengujian & Quality Assurance

### 5.1 Menjalankan Unit Tests (28 Tests)
```bash
uv run pytest
```

### 5.2 Menjalankan Simulasi Multi-Client Lengkap (11 Langkah)
Simulasi skenario ujung ke ujung melibatkan 3 client (Alice/Host, Bob/Guest, Charlie/Guest) mencakup:
1. Pembuatan Room & Join via REST API.
2. Koneksi WebSocket & penguncian kapasitas kursi (Seat Locking).
3. Playback commands (`play`, `seek`) dengan versioning.
4. Optimistic concurrency conflict rejection (`VERSION_CONFLICT`).
5. Role promotion (Host -> Bob jadi Controller).
6. Player status synchronization (`buffering` -> `ready` broadcast).
7. Realtime chat & emoji reactions.
8. Snapshot verification (AP-6).
9. Disconnect presensi Host (verifikasi kepatuhan aturan bisnis PRD BR-7).

```bash
uv run python tests/simulate_party.py
```

### 5.3 Linting dan Formatting
```bash
uv run ruff check
uv run ruff format --check
```

### 5.4 SonarQube Code Quality & SAST Audit
Modul backend telah diaudit menggunakan SonarQube dengan hasil:
- **Quality Gate:** PASSED (OK)
- **Bugs:** 0
- **Vulnerabilities:** 0
- **Code Smells:** 0
- **Security Hotspots:** 0
- **Duplikasi:** 0.0%

---

## 6. Struktur Direktori Backend

```text
backend/
├── pyproject.toml              # Definisi dependensi uv & pytest config
├── local_server.py             # Server dev/mock lokal untuk Frontend integration
├── src/
│   ├── core/                   # Logika domain inti & data repository
│   │   ├── models/             # Pydantic v2 schemas (common, room, rest, websocket)
│   │   ├── repository/         # DynamoDB single-table repositories (room, playback, connection)
│   │   ├── auth.py             # JWT HS256 room token encoder/decoder
│   │   ├── errors.py           # Standard domain exceptions & error codes
│   │   └── broadcast.py        # WebSocket fan-out broadcaster
│   └── handlers/               # Handler AWS Lambda
│       ├── rest_api/           # REST API router (catalog, rooms, join, cookies, rtc)
│       ├── ws_authorizer/      # WebSocket $connect token authorizer
│       ├── ws_connect/         # WebSocket $connect seat lock & presence join
│       ├── ws_disconnect/      # WebSocket $disconnect seat release & presence leave
│       └── ws_message/         # WebSocket route handler ($default, playback, chat, etc.)
├── tests/
│   ├── unit/                   # Unit test suite (auth, handlers, models, repositories)
│   └── simulate_party.py       # End-to-end multi-client simulation test
└── scripts/
    └── build_lambda.sh         # Script packaging zip Lambda arm64 (Python 3.14)
```
