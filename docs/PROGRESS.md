# PROGRESS — Log Harian Proyek

> Nama produk masih nama kerja; difiksasi Senin 2 Nov 2026.

Dokumen hidup (living doc). Setiap hari kerja, setiap anggota yang mengerjakan sesuatu menambah poin di entri hari itu. Entri terbaru di **atas**. Satu entri per hari; jika sudah ada, tambahkan poin ke entri yang sama.

Aturan:
- Tulis singkat: poin-poin, bukan paragraf panjang.
- Setiap keputusan harus punya alasan. Keputusan besar juga dibuat ADR dan di-link di sini.
- Blocker ditulis dengan pemilik dan apa yang dibutuhkan untuk lepas dari blocker.
- Jangan menulis secret, password, atau token di sini.

## Template Entri

```markdown
## YYYY-MM-DD (Hari)

**Selesai**
- [Role] Apa yang selesai (link PR/commit)

**Keputusan + alasan**
- Keputusan — alasan (link ADR jika ada)

**Blocker**
- Blocker — pemilik — yang dibutuhkan

**Berikutnya**
- [Role] Rencana kerja berikutnya

**Biaya & credits** (wajib setiap Senin, opsional hari lain)
- Biaya bulan berjalan: $__ | Sisa credits: $__ | Alert budget terakhir: __%
```

## 2026-11-25 (Rabu)

**Selesai**
- [Backend] Menambah route moderasi Host sesuai `openapi.yaml` di `feat/backend-host-moderation-routes`: `PUT`/`DELETE /rooms/{roomId}/controllers/{participantId}` dan `DELETE /rooms/{roomId}/participants/{participantId}` (kick atomik DynamoDB, putus WebSocket, best-effort remove LiveKit).
- [Backend] Menambah `verify_cognito_jwt` (RS256 via JWKS Cognito) pada `POST /rooms/{roomId}/join`, membaca `authorizer.jwt.claims.sub` di `POST /rooms`, dan memperbaiki env `COGNITO_APP_CLIENT_ID` di `core/config.py`. 51 unit test `pytest` + simulasi 11 langkah `simulate_party.py` + `ruff` lolos.
- [FE-Player] Menyelesaikan integrasi katalog (`GET /catalog`), form buat room (`POST /rooms`), dan modal join tamu (`/r/:roomId`, `GET /rooms/{roomId}`) di branch `feat/player-catalog-room-integration` beserta `frontend/.env.example` yang aman (default mock lokal).
- [FE-Social] Menyelesaikan wiring `ChatSidebar`, `VideoGrid`, `VideoTile` (track attachment + speaking indicator), `MediaControls`, `ReactionOverlay`, `ReactionPicker`, koneksi LiveKit (`POST /rooms/{roomId}/rtc-token`), dan aksi kontrol/kick di branch `feat/social-webrtc-chat-integration`. 60 unit test Vitest, Oxlint (0 warning/0 error), Vite build, dan 22 selftest `mock-server` lolos.

**Keputusan + alasan**
- Verifikasi JWT Cognito pada `/rooms/{roomId}/join` memakai `PyJWT` (`RS256` JWKS) secara fail-closed — mencegah spoofing `sub` pada rute `$default` yang tidak memakai authorizer API Gateway; tanpa menambah dependency baru.
- `frontend/.env.example` hanya berisi template mock lokal (`http://localhost:8787`, `VITE_HLS_WITH_CREDENTIALS=false`) — mencegah kebocoran ID resource AWS dan mencegah development lokal menembak resource produksi.
- Sistem user management penuh tetap ditunda sebagai rencana masa depan (*future plan*) di luar v1 sesuai PRD §6.2 & §7 US-1.6.

**Blocker**
- Paket Lambda (`backend/dist/backend.zip`) perlu di-build ulang (`build_lambda.sh`) dan di-deploy setelah PR Backend merge agar route moderasi dan verifier Cognito aktif di AWS produksi.
- Workflow CI/CD deploy frontend (`deploy.yml`) dan upload file poster ke S3 media bucket (`posters/`) masih menunggu penyelesaian dari Platform/RTC/Media.

**Berikutnya**
- [Backend] Review + squash merge PR Backend, FE-Player, dan FE-Social ke `main`, lalu build ulang Lambda dan uji E2E di cloud.
- [Platform] Menyiapkan workflow deploy frontend di `.github/workflows/` dengan variabel build `VITE_*` non-secret.

---

## 2026-11-22 (Minggu)

**Selesai**
- [Lead] Wiring `module "rtc"` (LiveKit EC2) di `infra/terraform/envs/prod`: tambah data source `aws_vpc.default` + `aws_subnets.default_public`, block `module "rtc"` (subnet default VPC, `route53_zone_id` default `null`), sambung `livekit_url = module.rtc.livekit_url` ke `module "api"`, variabel baru (`route53_zone_id`, `rtc_instance_type`, `rtc_schedule_enabled`) + contoh di `terraform.tfvars.example`, dan 5 output `rtc_*`. `terraform fmt -check` bersih dan `terraform validate` lulus (Terraform 1.17.1, provider AWS 6.73.0, `init -backend=false`). **Belum di-apply.**
- [RTC/Media] Transcode 3 film Blender selesai dan lolos `verify` di laptop: Big Buck Bunny (596 s, 727 MB), Sintel (888 s, 1.1 GB), Tears of Steel (734 s, 901 MB) — total ±2.7 GB, masing-masing 4 rendition HLS 360p–1080p + poster + `manifest.json`. ffmpeg Docker `linuxserver/ffmpeg:9.0.2-cli-ls89`, output di luar repo (`~/watchparty-media/hls`). Kecepatan ±1,2–1,5× real-time (lebih cepat dari estimasi 0,2–0,4× di README karena laptop berbeda). `upload`/`register` ke AWS belum dijalankan (lihat blocker).

**Keputusan + alasan**
- Wiring dikerjakan Lead sebagai pengisi gap (modul `rtc` sudah ada sejak 2026-11-19 tetapi belum terpasang di `envs/prod`). Lead = Accountable untuk `envs/` dan modul `rtc` (RACI PRD §11.2); perubahan hanya memanggil modul, tidak mengubah isinya. PR akan di-review Platform (owner `envs/`) dan RTC/Media (owner `rtc`) sebelum merge.
- `subnet_id` memakai subnet default VPC sementara, sesuai README modul `rtc`; diganti ke `module.network` saat modul itu ada.
- `route53_zone_id` default `null` agar `validate` dan rencana awal aman tanpa membuat record DNS sebelum delegasi final dipakai di env ini.
- Transcode dijalankan manual/offline di laptop (bukan otomatis/MediaConvert) sesuai ADR-0005: katalog tetap 3 film, MediaConvert dilarang untuk akun Free plan, biaya transcoding $0.

