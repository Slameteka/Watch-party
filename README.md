# Watch Party

> **Catatan:** Nama produk masih nama kerja; difiksasi Senin 2 Nov 2026 (kandidat: "Watch Party" atau "Cinema").

Aplikasi web untuk nonton film bareng secara online. Pemutaran film tersinkron antar peserta, dan di halaman yang sama ada video/audio chat, chat teks, dan emoji reaction. Host membuat room dari katalog film Creative Commons, membagikan link, dan teman-teman bisa langsung join tanpa membuat akun.

Proyek mata kuliah cloud infrastructure (tim 6 orang). Seluruh infrastruktur berjalan di AWS (`ap-southeast-1`, Free plan) dan didefinisikan dengan Terraform.

- **URL produksi:** `https://<project_name>.chescloud.my.id` (contoh `https://watchparty.chescloud.my.id`) — aktif setelah M1.
- **Status:** PRD 2.0-rc, menuju freeze `prd-v1.0` (Senin 2 Nov 2026). Target rilis v1.0: Minggu 8 Nov 2026.

## Arsitektur Singkat

| Bagian | Teknologi |
|---|---|
| Web app | React + Vite + TypeScript di S3 + CloudFront |
| Film | HLS (360p–1080p) di S3 + CloudFront, dilindungi signed cookies |
| REST API | API Gateway HTTP API + Lambda (Python) |
| Sync, chat, reaction | API Gateway WebSocket API + Lambda + DynamoDB |
| Video chat | LiveKit OSS di satu EC2 |
| Login host | Amazon Cognito |
| DNS & TLS | Route 53 (subdomain didelegasikan dari Cloudflare) + ACM |
| IaC | Terraform |

Detail lengkap di [docs/architecture.md](docs/architecture.md).

## Dokumentasi

| Dokumen | Isi |
|---|---|
| [docs/PRD-watch-party.md](docs/PRD-watch-party.md) | Product Requirements Document (apa & kenapa) |
| [docs/architecture.md](docs/architecture.md) | Arsitektur teknis, data model, limit, keamanan, biaya, Terraform |
| [docs/adr/](docs/adr/README.md) | Architecture Decision Records |
| [docs/contracts/openapi.yaml](docs/contracts/openapi.yaml) | Kontrak REST API (OpenAPI 3.1) |
| [docs/contracts/ws-messages.md](docs/contracts/ws-messages.md) | Kontrak pesan WebSocket |
| [docs/contracts/ws-messages.schema.json](docs/contracts/ws-messages.schema.json) | JSON Schema (draft 2020-12) untuk pesan WebSocket |
| [docs/runbooks/bootstrap.md](docs/runbooks/bootstrap.md) | Langkah manual satu kali (akun, budget, state, DNS) |
| [docs/PROGRESS.md](docs/PROGRESS.md) | Log harian proyek |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Aturan kerja tim |
| [AGENTS.md](AGENTS.md) | Aturan untuk AI agent |

## Struktur Repo

```text
docs/              dokumentasi
infra/terraform/   modul dan environment Terraform
backend/           Lambda Python
frontend/          SPA React
media/scripts/     script ffmpeg → HLS → S3
```

Folder `infra/`, `backend/`, `frontend/`, dan `media/` dibuat saat implementasi dimulai (mulai Senin 2 Nov 2026).

## Mulai Berkontribusi

1. Baca [docs/PROGRESS.md](docs/PROGRESS.md) dan [CONTRIBUTING.md](CONTRIBUTING.md).
2. Cek role dan modul milikmu di PRD §11.
3. Kerjakan di branch pendek, buka PR dengan template, minta 1 reviewer.

## Lisensi Konten

Film di katalog adalah Blender open movies berlisensi Creative Commons. Atribusi ditampilkan di katalog aplikasi.
