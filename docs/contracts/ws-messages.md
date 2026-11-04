# Kontrak Pesan WebSocket — Protokol v1

> Nama produk masih nama kerja; difiksasi Senin 2 Nov 2026.

| Atribut | Nilai |
|---|---|
| Status | Draft, di-freeze dengan tag `contracts-v1.0` (target Sel, 3 Nov 2026) |
| Pemilik | Backend (A: Product & Tech Lead) |
| Konsumen | FE-Player, FE-Social |
| Endpoint | `wss://ws.<project_name>.chescloud.my.id` (contoh `wss://ws.watchparty.chescloud.my.id`) |
| Konvensi nama field | **camelCase** (sama dengan [openapi.yaml](openapi.yaml)) |

Angka batas (TTL, ukuran, rate limit) diambil dari [architecture.md §3](../architecture.md#3-angka-kunci-single-source-of-truth). Jika berbeda, architecture.md yang benar dan dokumen ini harus diperbaiki.

> **Skema mesin (JSON Schema):** [ws-messages.schema.json](ws-messages.schema.json) (JSON Schema draft 2020-12) adalah salinan mesin dari dokumen ini: envelope dan semua `type` pesan di §3 dan §4, dengan `additionalProperties: false`. Semua contoh JSON di dokumen ini harus lolos validasi skema tersebut. Jika keduanya berbeda, dokumen ini yang benar dan skema harus diperbaiki di PR yang sama. Model pydantic di Backend dan mock di FE wajib cocok dengan skema ini (dicek di test/CI saat implementasi). Backend memvalidasi pesan masuk dengan `#/$defs/clientMessage`, dan FE memvalidasi mock/pesan server dengan `#/$defs/serverMessage`. Root skema (dua arah) hanya untuk mengecek contoh di dokumen ini.

---

## 1. Koneksi

### 1.1 Connect

```text
wss://ws.<project_name>.chescloud.my.id/?token=<roomToken>
```

- `roomToken` didapat dari `POST /rooms` (host), `POST /rooms/{roomId}/join`, atau `POST /rooms/{roomId}/session/refresh`.
- Token dikirim lewat query string karena browser tidak bisa mengirim header custom saat membuka WebSocket. Token divalidasi oleh Lambda REQUEST authorizer pada route `$connect`. Access log tidak mencatat query string.
- Authorizer juga mengecek: room masih `open` (belum ditutup dan belum melewati `expiresAtMs`), peserta tidak `kicked`, dan header `Origin` sama dengan origin aplikasi.
- **Kapasitas:** setelah authorizer, Lambda `ws-connect` mengunci tempat peserta dengan conditional write (maks `room.maxParticipants` peserta terhubung termasuk host, default 10; guest terhubung maks `maxParticipants − 1`, 1 tempat selalu untuk host walaupun host sedang offline). Jika room penuh, koneksi ditolak. Ini juga berlaku untuk peserta yang reconnect setelah tempatnya terisi orang lain. Detail: [architecture.md §7.4 AP-14](../architecture.md#74-access-patterns).
- Jika ditolak (karena alasan apa pun), browser hanya melihat koneksi gagal (status HTTP handshake tidak bisa dibaca JavaScript). Client mencari penyebabnya lewat `session/refresh`, lihat [§5.3](#53-gagal-connect).

### 1.2 Setelah Terbuka

1. Client **wajib** mengirim `session.resume` segera setelah event `open`. Server tidak bisa mengirim pesan selama `$connect` diproses, jadi snapshot hanya dikirim sebagai balasan `session.resume`.
2. Server membalas `room.snapshot`.
3. Client mengirim 5 × `clock.ping` (jeda 200 ms) untuk estimasi clock offset, lalu 1 × setiap 60 s.
4. Satu peserta hanya punya satu koneksi aktif. Koneksi baru dengan `participantId` yang sama langsung terdaftar untuk menerima broadcast, lalu koneksi lama menerima `session.ended` (`reason = replaced`) dan diputus. Server menyimpan `connectionId` aktif per peserta, jadi penutupan koneksi lama **tidak** memicu `participant.left` dan tidak mengubah status `connected` peserta.
5. `participant.left` (`reason = disconnected`) hanya dikirim jika koneksi yang tertutup adalah koneksi aktif peserta tersebut. Untuk host, server mengirim `participant.updated` dengan `connected = false`, bukan `participant.left` (lihat [§4.6](#46-presence-guest-dan-host)).

## 2. Envelope

Semua pesan (dua arah) adalah JSON UTF-8 dengan bentuk:

```json
{
  "v": 1,
  "type": "playback.command",
  "requestId": "6f1c2a7e-3b7d-4a51-9a39-0c1f9f1f4b11",
  "sentAtMs": 1793430000000,
  "payload": { "action": "pause", "positionSec": 120.5, "baseVersion": 7 }
}
```

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `v` | integer | Ya | Versi protokol. Saat ini `1`. |
| `type` | string | Ya | Jenis pesan, format `domain.action` (lihat §3 dan §4). Dipakai sebagai route selection di API Gateway (`$request.body.type`); semua type masuk ke route `$default` → Lambda `ws-message`. |
| `requestId` | string (1–64) | Wajib untuk `playback.command` dan `chat.send`; opsional untuk lainnya | Dibuat client (disarankan UUID v4). Server meng-echo `requestId` di balasan atau broadcast yang disebabkan pesan tersebut, dan di `error`. |
| `sentAtMs` | integer | Ya | Epoch ms menurut jam pengirim. Untuk pesan server = waktu server. |
| `payload` | object | Ya | Isi pesan. Boleh `{}`. |

Aturan umum:
- Field yang tidak dikenal di **envelope atau payload pesan client** ditolak (`VALIDATION_ERROR`).
- Client **wajib mengabaikan** field dan `type` yang tidak dikenal dari server (agar server bisa menambah fitur tanpa memecah client lama).
- Waktu memakai sufiks `Ms` (epoch ms), posisi/durasi memakai sufiks `Sec`.

## 3. Pesan Client → Server

| `type` | Payload | Balasan | Rate limit (per peserta) | Fitur |
|---|---|---|---|---|
| `session.resume` | `{ "lastVersion"?: integer ≥ 1 }` | `room.snapshot` ke pengirim | — | F-2.5 |
| `clock.ping` | `{ "clientSendMs": integer }` | `clock.pong` ke pengirim | 10 per 10 s | F-2.1 |
| `heartbeat` | `{}` | Tidak ada | — | F-2.5 |
| `playback.command` | `{ "action": "play" \| "pause" \| "seek", "positionSec": number ≥ 0, "baseVersion": integer ≥ 1 }` | Broadcast `playback.state`, atau `error` ke pengirim | 10 per 10 s | F-2.1, F-2.2 |
| `player.status` | `{ "status": "buffering" \| "syncing" \| "ready" }` | Broadcast `participant.updated` | 10 per 10 s | F-2.4, F-1.5 |
| `chat.send` | `{ "text": string 1–500 karakter }` | Broadcast `chat.message` | 5 per 10 s | F-4.1 |
| `reaction.send` | `{ "emoji": "thumbsUp" \| "heart" \| "laugh" \| "wow" \| "sad" }` | Broadcast `reaction.added` | 10 per 10 s | F-4.2 |
| `metrics.report` | Lihat §3.4 | Tidak ada (ditulis sebagai metric CloudWatch) | 1 per 15 s | NFR-1.1–1.3 |

### 3.1 `playback.command`

- Hanya peran `host` dan `controller`. Dari `viewer` → `error` `FORBIDDEN`, state tidak berubah.
- `baseVersion` adalah `version` state playback yang sedang diterapkan client. Jika tidak sama dengan versi di server → `error` `VERSION_CONFLICT` dengan `details.currentState`.
- Arti `positionSec`: `play`/`pause` = posisi lokal pengirim saat menekan tombol; `seek` = posisi tujuan. `seek` tidak mengubah `status`.
- `positionSec` lebih dari durasi film → `VALIDATION_ERROR`.

```json
{ "v": 1, "type": "playback.command", "requestId": "c1", "sentAtMs": 1793430000000,
  "payload": { "action": "seek", "positionSec": 600, "baseVersion": 7 } }
```

### 3.2 `clock.ping`

```json
{ "v": 1, "type": "clock.ping", "sentAtMs": 1793430000000, "payload": { "clientSendMs": 1793430000000 } }
```

### 3.3 `heartbeat`

Client mengirim `heartbeat` jika **tidak ada pesan lain** yang dikirim selama 5 menit (timer di-reset setiap kali client mengirim pesan apa pun). Tujuannya agar koneksi tidak diputus oleh idle timeout API Gateway (10 menit). Saat film diputar, `clock.ping` setiap 60 s dan `metrics.report` setiap 30 s sudah cukup menjaga koneksi.

### 3.4 `metrics.report`

Dikirim setiap 30 s selama berada di room.

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `windowSec` | integer 1–60 | Ya | Panjang jendela sampel |
| `driftMs` | number[] (maks 60, ≥ 0) | Ya | Sampel `abs(actualPositionSec − expectedPositionSec) × 1000`, 1 per detik. Kosong saat `paused`. |
| `commandLatencyMs` | number[] (maks 20) | Tidak | `appliedAtClientMs + clockOffsetMs − updatedAtServerMs` untuk setiap `playback.state` yang diterapkan |
| `joinToFirstFrameMs` | number ≥ 0 | Tidak | Dikirim sekali per join (klik Join → `loadeddata`) |
| `rttMs` | number ≥ 0 | Tidak | RTT `clock.ping` terbaik saat ini |

Server menulis nilai-nilai ini ke namespace CloudWatch `<project_name>/client` dengan Embedded Metric Format (metric `DriftMs`, `CommandLatencyMs`, `JoinToFirstFrameMs`, `RttMs`, dimensi `Env`).

## 4. Pesan Server → Client

| `type` | Penerima | Payload | Fitur |
|---|---|---|---|
| `room.snapshot` | Pengirim `session.resume` | `{ room, media, playback, participants, recentChat, self }` | F-2.5, F-1.5, F-4.1 |
| `playback.state` | Semua koneksi di room (termasuk pengirim) | `{ state: PlaybackState, action, causedBy: participantId }` | F-2.1 |
| `clock.pong` | Pengirim `clock.ping` | `{ clientSendMs, serverTimeMs }` | F-2.1 |
| `participant.joined` | Semua | `{ participant: Participant }` (guest mulai terhubung) | F-1.5 |
| `participant.updated` | Semua | `{ participant: Participant }` (perubahan peran, `playerStatus`, atau `connected` milik host) | F-1.5, F-2.2, F-2.4 |
| `participant.left` | Semua | `{ participantId, reason: "disconnected" \| "kicked" }` (guest saja) | F-1.5, F-1.6 |
| `chat.message` | Semua | `{ message: ChatMessage }` | F-4.1 |
| `reaction.added` | Semua | `{ participantId, emoji }` | F-4.2 |
| `session.ended` | Peserta terkait / semua | `{ reason: "kicked" \| "roomClosed" \| "expired" \| "replaced" }` | F-1.6 (`kicked`), F-1.7 (`roomClosed`), F-2.5 (`expired`: BR-4, AC-2.5.4; `replaced`: §1.2) |
| `error` | Pengirim pesan yang gagal | `{ code, message, details? }` | Semua |

### 4.1 Objek Bersama

Objek berikut **sama persis** dengan schema di [openapi.yaml](openapi.yaml): `Room`, `Media`, `Participant`.

**`PlaybackState`**

| Field | Tipe | Keterangan |
|---|---|---|
| `roomId` | string | 12 karakter base62 |
| `mediaId` | string | |
| `status` | `"playing"` \| `"paused"` | |
| `positionSec` | number ≥ 0 | Posisi saat `updatedAtServerMs` |
| `playbackRate` | number | v1 selalu `1.0` |
| `updatedAtServerMs` | integer | Waktu server saat state berubah |
| `version` | integer ≥ 1 | Naik 1 setiap perubahan. Room baru mulai dari `1` |

**`ChatMessage`**

| Field | Tipe |
|---|---|
| `messageId` | string (1–64) |
| `participantId` | string |
| `displayName` | string (1–32) |
| `text` | string (1–500) |
| `createdAtMs` | integer |

### 4.2 `room.snapshot`

| Field | Isi |
|---|---|
| `room` | `Room` |
| `media` | `Media` (termasuk `playbackUrl` dan `durationSec`) |
| `playback` | `PlaybackState` terbaru |
| `participants` | `Participant[]` yang tidak di-kick. UI menampilkan guest yang `connected = true` dan selalu menampilkan host (offline jika `connected = false`, §4.6) |
| `recentChat` | Maks 20 `ChatMessage` terakhir, urut dari terlama ke terbaru |
| `self` | `{ participantId, role }` milik penerima |

```json
{
  "v": 1, "type": "room.snapshot", "requestId": "r1", "sentAtMs": 1793430000123,
  "payload": {
    "room": { "roomId": "aZ3kP9qL2mXw", "mediaId": "sintel", "mediaTitle": "Sintel", "status": "open",
              "hostDisplayName": "Andi", "participantCount": 3, "maxParticipants": 10,
              "createdAtMs": 1793420000000, "expiresAtMs": 1793506400000,
              "inviteUrl": "https://watchparty.chescloud.my.id/r/aZ3kP9qL2mXw" },
    "media": { "mediaId": "sintel", "title": "Sintel", "durationSec": 888,
               "posterUrl": "https://watchparty.chescloud.my.id/posters/sintel.jpg",
               "playbackUrl": "https://watchparty.chescloud.my.id/media/sintel/master.m3u8",
               "license": "CC BY 3.0", "attribution": "(c) copyright Blender Foundation | durian.blender.org" },
    "playback": { "roomId": "aZ3kP9qL2mXw", "mediaId": "sintel", "status": "playing", "positionSec": 120.5,
                  "playbackRate": 1.0, "updatedAtServerMs": 1793429990000, "version": 8 },
    "participants": [
      { "participantId": "p_Q8w2Ez7Rt5Yu1Io3", "displayName": "Andi", "role": "host",
        "playerStatus": "ready", "connected": true, "joinedAtMs": 1793420000000 }
    ],
    "recentChat": [],
    "self": { "participantId": "p_Q8w2Ez7Rt5Yu1Io3", "role": "host" }
  }
}
```

### 4.3 `playback.state`

```json
{ "v": 1, "type": "playback.state", "requestId": "c1", "sentAtMs": 1793430000050,
  "payload": {
    "state": { "roomId": "aZ3kP9qL2mXw", "mediaId": "sintel", "status": "playing", "positionSec": 600,
               "playbackRate": 1.0, "updatedAtServerMs": 1793430000040, "version": 8 },
    "action": "seek", "causedBy": "p_Q8w2Ez7Rt5Yu1Io3" } }
```

Client **mengabaikan** `playback.state` dengan `version` ≤ versi yang sudah diterapkan.

### 4.4 `clock.pong`

```json
{ "v": 1, "type": "clock.pong", "sentAtMs": 1793430000045,
  "payload": { "clientSendMs": 1793430000000, "serverTimeMs": 1793430000045 } }
```

Perhitungan offset ada di [architecture.md §6.3](../architecture.md#63-estimasi-clock-offset-gaya-ntp).

### 4.5 `session.ended`

| `reason` | Kapan | Client harus |
|---|---|---|
| `kicked` | Host mengeluarkan peserta (v1.1) | Tampilkan "Anda dikeluarkan oleh host", **jangan reconnect**, putus LiveKit |
| `roomClosed` | Host menutup room (v1.1) | Tampilkan "Room telah ditutup oleh host", jangan reconnect |
| `expired` | Masa hidup room 24 jam habis (`room.expiresAtMs`) | Tampilkan "Room telah berakhir", hentikan player, putus LiveKit, jangan reconnect |
| `replaced` | Peserta yang sama connect dari tab/perangkat lain | Tampilkan "Sesi dibuka di tempat lain", jangan reconnect |

Setelah mengirim `session.ended`, server memutus koneksi.

**Mekanisme `expired`** (dua lapis, keduanya wajib):
1. **Timer client.** Saat menerapkan `room.snapshot`, client memasang timer ke `room.expiresAtMs` (dikonversi ke jam lokal dengan clock offset, lihat [architecture.md §6.3](../architecture.md#63-estimasi-clock-offset-gaya-ntp)). Saat timer habis, client bertindak sama seperti menerima `session.ended` `expired` dan menutup WebSocket sendiri. Lapis ini membuat peserta yang tidak mengirim pesan tetap melihat pesan tepat waktu.
2. **Cek server.** Untuk setiap pesan yang masuk setelah `room.expiresAtMs`, server tidak memproses pesan itu, mengirim `session.ended` (`reason = expired`) ke pengirim, lalu memutus koneksi. Connect baru ke room yang sudah expired ditolak oleh authorizer.

Detail: [architecture.md §7.4 AP-15](../architecture.md#74-access-patterns).

### 4.6 Presence Guest dan Host

| Kejadian | Guest | Host |
|---|---|---|
| Mulai terhubung (connect pertama atau reconnect setelah putus) | `participant.joined` | `participant.updated` dengan `connected = true` |
| Koneksi aktif putus | `participant.left` (`reason = disconnected`) → hapus dari daftar | `participant.updated` dengan `connected = false` → tetap di daftar, ditandai offline |
| Di-kick (v1.1) | `participant.left` (`reason = kicked`) | Tidak mungkin (host tidak bisa di-kick) |

- Host putus **tidak** mengubah state playback dan **tidak** memindahkan peran (PRD BR-7). Tidak ada `playback.state` baru karena host putus. Client peserta lain tetap menghitung posisi dari `PlaybackState` terakhir (architecture.md §6.2), jadi film tetap diputar atau tetap di-pause.
- `controller` yang sudah ada tetap bisa mengirim `playback.command` selama host offline.
- Waktu tampil di daftar: ≤ 5 s setelah server mendeteksi disconnect (PRD AC-1.5.2, AC-2.5.5).

Contoh host offline:

```json
{ "v": 1, "type": "participant.updated", "sentAtMs": 1793430005000,
  "payload": { "participant": { "participantId": "p_Q8w2Ez7Rt5Yu1Io3", "displayName": "Andi", "role": "host",
    "playerStatus": "ready", "connected": false, "joinedAtMs": 1793420000000 } } }
```

## 5. Reconnect, Resume, dan Snapshot

### 5.1 Kapan Reconnect

Client reconnect otomatis jika koneksi tertutup **tanpa** menerima `session.ended` sebelumnya. Penyebab umum:
- jaringan putus;
- batas durasi koneksi API Gateway (2 jam);
- idle timeout (10 menit) jika heartbeat gagal terkirim.

### 5.2 Prosedur

1. Tunggu backoff: 1, 2, 4, 8, 16, lalu maksimal 30 s, dengan jitter ±20%. Reset backoff setelah `room.snapshot` diterima.
2. Jika sisa umur room token < 30 menit, panggil `POST /rooms/{roomId}/session/refresh` dulu.
3. Connect dengan room token, kirim `session.resume` (`lastVersion` = versi state yang terakhir diterapkan).
4. Terapkan `room.snapshot`: ganti seluruh state lokal (playback, peserta, chat) dengan isi snapshot.
5. Ulangi 5 × `clock.ping`, lalu hitung posisi yang diharapkan dan koreksi (hard seek jika drift > 1 s).

Target: kembali tersinkron (drift < 500 ms) ≤ 5 s setelah jaringan pulih (NFR-2.2).

### 5.3 Gagal Connect

Client memanggil `POST /rooms/{roomId}/session/refresh` untuk mengetahui penyebab gagal connect jika:
- connect **pertama** setelah join gagal (agar orang yang ditolak karena room penuh langsung melihat "Room penuh"), atau
- reconnect gagal 3 kali berturut-turut.

| Respons | Arti | Aksi client |
|---|---|---|
| 200 | Token diperbarui | Lanjut reconnect dengan token baru |
| 401 `UNAUTHORIZED` | Token expired | Kembali ke halaman join (guest) atau join ulang dengan Cognito (host) |
| 403 `FORBIDDEN` | Peserta sudah di-kick | Tampilkan "Anda dikeluarkan oleh host" |
| 409 `ROOM_FULL` | Guest belum terhubung dan semua tempat guest (`maxParticipants − 1`) terisi (1 tempat dicadangkan untuk host, walaupun host sedang offline) | Tampilkan "Room penuh", jangan reconnect otomatis |
| 410 `ROOM_CLOSED` | Room ditutup/expired | Tampilkan "Room tidak tersedia" |

## 6. Error

Payload `error`: `{ "code": ErrorCode, "message": string, "details"?: object }`. Kode error **sama** dengan REST ([openapi.yaml](openapi.yaml) `ErrorCode`). Lewat WebSocket, server hanya mengirim kode yang kolom "Dipakai di"-nya berisi WS. Bentuk `details` mengikuti kolom `details`; "—" berarti tanpa `details`.

`message` ditulis dalam **bahasa Inggris** dan ditujukan untuk developer (log, debugging), sama seperti di REST. Teks yang tampil ke pengguna (Bahasa Indonesia) dipetakan oleh frontend dari `code`.

| `code` | Dipakai di | Arti | `details` |
|---|---|---|---|
| `VALIDATION_ERROR` | REST, WS | Format/isi pesan tidak valid | `{ "field": "..." }` |
| `UNAUTHORIZED` | REST | Token tidak ada/tidak valid/expired | — |
| `FORBIDDEN` | REST, WS | Peran tidak berhak (misalnya `viewer` mengirim `playback.command`) atau sudah di-kick | `{ "requiredRole": "host" }` |
| `NOT_FOUND` | REST | Room/peserta/film tidak ada | — |
| `ROOM_FULL` | REST | Semua tempat guest (`maxParticipants − 1`) terisi; 1 tempat dicadangkan untuk host, walaupun host sedang offline (join dan `session/refresh`). UI menampilkan "Room penuh" hanya dari error ini, bukan dari `participantCount` | — |
| `ROOM_CLOSED` | REST, WS | Room ditutup/expired | — |
| `VERSION_CONFLICT` | WS | `baseVersion` sudah usang | `{ "currentState": PlaybackState }` |
| `RATE_LIMITED` | REST, WS | Melebihi rate limit | `{ "retryAfterSec": integer ≥ 1 }` |
| `PAYLOAD_TOO_LARGE` | WS | Pesan client > 4 KB | — |
| `UNSUPPORTED_VERSION` | WS | `v` tidak didukung | `{ "supported": [1] }` |
| `INTERNAL_ERROR` | REST, WS | Error tak terduga | — |

```json
{ "v": 1, "type": "error", "requestId": "c1", "sentAtMs": 1793430000060,
  "payload": { "code": "VERSION_CONFLICT", "message": "baseVersion 7 is stale",
               "details": { "currentState": { "roomId": "aZ3kP9qL2mXw", "mediaId": "sintel", "status": "paused",
                 "positionSec": 598.2, "playbackRate": 1.0, "updatedAtServerMs": 1793430000010, "version": 8 } } } }
```

## 7. Batas Ukuran

| Arah | Batas aplikasi | Batas API Gateway | Catatan |
|---|---|---|---|
| Client → server | ≤ 4 KB per pesan | Frame 32 KB | Lebih dari 4 KB → `PAYLOAD_TOO_LARGE` |
| Server → client | ≤ 64 KB per pesan | Payload 128 KB | `room.snapshot` terbesar (10 peserta + 20 chat × 500 karakter) diperkirakan < 50 KB |

## 8. Versioning

- `v` adalah versi **major** protokol. Saat ini `1`.
- Perubahan **non-breaking** (tanpa menaikkan `v`): menambah `type` baru dari server, menambah field opsional di payload server, menambah nilai enum baru di pesan server yang sudah ditangani sebagai "unknown" oleh client.
- Perubahan **breaking** (menaikkan `v` menjadi `2`): menghapus/mengganti nama field, mengubah tipe, menambah field wajib di pesan client. Selama transisi server menerima `v = 1` dan `v = 2`.
- Server membalas `UNSUPPORTED_VERSION` untuk `v` yang tidak dikenal.
- Server mengecek `v` **sebelum** validasi skema. Jika `v` bukan `1`, server membalas `UNSUPPORTED_VERSION` (bukan `VALIDATION_ERROR`). Skema [ws-messages.schema.json](ws-messages.schema.json) hanya berlaku untuk `v = 1`.
- Setiap perubahan kontrak setelah tag `contracts-v1.0` lewat PR yang di-approve Product & Tech Lead dan semua role konsumen (FE-Player, FE-Social), serta dicatat di bagian Changelog di bawah.

## 9. Changelog

| Versi | Tanggal | Perubahan |
|---|---|---|
| v1 draft | 31 Okt 2026 | Versi awal (belum di-freeze, jadi belum ada perubahan breaking). Isi: kapasitas room dikunci di `$connect` dan `session/refresh` bisa mengembalikan `ROOM_FULL` (§1.1, §5.3); batas kapasitas mengikuti `room.maxParticipants` (default dan maksimum 10, 1 tempat untuk host, guest maks `maxParticipants − 1`; §1.1, §5.3, §6); presence memakai `connectionId` aktif sehingga koneksi lama tidak memicu `participant.left`, dan koneksi pengganti langsung terdaftar untuk broadcast (§1.2); host tetap di daftar sebagai offline lewat `participant.updated` (`connected`), sedangkan guest memakai `participant.joined`/`participant.left` (§1.2, §4, §4.6); kick mengirim `participant.left` (`kicked`) ke peserta lain (architecture.md §7.4 AP-11); mekanisme `session.ended` `expired` dan kolom fitur F-2.5 (§4, §4.5); `message` error dalam bahasa Inggris (§6); field tak dikenal di envelope pesan client juga ditolak (§2); skema mesin [ws-messages.schema.json](ws-messages.schema.json). |