**Blocker**
- Apply `module "rtc"` belum bisa — Platform/RTC/Media — butuh parameter SSM `/watchparty/prod/livekit-api-key` dan `/watchparty/prod/livekit-api-secret` (bootstrap §7) dan record `rtc.`/`turn.` mengarah ke EIP agar Caddy menerbitkan sertifikat.
- `upload` + `register` 3 film belum bisa — Platform/RTC/Media — butuh media bucket (modul `edge` di-apply) + profil AWS dengan policy `media-publisher`, lalu tabel `main` (modul `data`) + `APP_DOMAIN` untuk `register`.

**Berikutnya**
- [Platform] Review + apply `module "rtc"` setelah prasyarat SSM/DNS siap; sesudah apply, verifikasi `dig`/`curl` sesuai README modul dan runbook LiveKit.
- [RTC/Media] Jalankan `upload` + `register` 3 film setelah modul `edge`/`data` ter-apply dan policy `media-publisher` ter-attach.

---

## 2026-11-19 (Kamis)

**Selesai**
- [RTC/Media] Pipeline HLS di `media/`: `scripts/publish_media.py` dengan 4 langkah (`transcode` lewat ffmpeg Docker yang di-pin, `verify`, `upload` ke media bucket dengan `Content-Type` dan `Cache-Control: immutable`, `register` item katalog). `catalog.json` berisi 3 film dengan lisensi, atribusi resmi, dan SHA-256 file sumber. 22 unit test lulus (pytest + moto), `ruff check` dan `ruff format --check` bersih. Workflow CI baru `.github/workflows/media-ci.yml`. Dokumentasi di [media/README.md](../media/README.md).
- [RTC/Media] Transcode Sintel, Tears of Steel, dan Big Buck Bunny dengan script baru dimulai di laptop RTC/Media (±0,18× real-time). Hasil verifikasi dicatat setelah selesai.
- [RTC/Media] Key pair RSA 2048 untuk CloudFront signed cookies dibuat. Public key di `infra/terraform/modules/edge/keys/`. Private key disimpan di luar repo dan belum masuk SSM.
- [RTC/Media + Platform] Modul baru `infra/terraform/modules/edge`: web bucket dan media bucket privat (OAC), public key + key group, behavior `/media/*` (signed cookies wajib), `/posters/*` (publik), CloudFront Function SPA routing, response headers keamanan, record alias apex opsional, dan policy IAM `media-publisher`. `terraform fmt -check` dan `validate` lulus (Terraform 1.17.1, provider AWS 6.73.0), `tflint` v0.66.0 tanpa temuan (termasuk ruleset AWS 0.50.0). Modul belum dipasang di `envs/prod`.
- [RTC/Media] Delegasi DNS `watchparty.chescloud.my.id` sudah aktif: `dig NS` (19 Nov) mengembalikan 4 nameserver `awsdns`. Blocker delegasi NS di entri 9–11 Nov sudah tidak berlaku.

