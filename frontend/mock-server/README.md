# Mock Server WebSocket

Server WebSocket tiruan untuk pengembangan frontend. Mengikuti [ws-messages.md](../../docs/contracts/ws-messages.md) dan [ws-messages.schema.json](../../docs/contracts/ws-messages.schema.json) (protokol v1).

Ini **bukan** backend asli. Gunakan hanya untuk development lokal, sampai backend ter-deploy di AWS.

## Cara pakai

Butuh Node.js 22 atau lebih baru.

```bash
cd frontend/mock-server
npm install
npm start
```

Server berjalan di `ws://localhost:8787/`. Ganti port dengan `PORT=9000 npm start`.

## Token

Tidak ada REST dan tidak ada autentikasi. Token di query string menentukan peran dan nama:

| Token | Peran | Nama tampil |
|---|---|---|
| `host` | host | Host |
| `controller-dina` | controller | Dina |
| `viewer-bimo` | viewer | Bimo |

Contoh: `ws://localhost:8787/?token=viewer-bimo`. Token yang sama selalu menjadi peserta yang sama (`participantId` dihitung dari token), jadi aman dipakai untuk menguji reconnect dan `replaced`.

Setelah koneksi terbuka, kirim `session.resume`. Server membalas `room.snapshot`.

## Yang disimulasikan

- `session.resume`, `clock.ping`/`clock.pong`, `heartbeat`, `metrics.report`.
- `playback.command` dengan cek peran (`FORBIDDEN`), cek versi (`VERSION_CONFLICT` dengan `details.currentState`), dan cek `positionSec` lebih dari durasi (`VALIDATION_ERROR`).
- `playback.state` dikirim ke semua koneksi, termasuk pengirim.
- `chat.send`, `reaction.send`, `player.status`.
- Presence: `participant.joined`, `participant.updated` (host), `participant.left`.
- Koneksi kedua dengan `participantId` yang sama: koneksi lama menerima `session.ended` (`replaced`).
- Rate limit sesuai kontrak (§3), dengan error `RATE_LIMITED`. Matikan dengan `MOCK_RATE_LIMIT=off npm start`.
- Validasi ketat: field tidak dikenal, versi protokol salah, JSON rusak, dan pesan lebih dari 4 KB ditolak.

## Yang tidak disimulasikan

REST (`/rooms`, `/join`, `session/refresh`), signed cookies, kapasitas room, room expired, kick, LiveKit. Semua state ada di memori dan hilang saat server dimatikan. Hanya ada satu room (`MockRoom0001`), film awal Big Buck Bunny (596 detik).

Ubah film dengan environment variable:

```bash
MOCK_PLAYBACK_URL=https://contoh.com/master.m3u8 MOCK_DURATION_SEC=888 npm start
```

URL HLS bawaan adalah stream uji publik. Pastikan durasinya sesuai dengan `MOCK_DURATION_SEC`, karena `positionSec` yang melebihi durasi ditolak.

## Test

```bash
npm test
```

Test menjalankan skenario end-to-end (20 langkah) dan memvalidasi **setiap pesan dari server** terhadap `ws-messages.schema.json`. Jika kontrak berubah, jalankan ulang test ini.

## Selisih dengan backend asli

Berdasarkan pembacaan kode `backend/` di commit `79da098`. Mock mengikuti **kontrak**, jadi ini adalah perbedaan yang perlu diketahui:

| Hal | Kontrak (dan mock) | Backend asli |
|---|---|---|
| `player.status` | Disiarkan sebagai `participant.updated` | Hanya disimpan ke database, tidak disiarkan |
| `reaction.added` | Payload `{ participantId, emoji }` | Ditambah `displayName` dan `addedAtMs`. Ini melanggar skema (`additionalProperties: false`). Client harus mengabaikan field yang tidak dikenal |
| `positionSec` lebih dari durasi | `VALIDATION_ERROR` | Tidak ada pengecekan di handler `ws_message` |
| Rate limit | Ada (§3) | Tidak ada pembatasan di handler `ws_message` |

Sebelum backend terpasang di AWS, selisih ini perlu dikonfirmasi ke Backend.

## REST palsu (untuk alur join)

Server yang sama juga menjawab tiga endpoint REST di port yang sama (`http://localhost:8787`), supaya FE bisa menjalankan alur join penuh:

| Endpoint | Hasil |
|---|---|
| `POST /rooms/MockRoom0001/join` body `{"displayName": "Dina"}` | `RoomSession` (`roomToken`, `wsUrl`, dst). Tambahkan `?role=host` atau `?role=controller` untuk memilih peran (hanya di mock; backend asli mengabaikannya). |
| `POST /rooms/MockRoom0001/session/refresh` header `Authorization: Bearer <roomToken>` | `RoomSession` baru |
| `POST /rooms/MockRoom0001/media-cookies` header `Authorization: Bearer <roomToken>` | `204`, tanpa cookie (mock tidak punya CloudFront) |

CORS mengizinkan origin mana pun dengan `credentials`, jadi `fetch(..., { credentials: 'include' })` dari `localhost:5173` jalan.

## Menjalankan FE dengan mock (uji di browser)

1. Terminal 1: `cd frontend/mock-server && npm start`
2. Terminal 2: `cd frontend && npm run dev`
3. Buka dua tab, satu per peran:
   - Host: `http://localhost:5173/?name=Raka&role=host`
   - Viewer: `http://localhost:5173/?name=Bimo&role=viewer`
4. Host menekan play, jeda, geser timeline, atau putar balik 10 detik. Tab viewer ikut bergerak. Tombol viewer terkunci.

Parameter alamat (sementara, sampai halaman join dibuat): `room` (default `MockRoom0001`), `name`, `role` (hanya dikenali mock).

Variabel env FE (opsional, di `frontend/.env.local`):

| Variabel | Fungsi |
|---|---|
| `VITE_API_URL` | Alamat REST API. Default `http://localhost:8787` (mock). |
| `VITE_HLS_WITH_CREDENTIALS` | `true` bila video dilindungi CloudFront signed cookies. Biarkan kosong untuk stream uji publik. |

Mock server menyimpan state selama prosesnya hidup. Restart (`Ctrl+C`, `npm start`) untuk kembali ke posisi 0 dan status paused.
