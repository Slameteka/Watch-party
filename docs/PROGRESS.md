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

**Keputusan + alasan**
- Pemisahan clean architecture antara core domain/repository dengan Lambda handlers agar handlers tetap tipis dan mudah diuji secara modular.
- Penambahan runner `local_server.py` berbasis mock DynamoDB (moto) agar tim bisa melakukan manual testing dan integrasi cepat tanpa harus menunggu deployment cloud.

**Blocker**
- Tidak ada blocker teknis backend saat ini.

**Berikutnya**
- [Backend] Implementasi modul Terraform backend (`infra/terraform/modules/{data,auth,api,realtime}`).

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