**Keputusan + alasan**
- Ladder memakai lebar tetap (640/854/1280/1920 px) dan tinggi mengikuti sumber — Sintel (1920×818) dan Tears of Steel (1920×800) lebih lebar dari 16:9, jadi tidak perlu letterbox atau upscale ([architecture.md §5.4](architecture.md#54-pipeline-media)).
- Item katalog menulis `posterPath`/`playbackPath`/`sortOrder` sesuai architecture.md §7.2, ditambah `posterUrl`/`playbackUrl` untuk sementara — `RoomRepository` backend masih membaca URL lengkap.
- `/media/*` dan `/posters/*` memakai managed cache policy `CachingOptimizedForUncompressedObjects` — cache key tanpa cookie, query string, dan header, sehingga semua peserta memakai cache yang sama (NFR-1.8). Tanpa custom error response agar 403 film tidak berubah menjadi HTML (ADR-0005).
- Public key (PR2) dan modul `edge` (PR3) masuk satu PR — modul membaca file public key, jadi PR2 sendirian tidak bisa divalidasi.

**Blocker**
- Private key CloudFront belum di SSM `/watchparty/prod/cloudfront-signing-private-key` — Platform — user `media-engineer` hanya punya SSM read-only, jadi Platform menjalankan `put-parameter` atau memberi izin untuk parameter ini.
- Modul `edge` belum bisa di-apply dengan domain asli — Platform — butuh sertifikat ACM `us-east-1` (modul `dns`) dan wiring di `envs/prod/main.tf` (contoh ada di README modul).
- Upload film dan registrasi katalog belum bisa dijalankan — Platform — policy `media-publisher` perlu di-attach ke grup `watchparty-rtc-media` setelah modul `edge` di-apply.
- Algoritma signature signed cookies (SHA-1 dengan 3 cookie, atau SHA-256 dengan cookie tambahan `CloudFront-Hash-Algorithm`) — Lead + Backend + RTC/Media — dibutuhkan sebelum handler `media-cookies` ditulis.

**Berikutnya**
- [RTC/Media] Verifikasi hasil transcode 3 film; upload dan register setelah `edge` di-apply; handler `media-cookies` dan perbaikan `rtc-token` bersama Backend; modul `rtc` (LiveKit di EC2).

---

## 2026-11-11 (Rabu)

**Selesai**
- [Platform / Backend] Provisioning dan deployment penuh infrastruktur backend ke AWS prod (`ap-southeast-1`) via root module Terraform `infra/terraform/envs/prod/`:
  - DynamoDB: tabel `watchparty-prod-main` (PK/SK, on-demand, TTL `expiresAt`) dan `watchparty-prod-connections` (PK `connectionId`, GSI `byRoom`, TTL `expiresAt`).
  - Cognito: User Pool `watchparty-prod-user-pool`, User Pool Client `watchparty-prod-web-client`, dan domain host `watchparty-prod-auth`.
  - HTTP API Gateway v2: ID `8idyfamh69`, stage `$default` dengan integrasi Lambda `watchparty-prod-rest-api` dan Cognito JWT Authorizer pada rute terproteksi.
  - WebSocket API Gateway v2: ID `bwb0eqn7ee`, stage `prod` dengan rute `$connect`, `$disconnect`, `$default`, integrasi Lambda handler, serta access log ke CloudWatch Logs.
  - Setup IAM role akun untuk API Gateway push logs ke CloudWatch (`watchparty-prod-apigateway-cloudwatch-role`).
  - 5 fungsi Lambda Python 3.14 (arm64): `rest-api`, `ws-authorizer`, `ws-connect`, `ws-disconnect`, `ws-message`.
- [Backend] Pemecahan masalah runtime Lambda dan penyelarasan lingkungan live:
  - Penambahan environment variable `PYTHONPATH = "/var/task/src"` pada seluruh 5 fungsi Lambda di Terraform (`modules/api/lambda.tf` & `modules/realtime/lambda.tf`), menuntaskan isu import `from core...` dan `from handlers...`.
  - Perbaikan syntax multi-exception clause di `backend/src/handlers/rest_api/app.py`.
  - Rebuild paket distribusi Lambda zip (`backend/dist/`).
- [Backend] Verifikasi & audit live API di cloud:
  - `GET /health` -> 200 OK (`{"status":"ok"}`).
  - `GET /catalog` -> 200 OK mengembalikan 3 item film default (*Sintel*, *Big Buck Bunny*, *Tears of Steel*).
  - `POST /rooms` -> 401 Unauthorized (Cognito JWT authorizer memblokir akses tanpa token).
  - `POST /rooms/{id}/join` -> 404 Not Found (error handling DynamoDB bekerja).
  - WebSocket handshake tanpa token -> 401 Unauthorized (Lambda REQUEST authorizer memblokir koneksi tidak valid).

**Keputusan + alasan**
- Mengonfigurasi `PYTHONPATH = "/var/task/src"` via environment variable Lambda Terraform dibanding merestrukturisasi direktori build, agar tetap konsisten dengan struktur direktori `src/` dan konfigurasi `pyproject.toml`.

**Blocker**
- Menunggu delegasi 4 record NS Route 53 ke Cloudflare DNS untuk domain `watchparty.chescloud.my.id`.

**Berikutnya**
- [Frontend / Backend] Integrasi koneksi WebSocket client dari frontend ke API Gateway WebSocket live.

---

## 2026-11-10 (Selasa)

**Selesai**
- [Backend] Penyempurnaan router pesan WebSocket (`ws_message/handler.py`):
  - Penambahan broadcast `MsgParticipantUpdated` ke seluruh room saat menerima event `player.status`, menjamin kepatuhan 100% terhadap PRD AC-1.5.3 dan F-2.4.
  - Optimasi `RoomRepository.update_player_status` menggunakan DynamoDB `ReturnValues="ALL_NEW"` untuk efisiensi update status player tanpa query round-trip tambahan.
  - Penyelarasan skema `ReactionAddedPayload` (`models/websocket.py`) dengan `docs/contracts/ws-messages.schema.json` (hanya `participantId` dan `emoji` dengan `additionalProperties: false`).
  - Refactoring handler pesan menjadi fungsi modular `_dispatch_message` dan `_handle_playback_command`, menurunkan cognitive complexity SonarQube ke batas aman.
  - Penambahan unit tests di `backend/tests/unit/test_handlers_ws.py` untuk menguji broadcast `player.status` dan `reaction.send` (total 28 unit tests lulus 100%).
  - Pembaruan skrip simulasi multi-client `backend/tests/simulate_party.py` (11 langkah lulus 100%).
  - Penyelarasan dokumentasi WebSocket pada `backend/README.md`.

**Keputusan + alasan**
- Penyelarasan ketat terhadap `ws-messages.schema.json` pada payload reaksi dan event broadcast player status — mencegah kegagalan validasi payload pada client frontend yang menerapkan skema kontrak JSON resmi.

**Blocker**
- Menunggu delegasi 4 record NS Route 53 ke dashboard DNS Cloudflare domain `chescloud.my.id`.

**Berikutnya**
- [Platform / Backend] Penyiapan modul root Terraform `infra/terraform/envs/prod/` untuk eksekusi deployment infrastruktur ke akun AWS pribadi `944551807382`.

---

## 2026-11-09 (Senin)

**Selesai**
- [Platform/Infra] Setup fondasi infrastruktur dan akses terisolasi pada akun AWS pribadi `944551807382` di region Singapura (`ap-southeast-1`):
  - Pembuatan policy financial guardrail `WatchParty-CostAndRegionGuardrail` untuk memblokir otomatis NAT Gateway, service mahal (ElastiCache, MediaConvert, Chime), dan pembatasan peluncuran resource hanya di Singapura (`ap-southeast-1`) & N. Virginia (`us-east-1`).
  - Pembuatan IAM group `watchparty-platform` dan user `platform-alfido` (AdministratorAccess + Guardrail) serta verifikasi penolakan otomatis (*explicit deny*) di luar region Singapura.
  - Pembuatan IAM group `watchparty-rtc-media` dan user `media-engineer` dengan hak akses terbatas ke EC2, S3, dan SSM ReadOnly + Guardrail.
  - Pembuatan S3 backend state bucket `watchparty-tfstate-944551807382` dengan versioning, SSE-S3 encryption, dan public access block.
  - Pembuatan parameter rahasia SSM SecureString (`/watchparty/prod/room-token-signing-key`, `/watchparty/prod/livekit-api-key`, `/watchparty/prod/livekit-api-secret`).
  - Pembuatan Route 53 hosted zone untuk `watchparty.chescloud.my.id` (Zone ID `Z04089962SK6XCPTK8YBC`).

**Keputusan + alasan**
- Penggunaan akun AWS pribadi `944551807382` sebagai target infrastruktur utama dengan pagar pengaman (guardrail) — mengatasi kendala keterbatasan SCP region Sydney pada akun teman (`284043564012`) sehingga tim dapat melakukan deployment di region Singapura dengan latensi optimal dan biaya terkendali.
- Pemisahan grup IAM berbasis role dengan guardrail terlampir — memastikan setiap anggota tim tetap memegang jobdesk masing-masing tanpa risiko salah launch service mahal atau menembus batas free-tier.

**Blocker**
- Menunggu delegasi 4 record NS Route 53 ke dashboard DNS Cloudflare domain `chescloud.my.id`.

**Berikutnya**
- [Platform] Update 4 record NS di Cloudflare dan eksekusi deployment Terraform backend/infrastruktur ke akun `944551807382`.

---

## 2026-11-09 (Senin)

**Selesai**
- [FE-Layout] Verifikasi & poles responsivitas mobile/tablet/desktop: halaman penguji dihapus setelah selesai; layout 3-kolom drawer (di bawah `xl`) sudah terverifikasi bekerja di 390px, 820px, dan 1440px tanpa overflow horizontal (`tab` dev server port 5174).
- [FE-Layout] Perbaikan kecil: root `App` dari `w-screen` → `w-full` (mencegah overflow horizontal akibat scrollbar di mobile), baris metadata film diberi `flex-wrap` (agar "Subtitel Indonesia" tidak terdorong menyendiri di mobile), dan tombol play pemutar video diperbesar di mobile (`w-8 h-8` di bawah `sm`) agar target sentuh lebih nyaman.
- [FE-Social] Pembersihan reaksi emoji: menghapus reaksi `fire` (🔥) dan `clap` (👏) sesuai spesifikasi kontrak, menyisakan 5 emoji resmi: `thumbsUp` (👍), `heart` (❤️), `laugh` (😂), `wow` (😮), dan `sad` (😢).
- [FE-Player] Konsolidasi model `PlaybackState` menjadi satu definisi tunggal (single source of truth) di `frontend/src/types/watchparty.ts` dan di-reexport dari `frontend/src/types/index.ts`.
- [FE-Social] Penyempurnaan status player untuk mendukung `"syncing"`: penataan badge status `Syncing` pada kartu peserta di `CenterTheater` dan tab Anggota di `RightSidebar`, serta sinkronisasi tipe `PlayerStatus` (`'unknown' | 'buffering' | 'syncing' | 'ready'`).

**Keputusan + alasan**
- Menghapus fire & clap dan hanya mempertahankan 5 emoji standar agar selaras 100% dengan skema WebSocket backend (`docs/contracts/ws-messages.schema.json` & `ws-messages.md`).
- Menjadikan `types/watchparty.ts` sebagai lokasi deklarasi tunggal `PlaybackState` untuk mencegah duplikasi dan perbedaan definisi tipe antar modul.

**Blocker**
- Tidak ada.

**Berikutnya**
- Integrasi WebSocket client ke store sosial dan pemutar HLS.

---

## 2026-11-08 (Minggu)

**Selesai**
- [RTC/Media] Verifikasi lisensi 3 film: Big Buck Bunny, Sintel, dan Tears of Steel berlisensi CC BY 3.0 (logo dikecualikan). Sumber: peach.blender.org, durian.blender.org/sharing, mango.blender.org/sharing. Sintel wajib menyertakan seluruh credit scroll saat diputar.
- [RTC/Media] LiveKit lokal untuk development: `livekit/livekit-server:v1.13.11` (tag di-pin) mode dev + LiveKit CLI v2.19.3. Uji 3 peserta di satu room: video/audio diteruskan SFU, simulcast aktif, peserta dengan kamera dan mic mati tetap melihat dan mendengar peserta lain.
- [RTC/Media] Uji pipeline HLS dengan Big Buck Bunny (596 s): 4 rendition 360p/480p/720p/1080p (rata-rata ~0,9/1,5/2,9/5,0 Mbps), fMP4, segmen 4 s, keyframe setiap 2 s sejajar di semua rendition, total 733 MB. Diputar dengan hls.js 1.7.4: pindah kualitas manual dan seek berjalan.

**Keputusan + alasan**
- Transcode memakai image Docker `linuxserver/ffmpeg:9.0.2-cli-ls89` — `ffmpeg-free` di Fedora tidak punya encoder libx264, dan image yang di-pin memberi hasil yang sama di semua laptop anggota.

**Blocker**
- Tidak ada (status akun AWS dan modul fondasi ditanyakan ke Platform).

**Berikutnya**
- [RTC/Media] Uji ABR otomatis dengan throttling ~1 Mbps (AC-2.3.1); transcode Sintel dan Tears of Steel; script `publish_media.py`.

---

## 2026-11-06 (Jumat)

**Selesai**
- [FE-Social] Penyempurnaan fidelitas ikon dan layout 1:1 sesuai `Watch Party · Ruang film.png`: pembuatan komponen ikon kustom (`Icons.tsx`: Logo TV antena retro, Popcorn bergaris merah-putih, Bulan sabit emas, Gamepad, Radio broadcast gelombang konsentris, Equalizer suara animasi, Subtitel, PiP, Fullscreen sudut 4-arah), penataan layout grid horisontal kartu peserta 'Satu layar, enam cerita' (avatar sisi kiri dan status presensi di sisi kanan), serta pembungkusan badge rating '13+' pada metadata film.
- [FE-Social] Penyempurnaan detail pixel-perfect antarmuka ruang film sesuai `Watch Party · Ruang film.png`: penyelarasan presisi layout 3-kolom (header top-bar terpadu 56px, dock vertikal popcorn/bulan/gamepad, penataan sub-menu Malam Minggu, video player dengan visual roadtrip senja & subtitel 2-baris & kontrol bar 1080p/PiP, 6 kartu peserta 'Satu layar, enam cerita' dengan avatar dan status presensi yang tepat, serta panel obrolan kanan dengan badge online, kartu sambutan, bubble chat tereaksi, dan indikator audio WebRTC 24ms).
- [FE-Social] Rekreasi antarmuka ruang film berbasis desain `Watch Party · Ruang film.png`: layout 3-kolom (dock & sidebar navigasi kiri, pemutar film tengah dengan subtitel & reaksi melayang & 6 kartu cerita peserta, serta sidebar obrolan kanan dengan linimasa pesan, reaksi terlampir, dan status audio RTC terhubung).
- [FE-Social] Inisialisasi scaffolding frontend berbasis React 19, Vite, TypeScript, Tailwind CSS, dan Zustand di direktori `frontend/`.
- [FE-Social] Implementasi modul video chat LiveKit (`VideoGrid`, `VideoTile`, `MediaControls`) dengan layout adaptif hingga 10 tile, kepatuhan privasi (kamera/mic default mati saat join), indikator kualitas sinyal, dan penanganan graceful degradation saat LiveKit down.
- [FE-Social] Implementasi obrolan teks real-time (`ChatSidebar`, `ChatMessageList`, `ChatInput`) dengan rendering aman anti-XSS, pembatasan 1–500 karakter, riwayat pesan snapshot, dan enforcement rate limit 5 pesan per 10 detik.
- [FE-Social] Implementasi overlay emoji reactions melayang (`ReactionOverlay`, `ReactionPicker`) dengan batas laju 10 reaksi per 10 detik dan auto-dismiss 3 detik.
- [FE-Social] Implementasi panel daftar peserta (`ParticipantList`) dengan badge peran, status player (Ready/Syncing/Buffering), dan kepatuhan aturan presensi Host saat disconnect (PRD BR-7 & AC-1.5.2).
- [FE-Social] Penambahan suite unit test Vitest untuk verifikasi logika rate limiting dan presensi host/guest dengan kelulusan 100% (4 tests), 0 error lint, dan verifikasi build produksi berhasil.
- [Backend] Pembuatan skrip simulasi multi-client ujung ke ujung (`backend/tests/simulate_party.py`) yang memverifikasi 10 langkah alur lengkap: katalog media, pembuatan room, join guest via REST, koneksi WebSocket & seat capacity locking, sinkronisasi pemutaran video berbasis versi, penanganan tabrakan versi (optimistic concurrency conflict / `VERSION_CONFLICT`), promosi peran Host ke Controller, obrolan realtime, verifikasi snapshot ruangan (AP-6), dan kepatuhan aturan presensi Host saat offline (PRD BR-7).
- [Backend] Penanganan bug `ExpressionAttributeNames` pada `PlaybackRepository.update_playback_state` saat aksi `SEEK` dan refactoring nested conditional expression untuk kebersihan kode.
- [Backend] Seluruh suite pengujian diverifikasi lulus 100%: 26 unit test (`uv run pytest`), simulasi multi-client (`tests/simulate_party.py`), linter & formatter (`ruff check` & `ruff format`), serta 4 modul Terraform (`data`, `auth`, `api`, `realtime`).
- [Backend] Verifikasi audit SonarQube dengan hasil 0 Bugs, 0 Vulnerabilities, 0 Code Smells, dan 0 Security Hotspots.
- [Backend] Penyusunan dokumentasi panduan integrasi dan handoff Frontend komprehensif pada `backend/README.md` mencakup katalog REST API, WebSocket protocol, model optimistic concurrency, dan cara menjalankan local development mock server.

**Keputusan + alasan**
- Penulisan skrip simulasi `simulate_party.py` menggunakan in-memory Moto DynamoDB agar tim dapat menguji alur multi-client secara deterministik, cepat, dan terisolasi tanpa memerlukan kredensial AWS sungguhan.
- Pendokumentasian lengkap kontrak payload REST dan event WebSocket langsung di `backend/README.md` untuk mempercepat proses handoff dan integrasi bagi Frontend engineer.

**Blocker**
- Tidak ada blocker pada sisi backend. Seluruh komponen backend, modul Terraform, skrip packaging, CI workflow, dan dokumentasi handoff telah siap.

**Berikutnya**
- [FE-Player] Implementasi pemutar video HLS (`hls.js`) dan modul sinkronisasi (`sync client`) dengan kalkulasi drift, clock offset NTP-style, adaptasi playback rate, dan penanganan signed cookies.
- [Frontend / Integrasi] Pengujian langsung antarmuka dengan `backend/local_server.py`.

---

## 2026-11-04 (Rabu)

**Selesai**
- [Backend] Setup repository GitHub dan push initial commit ke `https://github.com/Slameteka/Watch-party` (branch `main`).
- [Backend] Setup environment backend dengan `uv`, Python 3.14, Pydantic v2, `ruff`, dan `pytest`.
- [Backend] Implementasi core models (`common`, `room`, `rest`, `websocket`) dengan validasi `extra="forbid"` dan format JSON `camelCase` sesuai kontrak.
- [Backend] Implementasi auth token JWT HS256 (`roomToken`, TTL 4 jam).
- [Backend] Implementasi DynamoDB repository layer (`room_repo`, `playback_repo` dengan optimistic concurrency versioning, `connection_repo` dengan penguncian kapasitas kursi).
- [Backend] Implementasi REST API Lambda handler (`handlers/rest_api/`) untuk katalog, buat room, join room, refresh session, signed cookies, dan RTC token.
- [Backend] Implementasi WebSocket Lambda handlers (`ws_authorizer`, `ws_connect`, `ws_disconnect`, `ws_message`) dan broadcast helper dengan auto-prune koneksi 410 Gone.
- [Backend] Pembuatan `local_server.py` untuk pengetesan hands-on lokal tanpa ketergantungan cloud.
- [Backend] Seluruh 26 unit test lulus (`uv run pytest`) dan lulus lint/format (`uv run ruff check` & `ruff format`).
- [Backend] Pembuatan 4 modul Terraform backend (`infra/terraform/modules/{data,auth,api,realtime}`) dengan least-privilege IAM, rate limiting/throttling, CORS, secure access logs, dan validasi `terraform fmt` serta `terraform validate` lulus 100%.
- [Backend] Pembuatan script packaging Lambda `backend/scripts/build_lambda.sh` untuk Python 3.14 arm64 (`aarch64-manylinux2014`) berbasis `uv export` dan `uv pip install`.
- [Backend] Pembuatan GitHub Actions workflow `.github/workflows/backend-ci.yml` yang mencakup linting, testing, validasi Terraform, dan build packaging verification.
- [Backend] Setup dan audit SAST lokal dengan SonarQube: Quality Gate PASSED, 0 Bugs, 0 Vulnerabilities, 0 Code Smells, 0 Security Hotspots, dan 0 duplikasi pada 4.320 baris kode.
- [Backend] Refactoring exception `ws_authorizer` (`UnauthorizedError`) dan modernisasi blok GSI DynamoDB (`key_schema`) serta HTTP access logs untuk kebersihan kode 100%.

**Keputusan + alasan**
- Pemisahan clean architecture antara core domain/repository dengan Lambda handlers agar handlers tetap tipis dan mudah diuji secara modular.
- Penambahan runner `local_server.py` berbasis mock DynamoDB (moto) agar tim bisa melakukan manual testing dan integrasi cepat tanpa harus menunggu deployment cloud.
- Konfigurasi Lambda packaging di modul Terraform dengan data source dummy fallback agar modul dapat di-validate dan di-plan secara independen tanpa ketergantungan file zip build eksternal.
- Penggunaan modul standar Python `zipfile` pada `build_lambda.sh` agar packaging tidak bergantung pada binary system utility `zip` dan dapat berjalan portabel di runner mana pun.

**Blocker**
- Menunggu penyiapan akun AWS dan bootstrap S3 backend / parameter SSM oleh role Platform sebelum deploy cloud.

**Berikutnya**
- [Backend] Push branch `feat/backend-core-handlers` dan pembuatan Pull Request ke `main` setelah review tim, serta koordinasi integrasi API dengan Frontend.

---

## 2026-10-31 (Sabtu)

**Selesai**
- [Penulis draft PRD] Draft v0 diarsipkan tanpa perubahan di [archive/PRD-watch-party-v0-draft.md](archive/PRD-watch-party-v0-draft.md).
- [Penulis draft PRD] PRD ditulis ulang menjadi versi **2.0-rc (menuju freeze prd-v1.0)**: [PRD-watch-party.md](PRD-watch-party.md).
- [Penulis draft PRD] Dokumen pendukung dibuat: [architecture.md](architecture.md), [ADR 0001–0008](adr/README.md), [contracts/openapi.yaml](contracts/openapi.yaml), [contracts/ws-messages.md](contracts/ws-messages.md), [runbooks/bootstrap.md](runbooks/bootstrap.md), CONTRIBUTING.md, AGENTS.md, README.md, template PR.
- [Penulis draft PRD] Review konsistensi selesai dan semua 18 temuan diperbaiki (PRD 2.0-rc revisi 1, architecture.md, contracts, ADR 0001–0008, CONTRIBUTING.md, runbook). Ringkasan perubahan ada di Changelog PRD §19 dan Changelog ws-messages §9.
- [Penulis draft PRD] **Bukti validasi** (dijalankan 31 Okt 2026 setelah revisi 1):

  | Cek | Perintah | Hasil |
  |---|---|---|
  | OpenAPI 3.1 valid | `uvx --from openapi-spec-validator openapi-spec-validator docs/contracts/openapi.yaml` (v0.9.0) | `OK`, exit 0 |
  | OpenAPI lint | `npx -y @redocly/cli lint docs/contracts/openapi.yaml` (aturan `recommended`) | "Your API description is valid", exit 0, tanpa warning |
  | Respons 429 di semua operation | Script Python (PyYAML) yang membaca `responses` setiap operation | 12 dari 12 operation punya `429` |
  | Mermaid | `npx -y @mermaid-js/mermaid-cli` v12.0.0 untuk 6 blok (1 di PRD, 5 di architecture.md) | 6 dari 6 berhasil di-render, exit 0, tidak ada "Syntax error" di output |
  | `ws-messages.schema.json` | — | Belum dibuat (sengaja, lihat keputusan di bawah), jadi tidak ada JSON yang divalidasi |
  | Arsip draft v0 | `sha256sum docs/archive/PRD-watch-party-v0-draft.md`; `stat` | SHA-256 `310f808a0f24c3e6f6053fe8530195686277b292c752d4654be5bcf44e036a36`, 10.939 byte, mtime `2026-10-31 15:39:41 +0700` (waktu file asli, sebelum rewrite PRD pukul 18:16; tersalin dengan atribut asli) |
  | Tidak ada commit | `git log`; `git status --short` | Belum ada commit; semua file untracked di dalam repo |

- [Penulis draft PRD] Review konsistensi pass 2: 5 temuan diperbaiki (PRD 2.0-rc revisi 2, architecture.md §5.2/§7.4/§9.3, openapi.yaml, ws-messages.md revisi 2):
  - AP-11 (kick) sekarang mengirim `participant.left` (`kicked`) ke peserta lain sebelum `session.ended` ke X, sesuai `kickParticipant` dan AC-1.6.1.
  - AP-14 kasus ganti koneksi sekarang membuat item `connections` untuk koneksi baru, dan punya fallback jika kondisi `connectionId = :old` gagal (baca ulang satu kali, lalu kasus baru terhubung dengan cek kapasitas).
  - Teks `ROOM_FULL` di openapi.yaml dan ws-messages.md (§5.3, §6) serta BR-3 di PRD mengikuti aturan 9 tempat guest. UI menampilkan "Room penuh" hanya dari error `ROOM_FULL`, bukan dari `participantCount` (deskripsi `Room.participantCount`). Field baru `guestSeatsAvailable` tidak ditambahkan agar kontrak tetap kecil.
  - IAM `ws-connect`/`ws-disconnect` mendapat `dynamodb:Query` pada `connections/index/byRoom`.
  - Kolom fitur `session.ended` di ws-messages §4 menyebut F-2.5 (`expired`, `replaced`).
- [Penulis draft PRD] **Bukti validasi pass 2** (31 Okt 2026, setelah revisi 2):

  | Cek | Perintah | Hasil |
  |---|---|---|
  | OpenAPI 3.1 valid | `uvx --from openapi-spec-validator openapi-spec-validator docs/contracts/openapi.yaml` (v0.9.0) | `OK`, exit 0 |
  | OpenAPI lint | `npx -y @redocly/cli lint docs/contracts/openapi.yaml` | "Your API description is valid", exit 0, tanpa warning |
  | Respons 429 | Script Python (PyYAML) | 12 dari 12 operation punya `429` |
  | Mermaid | Tidak dijalankan ulang | Tidak ada blok Mermaid yang diubah di pass 2 (hanya tabel dan catatan teks) |
  | Arsip draft v0 | `sha256sum`; `stat` | Sama dengan pass 1: SHA-256 `310f808a…036a36`, 10.939 byte, mtime `2026-10-31 15:39:41 +0700` |
  | Tidak ada commit | `git log`; `git status --short` | Belum ada commit; semua file untracked di dalam repo |

  Catatan jujur soal arsip: file asli `docs/PRD-watch-party.md` sudah ditimpa oleh rewrite sebelum ada commit, jadi perbandingan byte-per-byte dengan file asli **tidak bisa diulang** sekarang. Yang bisa dibuktikan: hash di atas, ukuran, mtime asli yang terjaga, dan header arsip ("Versi Dokumen: 1.0 (Draft), 27 Oktober 2026"). Jika penulis draft masih punya salinan asli di tempat lain, jalankan `sha256sum` pada salinan itu dan bandingkan dengan hash di atas.

- [Penulis draft PRD] Keputusan fitur dari review PRD (A–D) diterapkan, dan skema WebSocket dibuat:
  - PRD (tetap satu entri changelog `2.0-rc`): BR-3 memakai `maxParticipants`; BR-6 digabung menjadi "tepat satu host, tidak bisa dipindahkan"; BR-7 baru (host putus); F-1.8 dan F-3.6 baru (Could); AC-1.3.3, AC-1.5.2 diperbarui; AC-2.5.5 dan AC-3.3.3 baru; glossary Room/Host.
  - architecture.md: §3.1/§3.2 (batas platform `room_max_participants` → env `ROOM_MAX_PARTICIPANTS`, kapasitas `maxParticipants − 1` tempat guest, rentang 2–10); §5.2 (diagram dan catatan host putus); §5.3 (grant LiveKit sama untuk semua peserta); §7.2 `META.maxParticipants`; §7.4 AP-2, AP-4, AP-13, AP-14 + catatan condition expression; §12.3 variabel baru; §13; daftar contracts di header.
  - openapi.yaml: schema `MaxParticipants` (2–10); `CreateRoomRequest.maxParticipants` opsional (default 10); `Room.maxParticipants` tidak lagi `const: 10`; teks `ROOM_FULL`, `joinRoom`, `refreshRoomSession`, `issueRtcToken`, `Participant.connected`.
  - ws-messages.md: kapasitas §1.1; presence host §1.2, §4, §4.2, §4.6 baru (dengan contoh); field tak dikenal di envelope client ditolak §2; `lastVersion ≥ 1`; `ROOM_FULL` §5.3/§6; `retryAfterSec ≥ 1`; contoh envelope §2 diperbaiki (payload `playback.command` sebelumnya kosong, tidak sesuai §3); changelog §9 digabung menjadi satu baris `v1 draft`.
  - File baru [contracts/ws-messages.schema.json](contracts/ws-messages.schema.json) (JSON Schema 2020-12, 8 pesan client + 10 pesan server). Di-link dari ws-messages.md, architecture.md, AGENTS.md, README.md, CONTRIBUTING.md (perintah cek).
  - ADR-0003 (keputusan 6: host putus) dan ADR-0004 (konteks: asal angka 10) diperbarui; keduanya masih Proposed.
- [Penulis draft PRD] **Bukti validasi** (31 Okt 2026, setelah perubahan A–D):

  | Cek | Perintah | Hasil |
  |---|---|---|
  | OpenAPI 3.1 valid | `uvx --from openapi-spec-validator openapi-spec-validator docs/contracts/openapi.yaml` (v0.9.0) | `OK`, exit 0 |
  | OpenAPI lint | `npx -y @redocly/cli lint docs/contracts/openapi.yaml` | "Your API description is valid", exit 0 |
  | Skema WS valid | `python3 -m json.tool` + `uvx --from check-jsonschema check-jsonschema --check-metaschema docs/contracts/ws-messages.schema.json` (v0.39.0) | JSON valid; "ok -- validation done", exit 0 |
  | Contoh ws-messages.md vs skema | Script Python sementara di `/tmp` (jsonschema 4.26, Draft202012Validator), sudah dihapus | 8 dari 8 contoh lolos (setelah contoh envelope §2 diperbaiki); 18 `type` di tabel §3/§4 = 18 `type` di skema; 15 dari 15 contoh negatif ditolak (tanpa `requestId`, field tak dikenal, `v = 2`, `maxParticipants` 1 dan 11, chat 501 karakter, `ROOM_FULL` lewat WS, dll.); 10 dari 10 contoh positif tambahan lolos; `Room`/`Media`/`Participant` dan rentang `MaxParticipants` sama dengan openapi.yaml |
  | Mermaid | `npx -y @mermaid-js/mermaid-cli` untuk 6 blok (5 di architecture.md, 1 di PRD) | 6 dari 6 berhasil di-render, tidak ada "Syntax error" |
  | Tidak ada angka 9 hardcode | `grep -rnE '9 tempat\|maks 9\|maksimal 9\|< 9\|≥ 9 →\|0–9)\|All 9\|const: 10'` (tanpa `archive/`) | Tidak ada temuan kapasitas (satu-satunya hasil: "maksimal 900 detik" Lambda di ADR-0003). Contoh angka 9 yang tersisa diberi label default (AC-1.3.3, §3.2) |
  | Tanpa multi-host / tunjuk controller | `grep -rniE 'co-host\|multi-host\|lebih dari satu host\|tunjuk controller'` | 0 temuan |
  | ID baru | `grep` F-1.8, F-3.6, BR-7, AC-2.5.5, AC-3.3.3 | Masing-masing didefinisikan tepat 1 kali di PRD dan dirujuk konsisten di dokumen lain |
  | Changelog | `grep -c` | PRD: 1 baris `2.0-rc`; ws-messages: 1 baris `v1 draft` |
  | Arsip draft v0 | `sha256sum`; `stat` | Sama: `310f808a…036a36`, 10.939 byte, mtime `2026-10-31 15:39:41 +0700` |
  | Tidak ada commit | `git log`; `git status --short` | "does not have any commits yet"; semua file untracked di dalam repo |

**Keputusan + alasan** (semua masih Proposed sampai freeze Senin)
- Akun AWS baru milik anggota tim (role Platform) lewat "Sign up for AWS (advanced)" dengan **Free plan**; akun penulis draft sebagai cadangan — tidak ada risiko tagihan dan tanggung jawab tidak menumpuk di satu orang ([ADR-0001](adr/0001-aws-account-free-plan.md)).
- Dilarang AWS Organizations / Control Tower / IAM Identity Center — otomatis meng-upgrade Free plan ke Paid plan ([ADR-0001](adr/0001-aws-account-free-plan.md)).
- Region `ap-southeast-1` (Singapore) — region default dengan service lengkap; Jakarta adalah opt-in region dengan perilaku Free plan yang belum pasti, dan selisih latensinya kecil dibanding target 500 ms ([ADR-0002](adr/0002-region.md)).
- Sync lewat API Gateway WebSocket API → Lambda → DynamoDB dengan model berbasis state + optimistic concurrency — Redis Pub/Sub di draft v0 tidak bisa jalan karena Lambda tidak bisa subscribe ([ADR-0003](adr/0003-realtime-sync-architecture.md)).
- Video chat dengan LiveKit OSS di satu EC2 (default t3.small) — Chime SDK tidak tersedia untuk akun dari alur "Sign up for AWS (new)", dan LiveKit memberi biaya tetap yang bisa diprediksi ([ADR-0004](adr/0004-video-chat-livekit.md)).
- Konten hanya film Creative Commons (Blender), transcoding offline dengan ffmpeg, delivery HLS dengan CloudFront signed cookies — menjawab isu hak cipta; signed URL tidak efisien untuk ratusan segmen HLS ([ADR-0005](adr/0005-media-pipeline-content.md)).
- Subdomain `<project_name>.chescloud.my.id` didelegasikan dari Cloudflare ke Route 53 — semua record dan sertifikat bisa dikelola Terraform dengan provider AWS saja ([ADR-0006](adr/0006-dns-domain.md)).
- Host login Cognito, semua peserta memakai room token dari backend, peran dibaca dari DynamoDB — guest tanpa akun, dan grant/revoke/kick langsung berlaku ([ADR-0007](adr/0007-authentication-model.md)).
- Terraform `>= 1.17` + provider `hashicorp/aws ~> 6.70`, state S3 dengan native lockfile, satu environment `prod` — waktu 7 hari dan credits terbatas ([ADR-0008](adr/0008-terraform-state-environments.md)).
- Konvensi nama field JSON: **camelCase** di REST dan WebSocket — cocok dengan TypeScript di frontend; pydantic memakai alias camelCase di backend.
- Node.js 26 LTS untuk build frontend — Active LTS sejak 28 Okt 2026; Node.js 24 sudah Maintenance; Node.js 20 dilarang.
- `ws-messages.schema.json` belum dibuat — akan di-generate oleh Backend dari model pydantic agar skema dan kode tidak berbeda.
- Batas 10 peserta adalah batas keras yang dikunci saat WebSocket `$connect` (counter `connectedGuestCount` dengan conditional write, 1 tempat untuk host) — agar sesuai PRD BR-3 tanpa mengubah perilaku yang tertulis; soft limit di desain lama bisa membuat room > 10 peserta lewat reconnect ([architecture.md §7.4](architecture.md#74-access-patterns) AP-4, AP-14).
- Presence memakai `connectionId` aktif di item peserta, dan `$disconnect` memakai conditional update — koneksi lama (alur `replaced` atau reconnect setelah jaringan putus) tidak boleh menandai peserta yang masih online sebagai keluar (AP-13).
- Room expired saat peserta masih terhubung: timer client dari `room.expiresAtMs` + cek server di setiap pesan masuk — sebelumnya `session.ended` `expired` tidak punya pengirim ([ws-messages.md §4.5](contracts/ws-messages.md)).
- Rate limit tetap fixed window 10 s; AC ditulis per window — cukup satu UpdateItem per pesan, dan lonjakan di batas window diterima.
- `message` di error REST dan WebSocket memakai bahasa Inggris — ditujukan untuk developer; teks UI dipetakan dari `code`.
- Istilah tunggal untuk alur signup: "Sign up for AWS (new)" dan "Sign up for AWS (advanced)" — sesuai istilah di dokumentasi AWS.
- Batas peserta per room menjadi `maxParticipants` (disimpan di `META`, default dan maksimum 10) dari konfigurasi `room_max_participants` → `ROOM_MAX_PARTICIPANTS`, bukan hardcode. Guest maks `maxParticipants − 1` — angka 10 adalah batas teknis/biaya (SFU di satu EC2: ≈ n × (n − 1) stream, 10 orang ≈ 90 stream ≈ 30 Mbps; budget credits), bukan aturan bisnis. Menggantikan keputusan "batas 10 keras" di atas; mekanisme kunci di `$connect` tetap sama.
- F-1.8 (Could): host bisa memilih batas 2–10 saat membuat room. Kontrak `createRoom` sudah menerima `maxParticipants` sekarang — agar tidak perlu desain ulang kontrak saat fitur ini dikerjakan.
- Tepat satu host per room, peran host tidak bisa dipindahkan (BR-6) — keputusan pengguna; tidak dicatat sebagai rencana masa depan.
- Host putus: film tetap jalan, state playback dan peran tidak berubah, host tampil offline (BR-7) — model sync berbasis state tidak butuh host untuk terus berjalan. Usulan "host menunjuk controller dulu" ditolak karena controller juga bisa putus.
- Presence host lewat `participant.updated` (`connected`), guest lewat `participant.joined`/`participant.left` — satu perilaku yang jelas agar host tetap terlihat di daftar.
- Kamera mati tetap bisa melihat dan mendengar peserta lain (AC-3.3.3): token LiveKit memberi `canPublish` dan `canSubscribe` ke semua peserta. F-3.6 (Could): sembunyikan peserta tanpa video.
- `ws-messages.schema.json` sekarang dibuat langsung sebagai salinan mesin dari ws-messages.md (menggantikan rencana "di-generate dari pydantic nanti") — FE butuh skema untuk mock sejak hari 1; model pydantic nanti wajib cocok dengan skema ini.

**Blocker / item terbuka** (target diputuskan Senin 2 Nov 2026, lihat PRD §16.2)
- OQ-1 Nama produk final ("Watch Party" atau "Cinema") — seluruh tim.
- OQ-2 Assignment role dan project lead — seluruh tim.
- OQ-3 Pemilik akun AWS — seluruh tim.
- OQ-4 Subdomain final — Lead + pemilik domain.
- OQ-5 Jumlah environment (`prod` saja atau + `dev`) — Platform + Lead.
- OQ-6 Instance type EC2 LiveKit final — RTC/Media, setelah load test Sab 7 Nov 2026.

**Berikutnya**
- [Seluruh tim] Senin 2 Nov: review PRD 2.0-rc, putuskan OQ-1 s/d OQ-5, isi kolom "Orang" di PRD §11.
- [Product & Tech Lead] Ganti `project_name` jika nama berubah (search-and-replace), ubah status ADR menjadi Accepted, merge, buat tag `prd-v1.0`, kirim permalink ke dosen.
- [Platform] Jalankan [runbooks/bootstrap.md](runbooks/bootstrap.md) termasuk checklist hari 1.
- [Backend + Lead] Review dan freeze contracts (tag `contracts-v1.0`, paling lambat Sel 3 Nov), termasuk alur kapasitas dan presence baru (architecture.md §7.4 AP-4, AP-13, AP-14, AP-15).
- [Platform] Buat file `.github/CODEOWNERS` setelah role di-assign.
- [Backend + FE] Saat implementasi, tambahkan cek CI: pesan dari model pydantic dan mock FE divalidasi terhadap `ws-messages.schema.json`.
- [Penulis draft PRD] Cek baris "Endpoint" di tabel atribut ws-messages.md: ada sisipan gambar `![alt text](image.png)` (file `docs/contracts/image.png`, ±2 MB) yang tampaknya tidak sengaja. **Selesai:** dikonfirmasi tidak sengaja; sisipan dihapus dan file gambar sudah tidak ada di repo.
