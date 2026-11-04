# ADR-0003: Arsitektur Sinkronisasi Real-Time

| Atribut | Nilai |
|---|---|
| Status | Proposed |
| Tanggal | 2026-10-31 |
| Pemilik | Backend (sync client: FE-Player) |
| Terkait | F-2.1, F-2.2, F-2.4, F-2.5, F-1.5, F-4.1, F-4.2; NFR-1.1, NFR-1.2, NFR-2.2, NFR-2.4, NFR-2.5 |

## Konteks

- Draft v0 memakai alur API Gateway WebSocket → Lambda → **Redis Pub/Sub**. Ini tidak bisa jalan: Lambda adalah fungsi berumur pendek dan **tidak bisa subscribe** ke channel Pub/Sub. ElastiCache juga butuh VPC (+ NAT untuk akses keluar) dengan biaya tetap.
- Draft v0 juga menyebut Socket.io dan Express di Lambda. Socket.io butuh server yang selalu hidup dan protokolnya sendiri, tidak cocok dengan API Gateway WebSocket.
- Draft v0 tidak konsisten: F2.3 bilang aksi host yang disinkronkan, alur data bilang "User A".
- Model "event relay" (meneruskan event play/pause apa adanya) rawan drift: peserta yang telat menerima event, join terlambat, atau reconnect tidak punya cara menghitung posisi yang benar.
- Limit API Gateway WebSocket: durasi koneksi maks 2 jam, idle timeout 10 menit, frame 32 KB, payload pesan 128 KB, integration timeout 29 s, 500 koneksi baru/detik/akun.

## Keputusan

1. **Transport:** API Gateway WebSocket API → Lambda (Python, di luar VPC) → DynamoDB. Broadcast dengan fan-out `PostToConnection` ke semua koneksi room (Query tabel `connections` lewat GSI `byRoom`). **Tanpa Redis/ElastiCache, tanpa Socket.io, tanpa Express.**
2. **Model sinkronisasi berbasis state.** Server menyimpan state playback `{roomId, mediaId, status, positionSec, playbackRate, updatedAtServerMs, version}`. Client menghitung posisi yang diharapkan:
   `expectedPositionSec = positionSec + (serverNowMs − updatedAtServerMs) / 1000 × playbackRate` (saat `playing`).
3. **Clock offset** diestimasi dengan ping/pong gaya NTP (sampel dengan RTT terkecil).
4. **Koreksi drift:** < 250 ms diabaikan; 250 ms – 1 s → `playbackRate` 0.95/1.05; > 1 s → hard seek.
5. **Optimistic concurrency:** setiap perintah membawa `baseVersion`; DynamoDB conditional write menerima hanya jika versi cocok; update usang ditolak (`VERSION_CONFLICT`).
6. **Peran:** `host`, `controller`, `viewer`. Default hanya host yang mengontrol playback; host bisa grant/revoke `controller`. Server menolak perintah playback dari `viewer`. Jika host putus, state playback dan peran tidak berubah; film tetap berjalan karena client menghitung posisi dari state server, dan host tampil offline lewat `participant.updated` (PRD BR-7, [architecture.md §7.4](../architecture.md#74-access-patterns) AP-13).
7. **Ketahanan koneksi (requirement inti):** heartbeat (pesan `heartbeat` jika tidak ada pesan lain selama 5 menit), reconnect otomatis dengan backoff, dan resync lewat `room.snapshot` (juga untuk peserta yang join terlambat).
8. **Autentikasi WebSocket:** room token di query string `$connect`, divalidasi Lambda REQUEST authorizer (browser tidak bisa set header WebSocket).

Detail: [architecture.md §5–§7](../architecture.md#5-alur-utama), kontrak: [ws-messages.md](../contracts/ws-messages.md).

## Alternatif yang Dipertimbangkan

| Alternatif | Kelebihan | Kekurangan | Alasan ditolak |
|---|---|---|---|
| WebSocket API + Lambda + ElastiCache Redis Pub/Sub (draft v0) | Redis cepat | Lambda tidak bisa subscribe; butuh VPC + NAT; biaya tetap | Tidak bisa jalan dan melanggar larangan NAT/ElastiCache |
| Socket.io/Express di EC2 | Library populer, room bawaan | Server tambahan untuk dikelola, scaling dan TLS sendiri | Tambah biaya dan beban operasional; API Gateway sudah managed |
| AWS AppSync (GraphQL subscriptions / Events) | Managed pub/sub | Model dan tooling berbeda, kurva belajar | Tim lebih familiar dengan REST + WebSocket; waktu 7 hari |
| Event relay tanpa state | Sederhana | Drift menumpuk; late join/reconnect tidak bisa dihitung | Tidak memenuhi NFR-1.2 dan F-2.5 |
| Peer-to-peer sync lewat WebRTC data channel | Latensi rendah | Tidak ada sumber kebenaran; sulit otorisasi peran | Konsistensi dan keamanan lebih sulit |

## Konsekuensi

- **Positif:** tidak ada server yang selalu hidup untuk sync; biaya per pesan sangat kecil; late join dan reconnect ditangani dengan mekanisme yang sama (snapshot); konflik ditangani di database.
- **Negatif / trade-off:**
  - Setiap pesan memicu invokasi Lambda. Cold start Python bisa menambah ratusan ms pada pesan pertama. Mitigasi: Lambda di luar VPC, inisialisasi client di luar handler, memory cukup, ukur sejak hari 4.
  - Fan-out dilakukan oleh Lambda (10 `PostToConnection` paralel per broadcast). Cukup untuk 10 peserta, tetapi tidak cocok untuk ribuan peserta per room.
  - Koneksi pasti terputus setiap ≤ 2 jam; client harus menangani reconnect dengan benar.
- **Tindak lanjut:** integration test untuk perintah paralel (NFR-2.5) dan disconnect paksa (NFR-2.4); load test 10 peserta (NFR-1.5).

## Verifikasi

| Klaim | Status | Sumber |
|---|---|---|
| Limit WebSocket API: 2 jam, idle 10 menit, frame 32 KB, payload 128 KB, integration timeout 29 s, 500 koneksi baru/detik/akun | verified (AWS docs) | [API Gateway quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html) |
| Durasi eksekusi Lambda maksimal 900 detik (15 menit) | verified (AWS docs) | [Configure Lambda function timeout](https://docs.aws.amazon.com/lambda/latest/dg/configuration-timeout.html) |
| Karena itu Lambda tidak bisa menjadi subscriber Redis Pub/Sub jangka panjang | prior knowledge, unverified | Kesimpulan dari baris di atas: subscriber Pub/Sub butuh proses yang hidup terus |
| Koneksi baru terbentuk setelah `$connect` selesai; jika `$connect` gagal, koneksi tidak dibuat | verified (AWS docs) | [$connect dan $disconnect routes](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-route-keys-connect-disconnect.html) |
| `$disconnect` bersifat best-effort (tidak dijamin terkirim) | verified (AWS docs) | [$connect dan $disconnect routes](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-route-keys-connect-disconnect.html) |
| `PostToConnection` mengembalikan 410 Gone (`GoneException`) untuk koneksi yang sudah putus | verified (AWS docs) | [Troubleshoot 410 GoneException](https://repost.aws/knowledge-center/410-gone-api-gateway) |
| Runtime `python3.14` tersedia di Lambda | verified (AWS docs) | [Lambda runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html) |
